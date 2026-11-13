"""
Données de la page « Carte complète » (phase 7) → public/data/catalogue/ et public/data/sig/plates.geojson

Formats compacts (une ligne = un séisme) pour limiter le poids téléchargé ; le navigateur les reconstitue :
  reference.json   catalogue de référence Peláez et al. (2007), 1045–2005
                   [lon, lat, Mw, profondeur, année décimale, date, heure, agence, Imax, lieu, id]
  recent-m2.json   sismicité depuis 2006, M ≥ 2 ou magnitude inconnue
  recent-small.json  sismicité depuis 2006, M < 2 (chargé seulement si l'utilisateur le demande)
                   [lon, lat, mag, profondeur, minutes depuis 1970, agence, type de magnitude, id, Canaries]
                   id : « e0000250 » = EMSC avec la date du séisme (20230908_0000250),
                        « E20080919_0000060 » = EMSC complet, « u… » = USGS
  plates.geojson   limites de plaques (Bird, 2003 ; données ODC-By 1.0, conversion Ahlenius/Nordpil)
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timezone

import geopandas as gpd
import requests
from shapely.geometry import box

from common import CACHE, DATA, PUBLIC_DATA, USER_AGENT, now_utc, rel, write_json_atomic

OUT = PUBLIC_DATA / "catalogue"
PLATES_URL = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json"
PLATES_BOX = box(-35, 10, 20, 50)  # un peu plus large que la zone d'étude


def f(v: str, nd: int = 3):
    try:
        return round(float(v), nd)
    except (TypeError, ValueError):
        return None


def decimal_year(date: str, time: str | None = None) -> float:
    parts = [int(p) for p in date.split("-")]
    y, m, d = parts[0], (parts[1] if len(parts) > 1 else 6), (parts[2] if len(parts) > 2 else 15)
    start = datetime(y, 1, 1)
    day = (datetime(y, m, d) - start).days
    if time:
        hh, mm = (int(x) for x in time.split(":")[:2])
        day += (hh * 60 + mm) / 1440
    days_in_year = (datetime(y + 1, 1, 1) - start).days
    return round(y + day / days_in_year, 4)


def reference() -> dict:
    agencies: list[str] = []
    rows = []
    for name, mag_col, place_col in (("historique.csv", "magnitude_estimee", "zone_affectee"), ("instrumental.csv", "magnitude", "lieu")):
        with (DATA / "catalogue" / name).open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                ag = r["agence"]
                if ag not in agencies:
                    agencies.append(ag)
                time = r.get("heure_utc") or ""
                rows.append([
                    f(r["longitude"]), f(r["latitude"]), f(r[mag_col], 1), f(r.get("profondeur_km") or "", 1),
                    decimal_year(r["date"], time or None), r["date"], time[:5], agencies.index(ag),
                    f(r.get("intensite_max") or "", 1), r[place_col], r["id"],
                ])
    rows.sort(key=lambda x: x[4])
    return {"fields": ["lon", "lat", "mag", "depth", "year", "date", "time", "agency", "imax", "place", "id"],
            "agencies": agencies, "source": "Peláez et al. (2007), doi:10.1785/gssrl.78.6.614", "rows": rows}


def compact_id(full: str, date: str) -> str:
    src, _, ident = full.partition(":")
    if src == "emsc":
        day, _, num = ident.partition("_")
        return f"e{num}" if day == date.replace("-", "") else f"E{ident}"
    return f"u{ident}"


def recent() -> tuple[dict, dict]:
    agencies: list[str] = []
    types: list[str] = []
    big, small = [], []
    with (DATA / "catalogue" / "recent_2006.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            ag, mt = r["agence"], (r["type_magnitude"] or "").lower()
            if ag not in agencies:
                agencies.append(ag)
            if mt not in types:
                types.append(mt)
            t = datetime.fromisoformat(f"{r['date']}T{r['heure_utc'].split('.')[0]}").replace(tzinfo=timezone.utc)
            mag = f(r["magnitude"], 1)
            row = [f(r["longitude"]), f(r["latitude"]), mag, f(r["profondeur_km"], 1), int(t.timestamp() // 60),
                   agencies.index(ag), types.index(mt), compact_id(r["id"], r["date"]), 1 if "Canaries" in r["remarques"] else 0]
            (small if mag is not None and mag < 2 else big).append(row)
    meta = {"fields": ["lon", "lat", "mag", "depth", "minutes", "agency", "magType", "id", "canaries"],
            "agencies": agencies, "magTypes": types, "source": "EMSC-CSEM + USGS (pipeline/fetch_recent_catalogue.py)"}
    return {**meta, "rows": big}, {**meta, "rows": small}


def plates() -> int:
    cache = CACHE / "plates" / "PB2002_boundaries.json"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(PLATES_URL, headers={"User-Agent": USER_AGENT}, timeout=120)
        r.raise_for_status()
        cache.write_bytes(r.content)
    gdf = gpd.read_file(cache)
    gdf = gdf[gdf.intersects(PLATES_BOX)].copy()
    gdf["geometry"] = gdf.geometry.intersection(PLATES_BOX)
    keep = [c for c in ("Name", "Type", "PlateA", "PlateB") if c in gdf.columns]
    out = PUBLIC_DATA / "sig" / "plates.geojson"
    gdf[keep + ["geometry"]].to_file(out, driver="GeoJSON", engine="pyogrio", COORDINATE_PRECISION=4)
    return len(gdf)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ref = reference()
    write_json_atomic(OUT / "reference.json", ref)
    big, small = recent()
    write_json_atomic(OUT / "recent-m2.json", big)
    write_json_atomic(OUT / "recent-small.json", small)
    n_plates = plates()
    write_json_atomic(OUT / "index.json", {
        "generated": now_utc().isoformat(timespec="seconds"),
        "reference": len(ref["rows"]), "recentM2": len(big["rows"]), "recentSmall": len(small["rows"]), "plates": n_plates,
    }, compact=False)
    for name in ("reference.json", "recent-m2.json", "recent-small.json"):
        print(f"{rel(OUT / name)} : {(OUT / name).stat().st_size // 1024} Ko")
    print(f"limites de plaques : {n_plates} segments → public/data/sig/plates.geojson")


if __name__ == "__main__":
    main()
