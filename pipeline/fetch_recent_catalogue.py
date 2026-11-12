"""
Catalogue « Sismicité depuis 2006 » (couche 2 de la stratégie, CLAUDE.md §4.2) → data/catalogue/recent_2006.csv

Prolonge le catalogue de référence Peláez et al. (2007), qui s'arrête fin 2005, avec les catalogues en ligne :
EMSC (agence de référence, relaie l'IGN espagnol) + USGS, zone Maroc + alentours, fusionnés et dédoublonnés.
Contrairement au catalogue de référence, ce catalogue contient TOUS les séismes (répliques comprises) et des
magnitudes de types différents : les deux ne sont pas directement comparables.

Sorties : data/catalogue/recent_2006.csv, data/catalogue/RAPPORT_RECENT.md
Usage   : python pipeline/fetch_recent_catalogue.py [--start 2006-01-01]
Relançable : la période entière est retéléchargée (les agences révisent leurs solutions).
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

from common import DATA, now_utc, rel
from import_catalogue import INSTRUMENTAL_COLS
from sources import (
    MERGE_MAX_KM, MERGE_MAX_SECONDS, SourceError, depth_class, fetch_emsc, fetch_usgs, in_canaries, merge_duplicates,
    nearest_city,
)

OUT = DATA / "catalogue"


def year_chunks(start: datetime, end: datetime):
    cur = start
    while cur < end:
        nxt = min(datetime(cur.year + 1, 1, 1, tzinfo=timezone.utc), end)
        yield cur, nxt
        cur = nxt


def to_row(e: dict) -> dict:
    t = e["time"]
    near = nearest_city(e["lat"], e["lon"], 5_000)
    remarks = []
    if e["other_ids"]:
        remarks.append("autres identifiants : " + ", ".join(e["other_ids"]))
    if in_canaries(e["lat"], e["lon"]):
        remarks.append("îles Canaries")
    return {
        "id": e["id"],
        "date": t.strftime("%Y-%m-%d"),
        "heure_utc": t.strftime("%H:%M:%S") + (f".{t.microsecond // 100000}" if t.microsecond else ""),
        "latitude": f"{e['lat']:.4f}",
        "longitude": f"{e['lon']:.4f}",
        "profondeur_km": "" if e["depth_km"] is None else f"{e['depth_km']:.1f}",
        "magnitude": "" if e["mag"] is None else f"{e['mag']:.1f}",
        "type_magnitude": e["mag_type"],
        "agence": e["agency"] or e["source"],
        "id_agence": e.get("source_id") or "",
        "lieu": f"{near['km']} km {near['dir']} {near['fr']}" if near else e["region"],
        "province": "", "region": "",
        "intensite_max": "", "echelle_intensite": "",
        "victimes": "", "blesses": "",
        "tsunami": "1" if e.get("tsunami") else "",
        "source_ref": e["source"].lower(),
        "remarques": " ; ".join(remarks),
        "magnitude_origine": "", "type_magnitude_origine": "", "code_mw": "",
        "catalogue": "recent_2006",
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--start", default="2006-01-01")
    args = p.parse_args()
    start = datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc)
    end = now_utc()

    emsc, per_year = [], {}
    try:
        for a, b in year_chunks(start, end):
            chunk = [e for e in fetch_emsc(a, b) if e["evtype"] in ("", "ke", "se")]
            per_year[a.year] = len(chunk)
            emsc += chunk
            print(f"EMSC {a.year} : {len(chunk)}")
        usgs = fetch_usgs(start, end)
        print(f"USGS {start.year}–{end.year} : {len(usgs)}")
    except SourceError as err:
        print(f"Source indisponible : {err} — fichier existant conservé", file=sys.stderr)
        sys.exit(1)

    # Doublons internes à l'EMSC (même identifiant) puis fusion EMSC / USGS
    seen, emsc_unique = set(), []
    for e in emsc:
        if e["id"] not in seen:
            seen.add(e["id"])
            emsc_unique.append(e)
    events, merged = merge_duplicates(emsc_unique, usgs)
    events.sort(key=lambda e: e["time"])
    rows = [to_row(e) for e in events]

    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "recent_2006.csv.tmp"
    with tmp.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=INSTRUMENTAL_COLS, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    tmp.replace(OUT / "recent_2006.csv")

    # Rapport
    n = len(events)
    no_mag = sum(1 for e in events if e["mag"] is None)
    no_depth = sum(1 for e in events if e["depth_km"] is None)
    canaries = sum(1 for e in events if in_canaries(e["lat"], e["lon"]))
    lines = [
        "# Rapport — catalogue « Sismicité depuis 2006 »\n",
        f"*Généré le {now_utc():%d/%m/%Y à %H:%M} UTC par `pipeline/fetch_recent_catalogue.py`.*\n",
        f"Période : {start:%d/%m/%Y} → {end:%d/%m/%Y}. Zone : 20–38 °N, 18 °W–1 °E.\n",
        "## Volumes\n",
        f"- EMSC : {len(emsc_unique)} séismes ; USGS : {len(usgs)}",
        f"- Doublons EMSC/USGS fusionnés (≤ {MERGE_MAX_SECONDS} s et ≤ {MERGE_MAX_KM} km, EMSC prioritaire) : {merged}",
        f"- **Total : {n}** séismes → `{rel(OUT / 'recent_2006.csv')}`",
        f"- dont îles Canaries : {canaries} (signalés dans `remarques`, à écarter des statistiques « Maroc »)",
        "",
        "**Par année (EMSC)** : " + ", ".join(f"{y} : {c}" for y, c in per_year.items()) + "\n",
        "## Qualité\n",
        f"- Sans magnitude : {no_mag} ; sans profondeur : {no_depth}",
        "- Types de magnitude : " + ", ".join(f"{t or '?'} {c}" for t, c in Counter(e['mag_type'].lower() for e in events).most_common(10)),
        "- Agences d'origine (EMSC) : " + ", ".join(f"{a or '?'} {c}" for a, c in Counter(e['agency'] for e in emsc_unique).most_common(10)),
        "- Classes de profondeur : " + ", ".join(f"{k} {c}" for k, c in Counter(depth_class(e['depth_km']) for e in events).most_common()),
        "",
        "## À savoir\n",
        "- Catalogue **complet** (répliques comprises), contrairement au catalogue de référence 1045–2005 (déclusterisé).",
        "- Magnitudes de types différents (ml, mb, mbLg, Mw…) : elles ne sont pas converties en Mw ici.",
        "- Le nombre annuel de séismes varie fortement selon les années (voir ci-dessus) : il dépend des réseaux "
        "et de la façon dont l'EMSC agrège les petits séismes des agences, pas seulement de l'activité réelle. "
        "Pour une série homogène (statistiques, V2), compléter avec le catalogue de l'IGN espagnol et filtrer "
        "au-dessus d'une magnitude de complétude.",
        "- Codes d'agence EMSC : MDD = IGN Madrid ; INMG / IPMA = Portugal ; CNRST = Maroc ; CRAAG / ALG = Algérie.",
        "",
    ]
    (OUT / "RAPPORT_RECENT.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{n} séismes → {rel(OUT / 'recent_2006.csv')}")


if __name__ == "__main__":
    main()
