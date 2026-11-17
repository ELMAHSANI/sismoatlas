"""
Import du catalogue de référence Peláez et al. (2007) → data/catalogue/

Entrée  : donnees_brutes/excel/moroccan_catalog1045_2005.xls (feuille « Catalog », lecture seule)
Sorties : data/catalogue/historique.{csv,geojson}    séismes avant 1900
          data/catalogue/instrumental.{csv,geojson}  séismes 1900–2005 (couche « catalogue de référence »)
          data/catalogue/sources.csv
          data/catalogue/RAPPORT_QUALITE.md

Choix (voir CLAUDE.md §4.2 et data/RAPPORT_ANALYSE.md §6–7) :
- historique = avant 1900 ; instrumental = 1900 et après ;
- magnitude = Mw unifiée par les auteurs ; magnitude et type d'origine conservés dans des colonnes en plus ;
- rien n'est inventé : les champs absents du fichier restent vides.

Relançable sans risque : les sorties sont réécrites à chaque exécution.
"""
from __future__ import annotations

import argparse
import csv
import math
from collections import Counter
from datetime import date
from pathlib import Path

import xlrd

from common import DATA, RAW, feature, feature_collection, haversine_km, now_utc, rel, write_json_atomic

SRC = RAW / "excel" / "moroccan_catalog1045_2005.xls"
OUT = DATA / "catalogue"
SOURCE_REF = "pelaez2007"
INSTRUMENTAL_FROM_YEAR = 1900
# Zone annoncée par les auteurs : 27–37 °N, 15 °W–1 °E (petite marge pour les arrondis)
PELAEZ_ZONE = (26.9, 37.1, -15.1, 1.1)

# Feuille « Explanation » du fichier : méthode d'obtention de la Mw
MW_CODE = {
    1: "Mw publiée",
    2: "Mw calculée à partir des intensités (Bakun et Wentworth, 1997, 1999)",
    3: "Mw convertie depuis Ms",
    4: "Mw convertie depuis mbLg",
    5: "Mw convertie depuis mb",
    6: "Mw convertie depuis ML",
    7: "Mw convertie depuis Imax",
    8: "Mw convertie depuis MD",
    9: "Mw d'après l'intensité épicentrale réévaluée (épicentre en mer)",
}
AGENCY_NAMES = {
    "HIST": "Données historiques (El Mrabet, 2005)",
    "IGN": "Instituto Geográfico Nacional (Madrid, Espagne)",
    "CRAAG": "CRAAG (Alger, Algérie)",
    "IMGP": "Instituto de Meteorologia (Lisbonne, Portugal)",
    "SPGM": "Service de Physique du Globe (Rabat, Maroc)",
    "BCIS": "Bureau Central International de Sismologie (Strasbourg)",
    "ISC": "International Seismological Centre (Royaume-Uni)",
    "NEIC": "National Earthquake Information Center (USGS, États-Unis)",
}

PRECISION_FR = {"annee": "à l'année", "mois": "au mois", "jour": "au jour", "heure": "à l'heure", "minute": "à la minute"}

