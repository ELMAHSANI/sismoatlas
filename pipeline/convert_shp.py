"""
Conversion des couches SIG de donnees_brutes/ → WGS84 (EPSG:4326)

Pour chaque couche (.shp, .gpkg, .geojson) trouvée dans donnees_brutes/ :
  - lecture du système de coordonnées (.prj) puis reprojection en WGS84 ;
  - version complète  → data/sig/<nom>.geojson          (analyses)
  - version allégée   → public/data/sig/<nom>.geojson   (site : géométries simplifiées, 5 décimales)
  - index des couches → public/data/sig/index.json
  - rapport           → data/sig/RAPPORT_SIG.md

Règle (CLAUDE.md §4.1) : une couche sans .prj n'est PAS convertie (on ne devine pas le système de
coordonnées) ; elle est signalée dans le rapport pour que l'utilisateur précise son système.
Relançable sans risque : les sorties sont réécrites.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
import warnings
from pathlib import Path

import geopandas as gpd
import pyogrio
from shapely import make_valid

from common import DATA, PUBLIC_DATA, RAW, now_utc, rel, write_json_atomic

DEFAULT_TOLERANCE = 0.002  # degrés (~200 m) : suffisant pour l'affichage web à l'échelle du Maroc
WEB_PRECISION = 5           # décimales (~1 m)
FULL_PRECISION = 7


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_") or "couche"


def find_layers(src: Path) -> tuple[list[tuple[Path, str | None]], list[str]]:
    """Renvoie [(fichier, nom de couche ou None)] et une liste de remarques (fichiers ignorés)."""
    layers, notes = [], []
    for path in sorted(src.rglob("*")):
        ext = path.suffix.lower()
        if ext == ".shp":
            layers.append((path, None))
        elif ext == ".gpkg":
            for name, _geom in pyogrio.list_layers(path):
                layers.append((path, name))
        elif ext in (".geojson", ".json") and path.parent.name != "excel":
            layers.append((path, None))
        elif ext == ".dbf" and not path.with_suffix(".shp").exists() and not path.with_suffix(".SHP").exists():
            notes.append(f"`{rel(path)}` : table attributaire seule (pas de .shp) — ignorée par ce script.")
    return layers, notes


def companions(shp: Path) -> dict[str, bool]:
    return {ext: shp.with_suffix(ext).exists() or shp.with_suffix(ext.upper()).exists()
            for ext in (".shx", ".dbf", ".prj", ".cpg")}


def convert(path: Path, layer: str | None, out_full: Path, out_web: Path, tolerance: float) -> dict:
    info: dict = {"source": rel(path) + (f" › {layer}" if layer else ""), "warnings": []}
    if path.suffix.lower() == ".shp":
        comp = companions(path)
        info["missing"] = [e for e, ok in comp.items() if not ok]
        if not comp[".shx"] or not comp[".dbf"]:
            info["status"] = "ignorée : fichiers obligatoires manquants (" + ", ".join(info["missing"]) + ")"
            return info
        if not comp[".prj"]:
            info["status"] = "ignorée : pas de .prj — système de coordonnées à préciser par l'utilisateur"
            return info
        if not comp[".cpg"]:
            info["warnings"].append("pas de .cpg : encodage des textes deviné (vérifier les accents / l'arabe)")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        gdf = gpd.read_file(path, layer=layer) if layer else gpd.read_file(path)
    info["warnings"] += sorted({str(w.message)[:160] for w in caught})
    if gdf.crs is None:
        info["status"] = "ignorée : système de coordonnées inconnu — à préciser par l'utilisateur"
        return info

    epsg = gdf.crs.to_epsg()
    info["crs_source"] = f"EPSG:{epsg} ({gdf.crs.name})" if epsg else gdf.crs.name
    info["count"] = len(gdf)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    info["empty_removed"] = info["count"] - len(gdf)
    invalid = int((~gdf.geometry.is_valid).sum())
    if invalid:
        gdf["geometry"] = gdf.geometry.apply(make_valid)
        info["warnings"].append(f"{invalid} géométrie(s) invalide(s) réparée(s) (make_valid)")
    gdf = gdf.to_crs(4326)
    info["geometry"] = ", ".join(sorted(gdf.geom_type.unique()))
    info["bounds"] = [round(v, 4) for v in gdf.total_bounds]
    info["fields"] = [c for c in gdf.columns if c != "geometry"]

    name = slug(path.stem + (f"_{layer}" if layer else ""))
    full_path = out_full / f"{name}.geojson"
    web_path = out_web / f"{name}.geojson"
    out_full.mkdir(parents=True, exist_ok=True)
    out_web.mkdir(parents=True, exist_ok=True)
    gdf.to_file(full_path, driver="GeoJSON", engine="pyogrio", COORDINATE_PRECISION=FULL_PRECISION)

    web = gdf.copy()
    if not all(t in ("Point", "MultiPoint") for t in web.geom_type.unique()):
        web["geometry"] = web.geometry.simplify(tolerance, preserve_topology=True)
        web = web[~web.geometry.is_empty]
    web.to_file(web_path, driver="GeoJSON", engine="pyogrio", COORDINATE_PRECISION=WEB_PRECISION)

    info.update(status="convertie", name=name, full=rel(full_path), web=rel(web_path),
                size_full_kb=round(full_path.stat().st_size / 1024), size_web_kb=round(web_path.stat().st_size / 1024))
    return info


def report(results: list[dict], notes: list[str], src: Path, tolerance: float) -> str:
    lines = ["# Rapport — conversion des couches SIG\n",
             f"*Généré le {now_utc():%d/%m/%Y à %H:%M} UTC par `pipeline/convert_shp.py`.*\n",
             f"Dossier analysé : `{rel(src)}` · simplification web : tolérance {tolerance}° · sortie en WGS84 (EPSG:4326).\n"]
    if not results:
        lines.append("**Aucune couche SIG trouvée.** Déposez vos couches dans `donnees_brutes/shp/` "
                     "(.shp avec .shx, .dbf, .prj et si possible .cpg ; ou .gpkg / .geojson).\n")
        lines.append("Couche prioritaire : **limites du Maroc, territoire complet** (indispensable avant la phase 4).\n")
    for r in results:
        lines.append(f"## {r.get('name') or r['source']}\n")
        lines.append(f"- Source : `{r['source']}`")
        lines.append(f"- Statut : **{r['status']}**")
        if r.get("missing"):
            lines.append(f"- Fichiers manquants : {', '.join(r['missing'])}")
        if r["status"] == "convertie":
            lines.append(f"- Géométrie : {r['geometry']} · entités : {r['count']}"
                         + (f" ({r['empty_removed']} vides retirées)" if r["empty_removed"] else ""))
            lines.append(f"- Système d'origine : {r['crs_source']} → WGS84")
            b = r["bounds"]
            lines.append(f"- Emprise (WGS84) : lon {b[0]} → {b[2]} ; lat {b[1]} → {b[3]}")
            lines.append(f"- Attributs : {', '.join(r['fields']) or '—'}")
            lines.append(f"- Sorties : `{r['full']}` ({r['size_full_kb']} Ko) · `{r['web']}` ({r['size_web_kb']} Ko)")
        for w in r.get("warnings", []):
            lines.append(f"- ⚠️ {w}")
        lines.append("")
    if notes:
        lines.append("## Fichiers ignorés\n")
        lines += [f"- {n}" for n in notes]
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--src", type=Path, default=RAW)
    p.add_argument("--out-data", type=Path, default=DATA / "sig")
    p.add_argument("--out-public", type=Path, default=PUBLIC_DATA / "sig")
    p.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE)
    args = p.parse_args()

    layers, notes = find_layers(args.src)
    results = []
    for path, layer in layers:
        try:
            results.append(convert(path, layer, args.out_data, args.out_public, args.tolerance))
        except Exception as err:  # une couche défectueuse ne doit pas bloquer les autres
            results.append({"source": rel(path), "status": f"erreur : {err}", "warnings": []})
        print(f"{results[-1]['source']} : {results[-1]['status']}")

    args.out_data.mkdir(parents=True, exist_ok=True)
    (args.out_data / "RAPPORT_SIG.md").write_text(report(results, notes, args.src, args.tolerance), encoding="utf-8")
    index = [{"name": r["name"], "geometry": r["geometry"], "count": r["count"], "bounds": r["bounds"],
              "file": f"{r['name']}.geojson"} for r in results if r["status"] == "convertie"]
    write_json_atomic(args.out_public / "index.json", {"generated": now_utc().isoformat(timespec="seconds"),
                                                       "layers": index}, compact=False)
    print(f"{len(index)} couche(s) convertie(s) sur {len(results)} — rapport : {rel(args.out_data / 'RAPPORT_SIG.md')}")


if __name__ == "__main__":
    main()
