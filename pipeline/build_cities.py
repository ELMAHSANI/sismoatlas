"""
Liste des villes de référence (noms FR / AR / EN + coordonnées) → « à 18 km au nord d'Al Hoceima ».

Source : GeoNames (CC BY 4.0) — cities1000 + noms alternatifs par pays.
  - Maroc : toutes les localités de 1 000 habitants et plus, provinces du Sud comprises
    (codées « EH » dans GeoNames, rattachées ici au Maroc conformément à CLAUDE.md §4.1) ;
  - pays voisins dans la zone d'étude (Espagne, Portugal, Algérie, Gibraltar) : villes de 50 000 habitants
    et plus, pour décrire les séismes de la mer d'Alboran et du sud de la péninsule Ibérique.

Sorties : data/villes/cities.csv (liste complète), public/data/cities.json (version légère pour le navigateur),
          data/villes/RAPPORT_VILLES.md
Option  : --check-osm <couche.shp> compare les positions avec une couche de villes OpenStreetMap.

Les téléchargements sont mis en cache dans .cache/geonames/ (non versionné). Relançable sans risque.
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import statistics
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

import requests

from common import BBOX, CACHE, DATA, PUBLIC_DATA, USER_AGENT, haversine_km, in_bbox, now_utc, rel, write_json_atomic

BASE_URL = "https://download.geonames.org/export/dump/"
CACHE_DIR = CACHE / "geonames"
OUT_DIR = DATA / "villes"
MOROCCO = {"MA", "EH"}
NEIGHBOURS = {"ES", "PT", "DZ", "GI"}
NEIGHBOUR_MIN_POP = 50_000
# Codes GeoNames exclus : sections de ville, lieux historiques, abandonnés ou détruits
EXCLUDED_CODES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"}
# Noms arabes repris d'OpenStreetMap (créé avec --osm-names, réutilisé ensuite automatiquement)
OSM_NAMES_FILE = OUT_DIR / "noms_arabes_osm.csv"


def download(name: str, refresh: bool) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / name.replace("/", "_")
    if target.exists() and not refresh:
        return target
    print(f"Téléchargement {BASE_URL}{name}")
    r = requests.get(BASE_URL + name, headers={"User-Agent": USER_AGENT}, timeout=300)
    r.raise_for_status()
    target.write_bytes(r.content)
    return target


def read_zip_tsv(path: Path, member: str):
    with zipfile.ZipFile(path) as z:
        with z.open(member) as f:
            for line in io.TextIOWrapper(f, encoding="utf-8"):
                yield line.rstrip("\n").split("\t")


def load_cities(path: Path) -> list[dict]:
    cities = []
    for c in read_zip_tsv(path, "cities1000.txt"):
        cc, code = c[8], c[7]
        if code in EXCLUDED_CODES or c[6] != "P":
            continue
        lat, lon, pop = float(c[4]), float(c[5]), int(c[14] or 0)
        if cc in MOROCCO:
            pass
        elif cc in NEIGHBOURS and in_bbox(lat, lon) and (pop >= NEIGHBOUR_MIN_POP or cc == "GI"):
            pass
        else:
            continue
        cities.append({"geonameid": c[0], "name": c[1], "asciiname": c[2], "lat": lat, "lon": lon,
                       "population": pop, "feature_code": code, "source_country": cc, "admin1": c[10]})
    return cities


def load_alt_names(paths: dict[str, Path], ids: set[str]) -> dict[str, dict[str, list[tuple]]]:
    """geonameid → langue → [(préféré, court, nom)] pour fr, ar, en."""
    names: dict[str, dict[str, list[tuple]]] = defaultdict(lambda: defaultdict(list))
    for cc, path in paths.items():
        for a in read_zip_tsv(path, f"{cc}.txt"):
            if len(a) < 8 or a[1] not in ids or a[2] not in ("fr", "ar", "en"):
                continue
            is_pref, is_short, is_colloq, is_hist = (a[4] == "1", a[5] == "1", a[6] == "1", a[7] == "1")
            if is_colloq or is_hist:
                continue
            names[a[1]][a[2]].append((is_pref, not is_short, a[3]))
    return names


def pick(cands: list[tuple]) -> str:
    if not cands:
        return ""
    # Nom préféré d'abord, puis nom non abrégé, puis ordre du fichier
    name = sorted(cands, key=lambda t: (not t[0], not t[1]))[0][2]
    # Retire les précisions ajoutées par GeoNames : « أرونا، إسبانيا », « Arona (Tenerife) »
    return re.split(r"\s*[،,(]", name, maxsplit=1)[0].strip() or name


def normalize(s: str) -> str:
    s = s if isinstance(s, str) else ""  # noms vides (NaN) dans certaines couches
    s = re.sub(r"[؀-ۿ]+", " ", s)  # retire la partie arabe des noms OSM « Nador الناظور »
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"^(al|el|ad|ar|as|at|az)[\s-]+", "", s.strip())
    return re.sub(r"[^a-z]", "", s)


ARABIC = re.compile(r"[؀-ۿ][؀-ۿ\s]*[؀-ۿ]|[؀-ۿ]")


def osm_arabic_names(cities: list[dict], osm_path: Path) -> tuple[int, int]:
    """
    Complète / remplace les noms arabes à partir d'une couche OSM dont le champ `name` mêle
    latin et arabe (« Targuist تارجيست »). Correspondance : même nom latin normalisé ET ≤ 10 km.
    Renvoie (noms ajoutés, noms remplacés).
    """
    import geopandas as gpd

    osm = gpd.read_file(osm_path).to_crs(4326)
    index = defaultdict(list)
    for _, r in osm.iterrows():
        name = r["name"] if isinstance(r["name"], str) else ""
        m = ARABIC.search(name)
        if not m:
            continue
        index[normalize(name)].append((r.geometry.y, r.geometry.x, m.group(0).strip()))
    matches = []
    for c in cities:
        if c["country"] != "MA":
            continue
        cands = index.get(normalize(c["name_en"])) or index.get(normalize(c["name_fr"])) or []
        best = min(((haversine_km(c["lat"], c["lon"], la, lo), ar) for la, lo, ar in cands), default=None)
        if best and best[0] <= 10:
            matches.append({"geonameid": c["geonameid"], "name_ar": best[1], "distance_km": round(best[0], 2),
                            "name_fr": c["name_fr"]})
    # Table conservée pour les exécutions suivantes (sans avoir besoin de la couche OSM)
    with OSM_NAMES_FILE.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["geonameid", "name_fr", "name_ar", "distance_km"], lineterminator="\n")
        w.writeheader()
        w.writerows(matches)
    return apply_osm_names(cities)


def apply_osm_names(cities: list[dict]) -> tuple[int, int]:
    """Applique data/villes/noms_arabes_osm.csv s'il existe. Renvoie (ajoutés, remplacés)."""
    if not OSM_NAMES_FILE.exists():
        return 0, 0
    with OSM_NAMES_FILE.open(encoding="utf-8") as f:
        table = {r["geonameid"]: r["name_ar"] for r in csv.DictReader(f)}
    added = replaced = 0
    for c in cities:
        ar = table.get(c["geonameid"])
        if not ar:
            continue
        if not c["name_ar"]:
            added += 1
        elif c["name_ar"] != ar:
            replaced += 1
        c["name_ar"], c["name_ar_source"] = ar, "osm"
    return added, replaced