INSTRUMENTAL_COLS = [
    "id", "date", "heure_utc", "latitude", "longitude", "profondeur_km", "magnitude", "type_magnitude",
    "agence", "id_agence", "lieu", "province", "region", "intensite_max", "echelle_intensite",
    "victimes", "blesses", "tsunami", "source_ref", "remarques",
    # colonnes en plus (informations du fichier d'origine)
    "magnitude_origine", "type_magnitude_origine", "code_mw", "catalogue",
]
HISTORIQUE_COLS = [
    "id", "date", "precision_date", "zone_affectee", "latitude", "longitude", "precision_localisation_km",
    "intensite_epicentrale", "magnitude_estimee", "methode_magnitude", "description_effets", "victimes",
    "fiabilite", "source_ref",
    # colonnes en plus
    "heure_utc", "intensite_max", "echelle_intensite", "agence", "magnitude_origine", "type_magnitude_origine",
    "code_mw", "catalogue",
]
SOURCES_COLS = ["id", "type", "citation", "doi", "url", "licence", "remarques"]
SOURCES = [
    {
        "id": "pelaez2007", "type": "catalogue",
        "citation": "Peláez J. A., Chourak M., Tadili B. A., Aït Brahim L., Hamdache M., López Casado C., "
                    "Martínez Solares J. M. (2007). A Catalog of Main Moroccan Earthquakes from 1045 to 2005. "
                    "Seismological Research Letters 78(6), 614–621.",
        "doi": "10.1785/gssrl.78.6.614", "url": "",
        "licence": "[À COMPLÉTER : conditions de réutilisation à demander aux auteurs]",
        "remarques": "Fichier original moroccan_catalog1045_2005.xls, version septembre 2007 (Université de Jaén). "
                     "Catalogue déclusterisé (Gardner et Knopoff, 1974), Mw ≥ 3,0, zone 27–37 °N / 15 °W–1 °E.",
    },
    {
        "id": "gardner_knopoff1974", "type": "méthode",
        "citation": "Gardner J. K., Knopoff L. (1974). Is the sequence of earthquakes in Southern California, "
                    "with aftershocks removed, Poissonian? Bulletin of the Seismological Society of America 64, 1363–1367.",
        "doi": "", "url": "", "licence": "", "remarques": "Méthode de déclusterisation utilisée par Peláez et al. (2007).",
    },
    {
        "id": "emsc", "type": "agence",
        "citation": "EMSC-CSEM, Centre sismologique euro-méditerranéen, service FDSN « seismicportal ».",
        "doi": "", "url": "https://www.seismicportal.eu/",
        "licence": "CC BY 4.0 (https://www.seismicportal.eu/terms.html)",
        "remarques": "Relaie notamment les solutions de l'IGN (Espagne) pour la zone.",
    },
    {
        "id": "usgs", "type": "agence",
        "citation": "U.S. Geological Survey, Earthquake Hazards Program, catalogue ANSS ComCat (service FDSN).",
        "doi": "", "url": "https://earthquake.usgs.gov/",
        "licence": "Domaine public (données du gouvernement fédéral américain)",
        "remarques": "Grands séismes mondiaux, niveaux PAGER, indicateur tsunami.",
    },
    {
        "id": "geonames", "type": "référentiel",
        "citation": "GeoNames, base de données géographique (cities1000 et noms alternatifs).",
        "doi": "", "url": "https://www.geonames.org/",
        "licence": "CC BY 4.0", "remarques": "Liste des villes de référence (pipeline/build_cities.py).",
    },
]


