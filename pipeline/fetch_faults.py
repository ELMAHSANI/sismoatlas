"""
Failles actives — GEM Global Active Faults Database (Styron et Pagani, 2020), licence CC BY-SA 4.0.

Télécharge la base harmonisée (cache .cache/gem/), garde les failles qui touchent la zone Maroc + alentours,
simplifie légèrement les tracés → public/data/sig/gem_faults.geojson (+ data/sig/gem_faults.geojson complet).

Citation : Styron R., Pagani M. (2020). The GEM Global Active Faults Database. Earthquake Spectra 36(1_suppl),
160–180. doi:10.1177/8755293020944182
"""
from __future__ import annotations

import argparse

import geopandas as gpd
import requests
from shapely.geometry import box

from common import BBOX, CACHE, DATA, PUBLIC_DATA, USER_AGENT, now_utc, rel, write_json_atomic

URL = "https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults_harmonized.geojson"
KEEP = ["catalog_id", "catalog_name", "name", "slip_type", "average_dip", "average_rake", "net_slip_rate", "reference"]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--refresh", action="store_true")
    args = p.parse_args()

    cache = CACHE / "gem" / "gem_active_faults_harmonized.geojson"
    if args.refresh or not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        print(f"Téléchargement {URL}")
        r = requests.get(URL, headers={"User-Agent": USER_AGENT}, timeout=300)
        r.raise_for_status()
        cache.write_bytes(r.content)

    gdf = gpd.read_file(cache)
    zone = box(BBOX["min_lon"], BBOX["min_lat"], BBOX["max_lon"], BBOX["max_lat"])
    gdf = gdf[gdf.intersects(zone)].copy()
    gdf = gdf[[c for c in KEEP if c in gdf.columns] + ["geometry"]]

    (DATA / "sig").mkdir(parents=True, exist_ok=True)
    full = DATA / "sig" / "gem_faults.geojson"
    gdf.to_file(full, driver="GeoJSON", engine="pyogrio", COORDINATE_PRECISION=6)
    web = gdf.copy()
    web["geometry"] = web.geometry.simplify(0.002, preserve_topology=True)
    out = PUBLIC_DATA / "sig" / "gem_faults.geojson"
    web[["name", "slip_type", "geometry"]].to_file(out, driver="GeoJSON", engine="pyogrio", COORDINATE_PRECISION=4)
    write_json_atomic(PUBLIC_DATA / "sig" / "gem_faults.meta.json", {
        "source": "GEM Global Active Faults Database (Styron et Pagani, 2020), doi:10.1177/8755293020944182",
        "licence": "CC BY-SA 4.0", "url": "https://github.com/GEMScienceTools/gem-global-active-faults",
        "generated": now_utc().isoformat(timespec="seconds"), "count": len(web),
    }, compact=False)
    print(f"{len(web)} failles dans la zone → {rel(out)} ({out.stat().st_size // 1024} Ko)")
    print("Types de jeu :", web["slip_type"].value_counts().to_dict())


if __name__ == "__main__":
    main()
