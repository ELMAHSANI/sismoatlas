"""
Séismes récents → fichiers GeoJSON légers servis au site (lancé toutes les 15 min par GitHub Actions).

Maroc + alentours (CLAUDE.md §4.4), 30 derniers jours :
  EMSC (agence de référence : relaie l'IGN espagnol et les agences régionales) + USGS, fusionnés et dédoublonnés,
  enrichis de la ville la plus proche → public/data/live/{24h,7d,30d}.geojson
Monde, M ≥ 6, 1 an :
  USGS, avec niveau d'impact PAGER et indicateur tsunami → public/data/world/{7d,30d,1y}.geojson

Robustesse : si une source principale est indisponible, les fichiers existants sont conservés tels quels
(on ne publie jamais une liste vide par erreur) et le script se termine avec le code 1.
"""
from __future__ import annotations

import argparse
import sys
from datetime import timedelta

from common import PUBLIC_DATA, feature, feature_collection, iso_utc, rel, write_json_atomic
from sources import (
    MERGE_MAX_KM, MERGE_MAX_SECONDS, SourceError, days_ago, depth_class, fetch_emsc, fetch_usgs, in_canaries,
    merge_duplicates, nearest_city, utc_now,
)

LIVE_DIR = PUBLIC_DATA / "live"
WORLD_DIR = PUBLIC_DATA / "world"
LIVE_WINDOWS = {"24h": 1, "7d": 7, "30d": 30}
WORLD_WINDOWS = {"7d": 7, "30d": 30, "1y": 365}
WORLD_MIN_MAG = 6.0
NEAR_MIN_POP = 5_000        # ville la plus proche (repère local)
NEAR_MAJOR_MIN_POP = 100_000  # grande ville la plus proche (repère connu de tous)

ATTRIBUTION = "Données : EMSC-CSEM, USGS ; villes : GeoNames (CC BY 4.0). Données préliminaires, révisables."


def live_props(e: dict) -> dict:
    return {
        "id": e["id"],
        "time": iso_utc(e["time"]),
        "mag": e["mag"],
        "magType": e["mag_type"] or None,
        "depth": e["depth_km"],
        "depthClass": depth_class(e["depth_km"]),
        "agency": e["agency"] or None,
        "source": e["source"],
        "otherIds": e["other_ids"] or None,
        "region": e["region"] or None,
        "url": e["url"] or None,
        "emscId": e.get("source_id") if e["source"] == "EMSC" else None,
        "near": nearest_city(e["lat"], e["lon"], NEAR_MIN_POP),
        "nearMajor": nearest_city(e["lat"], e["lon"], NEAR_MAJOR_MIN_POP),
        "canaries": in_canaries(e["lat"], e["lon"]) or None,
        "updated": e["updated"] or None,
    }


def world_props(e: dict) -> dict:
    return {
        "id": e["id"],
        "time": iso_utc(e["time"]),
        "mag": e["mag"],
        "magType": e["mag_type"] or None,
        "depth": e["depth_km"],
        "place": e["region"] or None,
        "alert": e.get("alert"),       # PAGER : green / yellow / orange / red / null
        "tsunami": bool(e.get("tsunami")),
        "sig": e.get("sig"),
        "status": e.get("status"),
        "url": e["url"] or None,
    }


def clean(props: dict) -> dict:
    return {k: v for k, v in props.items() if v is not None}


def write_windows(directory, events, windows, props_fn, meta_base) -> dict:
    now = utc_now()
    counts = {}
    for name, days in windows.items():
        since = now - timedelta(days=days)
        sel = [e for e in events if e["time"] >= since]
        feats = [feature(e["lon"], e["lat"], clean(props_fn(e)), e["depth_km"]) for e in sel]
        meta = {**meta_base, "window": name, "since": iso_utc(since), "count": len(feats)}
        write_json_atomic(directory / f"{name}.geojson", feature_collection(feats, meta))
        counts[name] = len(feats)
    return counts


def run_live() -> bool:
    start, end = days_ago(30), utc_now() + timedelta(minutes=5)
    status = {}
    try:
        emsc = [e for e in fetch_emsc(start, end) if e["evtype"] in ("", "ke", "se")]  # séismes (pas d'explosions)
        status["EMSC"] = f"ok ({len(emsc)})"
    except SourceError as err:
        print(f"[live] EMSC indisponible : {err} — fichiers existants conservés", file=sys.stderr)
        return False
    try:
        usgs = fetch_usgs(start, end)
        status["USGS"] = f"ok ({len(usgs)})"
    except SourceError as err:
        usgs = []
        status["USGS"] = "indisponible"
        print(f"[live] USGS indisponible : {err} — on continue avec l'EMSC seul", file=sys.stderr)
    events, merged = merge_duplicates(emsc, usgs)
    meta = {
        "generated": iso_utc(utc_now()), "area": "Maroc + alentours (20–38 °N, 18 °W–1 °E)",
        "sources": status, "duplicatesMerged": merged,
        "mergeRule": f"même séisme si écart ≤ {MERGE_MAX_SECONDS} s et ≤ {MERGE_MAX_KM} km ; EMSC prioritaire",
        "attribution": ATTRIBUTION,
    }
    counts = write_windows(LIVE_DIR, events, LIVE_WINDOWS, live_props, meta)
    print(f"[live] {counts} (EMSC {len(emsc)}, USGS {len(usgs)}, fusionnés {merged}) → {rel(LIVE_DIR)}/")
    return True


def run_world() -> bool:
    try:
        events = fetch_usgs(days_ago(365), utc_now() + timedelta(minutes=5), bbox=None, min_mag=WORLD_MIN_MAG)
    except SourceError as err:
        print(f"[world] USGS indisponible : {err} — fichiers existants conservés", file=sys.stderr)
        return False
    events.sort(key=lambda e: e["time"], reverse=True)
    meta = {"generated": iso_utc(utc_now()), "minMagnitude": WORLD_MIN_MAG, "source": "USGS ANSS ComCat",
            "attribution": "Données : USGS (PAGER, tsunami). Données préliminaires, révisables."}
    counts = write_windows(WORLD_DIR, events, WORLD_WINDOWS, world_props, meta)
    print(f"[world] {counts} → {rel(WORLD_DIR)}/")
    return True


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--only", choices=["live", "world"], help="ne traiter qu'une partie")
    args = p.parse_args()
    ok = True
    if args.only in (None, "live"):
        ok &= run_live()
    if args.only in (None, "world"):
        ok &= run_world()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