def num(v) -> float | None:
    """Convertit une cellule (nombre ou texte) en nombre ; None si vide."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def coord(cell_type: int, value) -> float | None:
    """Coordonnée : nombre = millièmes de degré ; texte = degrés (ex. « -0.600 » près du méridien 0)."""
    if cell_type == xlrd.XL_CELL_TEXT:
        return num(value)
    if cell_type == xlrd.XL_CELL_NUMBER:
        return value / 1000.0
    return None


def fmt(v: float | None, nd: int = 3) -> str:
    if v is None:
        return ""
    s = f"{v:.{nd}f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def read_rows(path: Path) -> list[dict]:
    sheet = xlrd.open_workbook(str(path)).sheet_by_name("Catalog")
    header = [str(h).strip() for h in sheet.row_values(0)]
    rows = []
    for r in range(1, sheet.nrows):
        raw = {h: sheet.cell_value(r, c) for c, h in enumerate(header)}
        types = {h: sheet.cell_type(r, c) for c, h in enumerate(header)}
        rows.append({
            "row": r + 1,  # numéro de ligne Excel
            "agency": str(raw["agency"]).strip(),
            "year": int(raw["year"]),
            "month": int(raw["mnth"]) if num(raw["mnth"]) else None,
            "day": int(raw["day"]) if num(raw["day"]) else None,
            "hour": int(raw["hour"]) if num(raw["hour"]) is not None and str(raw["hour"]).strip() != "" else None,
            "minute": int(raw["min"]) if num(raw["min"]) is not None and str(raw["min"]).strip() != "" else None,
            "second": num(raw["sec"]),
            "lon": coord(types["longitude"], raw["longitude"]),
            "lat": coord(types["latitude"], raw["latitude"]),
            "depth": num(raw["depth"]),
            "mag_orig": num(raw["mag."]),
            "mag_type": str(raw["type"]).strip(),
            "imax": num(raw["int."]),
            "location": str(raw["location"]).strip(),
            "mw": num(raw["Mw"]),
            "code": int(raw["code"]) if num(raw["code"]) is not None else None,
        })
    return rows


def iso_date(e: dict) -> tuple[str, str]:
    """Date ISO (éventuellement partielle) et sa précision."""
    y, m, d = e["year"], e["month"], e["day"]
    if m is None:
        return f"{y:04d}", "annee"
    if d is None:
        return f"{y:04d}-{m:02d}", "mois"
    precision = "jour"
    if e["hour"] is not None:
        precision = "heure"
    if e["minute"] is not None:
        precision = "minute"
    if e["second"] is not None:
        precision = "seconde"
    return f"{y:04d}-{m:02d}-{d:02d}", precision


def iso_time(e: dict) -> str:
    if e["hour"] is None:
        return ""
    t = f"{e['hour']:02d}:{(e['minute'] or 0):02d}"
    if e["second"] is not None:
        whole = int(e["second"])
        frac = round(e["second"] - whole, 1)
        t += f":{whole:02d}" + (f"{frac:.1f}"[1:] if frac else "")
    return t


def build(rows: list[dict]) -> tuple[list[dict], list[dict], list[str]]:
    issues: list[str] = []
    historique, instrumental = [], []
    for i, e in enumerate(rows, start=1):
        eid = f"PEL-{i:04d}"
        d, precision = iso_date(e)
        imax = fmt(e["imax"], 1)
        common = {
            "id": eid,
            "date": d,
            "latitude": fmt(e["lat"], 3),
            "longitude": fmt(e["lon"], 3),
            "intensite_max": imax,
            "echelle_intensite": "EMS-98" if imax else "",
            "agence": e["agency"],
            "magnitude_origine": fmt(e["mag_orig"], 1),
            "type_magnitude_origine": e["mag_type"],
            "code_mw": str(e["code"] or ""),
            "source_ref": SOURCE_REF,
            "catalogue": "reference_1045_2005",
            "heure_utc": iso_time(e),
        }
        if e["year"] < INSTRUMENTAL_FROM_YEAR:
            historique.append({
                **common,
                "precision_date": precision,
                "zone_affectee": e["location"],
                "precision_localisation_km": "",
                "intensite_epicentrale": "",
                "magnitude_estimee": fmt(e["mw"], 1),
                "methode_magnitude": MW_CODE.get(e["code"], ""),
                "description_effets": "",
                "victimes": "",
                "fiabilite": "",
            })
        else:
            remarks = [MW_CODE.get(e["code"], "")]
            if e["mag_orig"] is not None and e["mag_type"]:
                remarks.append(f"magnitude d'origine {fmt(e['mag_orig'], 1)} {e['mag_type']}")
            if precision != "seconde":
                remarks.append("date/heure précise " + PRECISION_FR[precision])
            instrumental.append({
                **common,
                "profondeur_km": fmt(e["depth"], 1),
                "magnitude": fmt(e["mw"], 1),
                "type_magnitude": "Mw",
                "id_agence": "",
                "lieu": e["location"],
                "province": "",
                "region": "",
                "victimes": "",
                "blesses": "",
                "tsunami": "",
                "remarques": " ; ".join(r for r in remarks if r),
            })
    return historique, instrumental, issues


def quality(rows: list[dict], historique: list[dict], instrumental: list[dict]) -> str:
    n = len(rows)
    lines: list[str] = []
    add = lines.append
    add("# Rapport de qualité — import du catalogue de référence\n")
    add(f"*Généré le {now_utc():%d/%m/%Y à %H:%M} UTC par `pipeline/import_catalogue.py`.*\n")
    add(f"**Source** : `{rel(SRC)}` (Peláez et al., 2007, version septembre 2007), feuille « Catalog ».\n")

    add("## Volumes\n")
    add("| | Lignes |\n|---|---|")
    add(f"| Lues dans le fichier | {n} |")
    add(f"| Historique (avant {INSTRUMENTAL_FROM_YEAR}) → `historique.csv` | {len(historique)} |")
    add(f"| Instrumental ({INSTRUMENTAL_FROM_YEAR}–2005) → `instrumental.csv` | {len(instrumental)} |")
    add("")
    add("L'article annonce 1 739 séismes principaux ; le fichier en contient "
        f"{n}. [À COMPLÉTER : écart d'une ligne à expliquer avec les auteurs]\n")

    add("## Valeurs aberrantes\n")
    bad = []
    lat0, lat1, lon0, lon1 = PELAEZ_ZONE
    for i, e in enumerate(rows, start=1):
        pid = f"PEL-{i:04d} (ligne Excel {e['row']})"
        if e["lat"] is None or e["lon"] is None:
            bad.append(f"{pid} : coordonnées manquantes")
        elif not (lat0 <= e["lat"] <= lat1 and lon0 <= e["lon"] <= lon1):
            bad.append(f"{pid} : hors de la zone de l'article ({e['lat']}, {e['lon']})")
        if e["mw"] is None:
            bad.append(f"{pid} : Mw manquante")
        elif not 3.0 <= e["mw"] <= 9.0:
            bad.append(f"{pid} : Mw hors de [3 ; 9] ({e['mw']})")
        if e["depth"] is not None and not 0 <= e["depth"] <= 700:
            bad.append(f"{pid} : profondeur hors de [0 ; 700] km ({e['depth']})")
        if e["month"] and e["day"]:
            try:
                date(e["year"], e["month"], e["day"])
            except ValueError:
                bad.append(f"{pid} : date invalide {e['year']}-{e['month']}-{e['day']}")
        if e["hour"] is not None and not 0 <= e["hour"] <= 23:
            bad.append(f"{pid} : heure invalide ({e['hour']})")
        if e["minute"] is not None and not 0 <= e["minute"] <= 59:
            bad.append(f"{pid} : minute invalide ({e['minute']})")
        if e["second"] is not None and not 0 <= e["second"] < 60:
            bad.append(f"{pid} : seconde invalide ({e['second']})")
    if bad:
        add(f"{len(bad)} anomalie(s) :\n")
        lines.extend(f"- {b}" for b in bad)
    else:
        add("Aucune : toutes les coordonnées sont dans la zone de l'article (27–37 °N, 15 °W–1 °E), "
            "toutes les Mw entre 3 et 9, profondeurs entre 0 et 700 km, dates et heures valides.")
    add("")

    add("## Doublons\n")
    keys = Counter((e["year"], e["month"], e["day"], e["hour"], e["minute"], e["lat"], e["lon"]) for e in rows)
    exact = sum(c - 1 for c in keys.values() if c > 1)
    add(f"- Doublons exacts (même date, heure, minute et position) : **{exact}**.")
    near = []
    timed = [e for e in rows if e["month"] and e["day"] and e["hour"] is not None and e["minute"] is not None]
    for a_i, a in enumerate(timed):
        ta = (a["year"], a["month"], a["day"], a["hour"] * 60 + a["minute"])
        for b in timed[a_i + 1:]:
            tb = (b["year"], b["month"], b["day"], b["hour"] * 60 + b["minute"])
            if ta[:3] == tb[:3] and abs(ta[3] - tb[3]) <= 1 and haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) <= 30:
                near.append((a, b))
    add(f"- Quasi-doublons (≤ 1 min et ≤ 30 km) : **{len(near)}**.")
    for a, b in near[:20]:
        add(f"  - {a['year']}-{a['month']:02d}-{a['day']:02d} {a['hour']:02d}:{a['minute']:02d} "
            f"({a['agency']}, Mw {a['mw']}) / ({b['agency']}, Mw {b['mw']}) — à vérifier")
    add("\nLe catalogue étant déclusterisé par les auteurs, aucun doublon n'est attendu.\n")

    add("## Champs manquants\n")
    add("| Champ du fichier | Vides | % |\n|---|---|---|")
    for label, key in [("mois", "month"), ("jour", "day"), ("heure", "hour"), ("minute", "minute"),
                       ("seconde", "second"), ("profondeur", "depth"), ("magnitude d'origine", "mag_orig"),
                       ("intensité max.", "imax")]:
        k = sum(1 for e in rows if e[key] is None)
        add(f"| {label} | {k} | {100 * k / n:.1f} |")
    add("")
    add("Champs de la structure cible **absents du fichier** (laissés vides, rien n'est inventé) : "
        "`id_agence`, `province`, `region` (à calculer quand la couche des limites sera fournie), "
        "`victimes`, `blesses`, `tsunami`, `description_effets`, `fiabilite`, `precision_localisation_km`, "
        "`intensite_epicentrale` (le fichier donne l'intensité **maximale** EMS-98, rangée dans `intensite_max`).\n")

    add("## Répartitions\n")
    add("**Par agence** : " + ", ".join(f"{a} {c}" for a, c in Counter(e["agency"] for e in rows).most_common()) + ".\n")
    add("**Méthode d'obtention de la Mw** :\n")
    for code, c in sorted(Counter(e["code"] for e in rows).items()):
        add(f"- code {code} — {MW_CODE.get(code, '?')} : {c}")
    add("")
    add("**Par magnitude (Mw)** : " + ", ".join(
        f"{lo}–{hi} : {sum(1 for e in rows if e['mw'] is not None and lo <= e['mw'] < hi)}"
        for lo, hi in [(3, 4), (4, 5), (5, 6), (6, 7), (7, 10)]) + ".\n")
    longit_text = sum(1 for e in rows if e["lon"] is not None and abs(e["lon"]) < 1)
    add("## Transformations appliquées\n")
    add("- Coordonnées : nombres en millièmes de degré divisés par 1 000 ; les longitudes saisies en texte "
        f"(déjà en degrés, proches du méridien 0 : {longit_text} lignes avec |lon| < 1°) lues telles quelles.")
    add("- Dates en ISO 8601, partielles si le mois ou le jour manque (colonne `precision_date` pour l'historique, "
        "mention dans `remarques` pour l'instrumental).")
    add("- `magnitude` = Mw unifiée par les auteurs ; la magnitude et le type d'origine sont conservés.")
    add("- Identifiants `PEL-0001`… dans l'ordre du fichier (stables tant que le fichier ne change pas).")
    add("")
    return "\n".join(lines) + "\n"


def write_csv(path: Path, cols: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def to_geojson(rows: list[dict], cols: list[str], kind: str) -> dict:
    feats = []
    for r in rows:
        props = {c: r.get(c, "") for c in cols if c not in ("latitude", "longitude")}
        depth = float(r["profondeur_km"]) if r.get("profondeur_km") else None
        feats.append(feature(float(r["longitude"]), float(r["latitude"]), props, depth))
    return feature_collection(feats, {"source": "Peláez et al. (2007), doi:10.1785/gssrl.78.6.614",
                                      "table": kind, "generated": now_utc().isoformat(timespec="seconds")})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", type=Path, default=SRC)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    if not args.src.exists():
        raise SystemExit(f"Fichier introuvable : {args.src}")
    rows = read_rows(args.src)
    historique, instrumental, _ = build(rows)

    write_csv(args.out / "historique.csv", HISTORIQUE_COLS, historique)
    write_csv(args.out / "instrumental.csv", INSTRUMENTAL_COLS, instrumental)
    write_csv(args.out / "sources.csv", SOURCES_COLS, SOURCES)
    write_json_atomic(args.out / "historique.geojson", to_geojson(historique, HISTORIQUE_COLS, "historique"))
    write_json_atomic(args.out / "instrumental.geojson", to_geojson(instrumental, INSTRUMENTAL_COLS, "instrumental"))
    (args.out / "RAPPORT_QUALITE.md").write_text(quality(rows, historique, instrumental), encoding="utf-8")

    print(f"{len(rows)} lignes lues → historique {len(historique)}, instrumental {len(instrumental)}")
    print(f"Sorties dans {rel(args.out)}/")


if __name__ == "__main__":
    main()