def dedupe(cities: list[dict]) -> list[dict]:
    """Supprime les doublons GeoNames : même nom normalisé, ou même population, à moins de 3 km."""
    kept: list[dict] = []
    for c in cities:  # triées par population décroissante
        dup = any(
            haversine_km(c["lat"], c["lon"], k["lat"], k["lon"]) < 3
            and (normalize(c["name"]) == normalize(k["name"]) or c["population"] == k["population"])
            for k in kept
        )
        if not dup:
            kept.append(c)
    return kept


def check_osm(cities: list[dict], osm_path: Path) -> list[str]:
    import geopandas as gpd

    osm = gpd.read_file(osm_path).to_crs(4326)
    osm = osm[osm["type"].isin(["city", "town", "village"])]
    index = defaultdict(list)
    for _, r in osm.iterrows():
        index[normalize(r["name"])].append((r.geometry.y, r.geometry.x, r["name"]))
    lines, offsets, missing = [], [], []
    north = [c for c in cities if c["country"] == "MA" and c["population"] >= 5000 and c["lat"] >= 27.7]
    for c in north:
        cands = index.get(normalize(c["name_en"])) or index.get(normalize(c["name_fr"])) or []
        if not cands:
            missing.append(c)
            continue
        d = min(haversine_km(c["lat"], c["lon"], la, lo) for la, lo, _ in cands)
        offsets.append((d, c))
    lines.append(f"Couche comparée : `{osm_path.name}` (OpenStreetMap, {len(osm)} villes/villages).\n")
    lines.append(f"- Villes GeoNames de 5 000 habitants et plus au nord de 27,7 °N : {len(north)}")
    lines.append(f"- Retrouvées par leur nom dans la couche OSM : {len(offsets)}")
    if offsets:
        ds = sorted(d for d, _ in offsets)
        lines.append(f"- Écart de position : médiane {statistics.median(ds):.1f} km, 90 % sous {ds[int(0.9 * len(ds)) - 1]:.1f} km")
        far = [(d, c) for d, c in offsets if d > 10]
        if far:
            lines.append(f"- Écarts de plus de 10 km (homonymes probables ou erreur, à vérifier) : {len(far)}")
            for d, c in sorted(far, key=lambda t: -t[0])[:15]:
                lines.append(f"  - {c['name_fr']} : {d:.0f} km")
    rif = [c for c in missing if 34.6 <= c["lat"] <= 35.5 and -6.0 <= c["lon"] <= -2.5]
    if rif:
        lines.append("- Villes du Rif non retrouvées par leur nom (orthographes différentes probables) : "
                     + ", ".join(c["name_fr"] for c in rif[:30]))
    return lines


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--refresh", action="store_true", help="retélécharger les fichiers GeoNames")
    p.add_argument("--check-osm", type=Path, help="couche de villes OSM pour un contrôle de positions")
    p.add_argument("--osm-names", type=Path, help="couche OSM (noms « latin arabe ») pour compléter les noms arabes")
    args = p.parse_args()

    cities_zip = download("cities1000.zip", args.refresh)
    alt_zips = {cc: download(f"alternatenames/{cc}.zip", args.refresh) for cc in sorted(MOROCCO | NEIGHBOURS)}
    cities = load_cities(cities_zip)
    alt = load_alt_names(alt_zips, {c["geonameid"] for c in cities})

    for c in cities:
        n = alt.get(c["geonameid"], {})
        c["name_fr"] = pick(n.get("fr", [])) or c["name"]
        c["name_en"] = pick(n.get("en", [])) or c["name"]
        c["name_ar"] = pick(n.get("ar", []))
        c["name_ar_source"] = "geonames" if c["name_ar"] else ""
        c["country"] = "MA" if c["source_country"] in MOROCCO else c["source_country"]
    cities.sort(key=lambda c: (-c["population"], c["name_fr"]))
    before = len(cities)
    cities = dedupe(cities)
    n_dupes = before - len(cities)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.osm_names:
        osm_added, osm_replaced = osm_arabic_names(cities, args.osm_names)
    else:
        osm_added, osm_replaced = apply_osm_names(cities)

    cols = ["geonameid", "name_fr", "name_ar", "name_en", "lat", "lon", "population", "country",
            "source_country", "feature_code", "admin1", "name_ar_source"]
    with (OUT_DIR / "cities.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(cities)

    light = [{"id": int(c["geonameid"]), "fr": c["name_fr"], "ar": c["name_ar"] or None, "en": c["name_en"],
              "lat": round(c["lat"], 4), "lon": round(c["lon"], 4), "pop": c["population"], "cc": c["country"]}
             for c in cities]
    write_json_atomic(PUBLIC_DATA / "cities.json", {
        "source": "GeoNames (https://www.geonames.org/), CC BY 4.0"
        + ("; noms arabes complétés depuis OpenStreetMap (© contributeurs OpenStreetMap, ODbL)" if osm_added + osm_replaced else ""),
        "generated": now_utc().isoformat(timespec="seconds"),
        "cities": light,
    })

    ma = [c for c in cities if c["country"] == "MA"]
    south = [c for c in ma if c["source_country"] == "EH"]
    no_ar = [c for c in ma if not c["name_ar"]]
    lines = [
        "# Rapport — villes de référence\n",
        f"*Généré le {now_utc():%d/%m/%Y à %H:%M} UTC par `pipeline/build_cities.py`.*\n",
        "**Source** : GeoNames (cities1000 + noms alternatifs), licence CC BY 4.0 — attribution à afficher sur le site.\n",
        "## Contenu\n",
        f"- Total : **{len(cities)}** localités",
        f"- Maroc : {len(ma)} (dont {len(south)} dans les provinces du Sud, codées « EH » dans GeoNames et rattachées au Maroc)",
        f"- Pays voisins dans la zone (≥ {NEIGHBOUR_MIN_POP:,} hab.) : "
        + ", ".join(f"{cc} {sum(1 for c in cities if c['country'] == cc)}" for cc in sorted(NEIGHBOURS)),
        f"- Doublons GeoNames supprimés (même nom ou même population à moins de 3 km) : {n_dupes}",
        f"- Noms arabes complétés depuis OpenStreetMap (© contributeurs OpenStreetMap, ODbL) : {osm_added} ajoutés, "
        f"{osm_replaced} remplacés — table `{rel(OSM_NAMES_FILE)}` (même nom latin et moins de 10 km)",
        f"- Localités marocaines encore sans nom arabe : {len(no_ar)} "
        f"(dont {sum(1 for c in no_ar if c['population'] >= 20000)} de 20 000 habitants et plus) "
        "— le site affichera alors le nom latin",
        "",
        "Provinces du Sud (contrôle) : " + ", ".join(f"{c['name_fr']} ({c['population']:,} hab.)" for c in south[:12]),
        "",
        "Grandes villes sans nom arabe : " + (", ".join(c["name_fr"] for c in no_ar if c["population"] >= 20000) or "aucune"),
        "",
        "## Choix validés\n",
        "- Ceuta et Melilla figurent dans la liste, sous leurs noms GeoNames « Ceuta » et « Melilla » "
        "(décision de l'utilisateur, 12/11/2026) : elles servent de repère pour les séismes du Rif oriental et du détroit.",
        "",
    ]
    if args.check_osm:
        lines += ["## Contrôle avec une couche OpenStreetMap\n", *check_osm(cities, args.check_osm), ""]
    (OUT_DIR / "RAPPORT_VILLES.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(cities)} villes → {rel(OUT_DIR / 'cities.csv')} et {rel(PUBLIC_DATA / 'cities.json')}")


if __name__ == "__main__":
    main()
