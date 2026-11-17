"""
Limites du Maroc — Natural Earth, Admin 0 – Countries, édition « point de vue du Maroc » (1:10 m).

Natural Earth est dans le domaine public : aucune autorisation ni attribution n'est exigée
(https://www.naturalearthdata.com/about/terms-of-use/). On le cite tout de même, par principe.

L'édition « point de vue » (POV) MAR dessine les frontières telles que les reconnaît le Maroc
(Sahara inclus), comme le faisait l'ancienne couche fournie par l'équipe (Morocco.shp, retirée faute de
licence connue).

Télécharge le fichier (cache .cache/naturalearth/), garde le polygone du Maroc et écrit :
  - data/sig/morocco.geojson         (géométrie complète)
  - public/data/sig/morocco.geojson  (site : simplifiée à 0,002°, 5 décimales)
  - public/data/sig/morocco.meta.json (source, licence, version)
"""
from __future__ import annotations

import argparse

import geopandas as gpd
import requests
from shapely import make_valid

from common import CACHE, DATA, PUBLIC_DATA, USER_AGENT, now_utc, rel, write_json_atomic

VERSION = "v5.1.2"
URL = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{VERSION}/geojson/ne_10m_admin_0_countries_mar.geojson"
SOURCE = f"Natural Earth {VERSION}, Admin 0 – Countries, point de vue du Maroc (ne_10m_admin_0_countries_mar)"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--refresh", action="store_true")
    args = p.parse_args()

    cache = CACHE / "naturalearth" / f"ne_10m_admin_0_countries_mar_{VERSION}.geojson"
    if args.refresh or not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        print(f"Téléchargement {URL}")
        r = requests.get(URL, headers={"User-Agent": USER_AGENT}, timeout=300)
        r.raise_for_status()
        cache.write_bytes(r.content)

    gdf = gpd.read_file(cache)
    ma = gdf[gdf["ADM0_A3"] == "MAR"].copy()
    if len(ma) != 1:
        raise SystemExit(f"Maroc introuvable ou ambigu dans {cache.name} ({len(ma)} entités)")
    ma["geometry"] = ma.geometry.apply(make_valid)
    ma = ma.assign(name="Morocco", name_fr="Maroc", name_ar="المغرب")[["name", "name_fr", "name_ar", "geometry"]]

    (DATA / "sig").mkdir(parents=True, exist_ok=True)
    full = DATA / "sig" / "morocco.geojson"
    ma.to_file(full, driver="GeoJSON", engine="pyogrio", COORDINATE_PRECISION=7)
    web = ma.copy()
    web["geometry"] = web.geometry.simplify(0.002, preserve_topology=True)
    out = PUBLIC_DATA / "sig" / "morocco.geojson"
    web[["name", "geometry"]].to_file(out, driver="GeoJSON", engine="pyogrio", COORDINATE_PRECISION=5)
    b = [round(v, 4) for v in ma.total_bounds]
    write_json_atomic(PUBLIC_DATA / "sig" / "morocco.meta.json", {
        "source": SOURCE, "licence": "domaine public (Natural Earth)",
        "url": "https://www.naturalearthdata.com/", "generated": now_utc().isoformat(timespec="seconds"),
        "bounds": b,
    }, compact=False)
    print(f"Maroc ({SOURCE}) → {rel(out)} ({out.stat().st_size // 1024} Ko) ; emprise {b}")


if __name__ == "__main__":
    main()
