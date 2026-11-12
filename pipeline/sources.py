"""
Accès aux catalogues en ligne (EMSC, USGS), normalisation, fusion des doublons et enrichissement
(ville la plus proche). Utilisé par fetch_live.py et fetch_recent_catalogue.py.

Format commun d'un séisme (dict) :
  id, source ("EMSC" | "USGS"), source_id, agency, time (datetime UTC), lat, lon, depth_km, mag, mag_type,
  region, url, updated, other_ids (liste), + champs propres à l'USGS pour les séismes mondiaux.
"""
from __future__ import annotations

import json
import time as _time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

from common import BBOX, PUBLIC_DATA, USER_AGENT, bearing_deg, compass8, haversine_km

EMSC_URL = "https://www.seismicportal.eu/fdsnws/event/1/query"
USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
EMSC_PAGE_LIMIT = 20000

# Fusion des doublons entre agences
MERGE_MAX_SECONDS = 20
MERGE_MAX_KM = 50

# Classes de profondeur usuelles en sismologie (USGS)
DEPTH_CLASSES = [(70, "shallow"), (300, "intermediate"), (float("inf"), "deep")]

# Îles Canaries : à part dans les statistiques « Maroc + alentours » (volcanisme, essaim de La Palma 2021)
CANARIES = {"min_lat": 27.4, "max_lat": 29.6, "min_lon": -18.5, "max_lon": -13.2}

session = requests.Session()
session.headers["User-Agent"] = USER_AGENT


class SourceError(RuntimeError):
    pass


def _get(url: str, params: dict, retries: int = 3, timeout: int = 90) -> requests.Response:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = session.get(url, params=params, timeout=timeout)
            if r.status_code == 204:  # FDSN : aucun résultat
                return r
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            last = e
            _time.sleep(2 * (attempt + 1))
    raise SourceError(f"{url} : {last}")


