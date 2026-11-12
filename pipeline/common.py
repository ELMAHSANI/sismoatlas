"""Outils communs au pipeline SismoAtlas : chemins, zone d'étude, géodésie, écriture GeoJSON."""
from __future__ import annotations

import json
import math
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "donnees_brutes"          # originaux : lecture seule
DATA = ROOT / "data"                   # données traitées (versionnées)
PUBLIC_DATA = ROOT / "public" / "data" # fichiers légers servis au site
CACHE = ROOT / ".cache"                # téléchargements bruts (non versionnés)

# Zone « Maroc + alentours » (CLAUDE.md §4.4)
BBOX = {"min_lat": 20.0, "max_lat": 38.0, "min_lon": -18.0, "max_lon": 1.0}

USER_AGENT = "SismoAtlas-pipeline/0.1 (+https://sismoatlas.pages.dev)"
EARTH_RADIUS_KM = 6371.0


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def in_bbox(lat: float, lon: float, bbox: dict = BBOX) -> bool:
    return bbox["min_lat"] <= lat <= bbox["max_lat"] and bbox["min_lon"] <= lon <= bbox["max_lon"]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Azimut (0 = nord, sens horaire) du point 1 vers le point 2."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def compass8(deg: float) -> str:
    return COMPASS_8[int(((deg % 360) + 22.5) // 45) % 8]


def feature(lon: float, lat: float, props: dict[str, Any], depth: float | None = None) -> dict:
    coords = [round(lon, 4), round(lat, 4)]
    if depth is not None:
        coords.append(round(depth, 1))
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": coords}, "properties": props}


def write_json_atomic(path: Path, obj: Any, *, compact: bool = True) -> None:
    """Écrit un fichier JSON de façon atomique (pas de fichier à moitié écrit si le script échoue)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def feature_collection(features: Iterable[dict], metadata: dict | None = None) -> dict:
    fc: dict[str, Any] = {"type": "FeatureCollection", "features": list(features)}
    if metadata:
        fc["metadata"] = metadata
    return fc


def rel(path: Path) -> str:
    """Chemin relatif à la racine du projet, pour les rapports."""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)