def parse_time(value: Any) -> datetime:
    if isinstance(value, (int, float)):  # USGS : millisecondes depuis 1970 (négatives avant 1970)
        # fromtimestamp() échoue sous Windows pour les dates antérieures à 1970 : calcul par addition
        return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=value)
    s = str(value).replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def fdsn_time(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


# ----------------------------------------------------------------------------- EMSC
def fetch_emsc(start: datetime, end: datetime, bbox: dict = BBOX, min_mag: float | None = None) -> list[dict]:
    """Séismes EMSC dans la zone ; découpe automatiquement la période si la limite par requête est atteinte."""
    params = {
        "format": "json", "start": fdsn_time(start), "end": fdsn_time(end),
        "minlat": bbox["min_lat"], "maxlat": bbox["max_lat"], "minlon": bbox["min_lon"], "maxlon": bbox["max_lon"],
        "limit": EMSC_PAGE_LIMIT, "orderby": "time",
    }
    if min_mag is not None:
        params["minmag"] = min_mag
    r = _get(EMSC_URL, params)
    feats = [] if r.status_code == 204 or not r.content.strip() else r.json().get("features", [])
    if len(feats) >= EMSC_PAGE_LIMIT:
        mid = start + (end - start) / 2
        return fetch_emsc(start, mid, bbox, min_mag) + fetch_emsc(mid, end, bbox, min_mag)
    events = []
    for f in feats:
        p = f.get("properties", {})
        if p.get("lat") is None or p.get("lon") is None or p.get("time") is None:
            continue
        events.append({
            "id": f"emsc:{p.get('unid') or f.get('id')}",
            "source": "EMSC",
            "source_id": str(p.get("source_id") or ""),
            "unid": p.get("unid") or f.get("id"),
            "agency": p.get("auth") or "",
            "time": parse_time(p["time"]),
            "lat": float(p["lat"]), "lon": float(p["lon"]),
            "depth_km": float(p["depth"]) if p.get("depth") is not None else None,
            "mag": float(p["mag"]) if p.get("mag") is not None else None,
            "mag_type": (p.get("magtype") or "").strip(),
            "region": (p.get("flynn_region") or "").strip(),
            "evtype": p.get("evtype") or "",
            "url": f"https://www.seismicportal.eu/eventdetails.html?unid={p.get('unid') or f.get('id')}",
            "updated": p.get("lastupdate") or "",
            "other_ids": [],
        })
    return events


# ----------------------------------------------------------------------------- USGS
def fetch_usgs(start: datetime, end: datetime, bbox: dict | None = BBOX, min_mag: float | None = None) -> list[dict]:
    params: dict[str, Any] = {"format": "geojson", "starttime": fdsn_time(start), "endtime": fdsn_time(end),
                              "orderby": "time", "limit": 20000}
    if bbox:
        params.update(minlatitude=bbox["min_lat"], maxlatitude=bbox["max_lat"],
                      minlongitude=bbox["min_lon"], maxlongitude=bbox["max_lon"])
    if min_mag is not None:
        params["minmagnitude"] = min_mag
    r = _get(USGS_URL, params)
    feats = [] if r.status_code == 204 else r.json().get("features", [])
    events = []
    for f in feats:
        p, g = f.get("properties", {}), f.get("geometry") or {}
        coords = g.get("coordinates") or [None, None, None]
        if coords[0] is None or p.get("time") is None or p.get("type") not in (None, "earthquake"):
            continue
        events.append({
            "id": f"usgs:{f.get('id')}",
            "source": "USGS",
            "source_id": f.get("id"),
            "agency": (p.get("net") or "").upper(),
            "time": parse_time(p["time"]),
            "lat": float(coords[1]), "lon": float(coords[0]),
            "depth_km": float(coords[2]) if coords[2] is not None else None,
            "mag": float(p["mag"]) if p.get("mag") is not None else None,
            "mag_type": (p.get("magType") or "").strip(),
            "region": (p.get("place") or "").strip(),
            "url": p.get("url") or "",
            "updated": parse_time(p["updated"]).isoformat() if p.get("updated") else "",
            "other_ids": [],
            # informations d'impact (séismes mondiaux)
            "alert": p.get("alert"),            # niveau PAGER : green / yellow / orange / red
            "tsunami": int(p.get("tsunami") or 0),
            "sig": p.get("sig"),
            "felt": p.get("felt"),
            "mmi": p.get("mmi"),
            "status": p.get("status"),
        })
    return events


# ----------------------------------------------------------------------------- fusion
def merge_duplicates(primary: list[dict], secondary: list[dict]) -> tuple[list[dict], int]:
    """
    Fusionne deux listes : un séisme de `secondary` à moins de MERGE_MAX_SECONDS et MERGE_MAX_KM d'un séisme
    de `primary` est considéré comme le même ; on garde celui de `primary` (agence de référence) et on note
    l'identifiant de l'autre dans `other_ids`. Renvoie (liste fusionnée, nombre de doublons fusionnés).
    """
    by_time = sorted(primary, key=lambda e: e["time"])
    times = [e["time"].timestamp() for e in by_time]
    import bisect

    merged = 0
    extra = []
    for s in secondary:
        t = s["time"].timestamp()
        lo = bisect.bisect_left(times, t - MERGE_MAX_SECONDS)
        hi = bisect.bisect_right(times, t + MERGE_MAX_SECONDS)
        best, best_d = None, None
        for p in by_time[lo:hi]:
            d = haversine_km(p["lat"], p["lon"], s["lat"], s["lon"])
            if d <= MERGE_MAX_KM and (best_d is None or d < best_d):
                best, best_d = p, d
        if best is not None:
            best["other_ids"].append(s["id"])
            for k in ("alert", "tsunami", "sig", "felt", "mmi"):  # garder les infos d'impact USGS
                if s.get(k) is not None and best.get(k) is None:
                    best[k] = s[k]
            merged += 1
        else:
            extra.append(s)
    out = sorted(by_time + extra, key=lambda e: e["time"], reverse=True)
    return out, merged


# ----------------------------------------------------------------------------- enrichissement
_CITIES: list[dict] | None = None


def load_cities(path: Path = PUBLIC_DATA / "cities.json") -> list[dict]:
    global _CITIES
    if _CITIES is None:
        if not path.exists():
            raise SourceError(f"{path} introuvable : lancer d'abord pipeline/build_cities.py")
        _CITIES = json.loads(path.read_text(encoding="utf-8"))["cities"]
    return _CITIES


def nearest_city(lat: float, lon: float, min_pop: int = 0) -> dict | None:
    best, best_d = None, None
    for c in load_cities():
        if c["pop"] < min_pop:
            continue
        d = haversine_km(lat, lon, c["lat"], c["lon"])
        if best_d is None or d < best_d:
            best, best_d = c, d
    if best is None:
        return None
    return {
        "id": best["id"], "fr": best["fr"], "ar": best["ar"], "en": best["en"], "cc": best["cc"],
        "km": round(best_d),
        # direction du séisme vu depuis la ville (« à 18 km au NORD d'Al Hoceima »)
        "dir": compass8(bearing_deg(best["lat"], best["lon"], lat, lon)),
    }


def depth_class(depth: float | None) -> str | None:
    if depth is None:
        return None
    for limit, name in DEPTH_CLASSES:
        if depth < limit:
            return name
    return None


def in_canaries(lat: float, lon: float) -> bool:
    return CANARIES["min_lat"] <= lat <= CANARIES["max_lat"] and CANARIES["min_lon"] <= lon <= CANARIES["max_lon"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def days_ago(n: float) -> datetime:
    return utc_now() - timedelta(days=n)
