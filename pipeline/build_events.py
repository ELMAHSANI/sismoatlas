"""
Données des fiches « séismes majeurs » (CLAUDE.md §5.4) → public/data/events/<slug>.json

Pour chaque séisme de pipeline/events.json :
  - paramètres du choc principal (USGS ComCat : heure, position, profondeur, magnitude, PAGER, lien) ;
  - mécanismes au foyer publiés (tenseurs de moment et mécanismes USGS : plans nodaux) ;
  - valeurs du catalogue de référence Peláez et al. (2007) : Mw unifiée, intensité max., agence ;
  - répliques : EMSC + USGS dans la fenêtre (jours, rayon), fusionnées et dédoublonnées,
    + nombre de séismes par jour (pour le graphique et la loi d'Omori).
Rapport : data/events/RAPPORT_EVENEMENTS.md (valeurs à vérifier avant publication).
Rien n'est inventé : un champ absent des sources reste absent.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from datetime import timedelta

from common import DATA, PUBLIC_DATA, haversine_km, now_utc, rel, write_json_atomic
from sources import SourceError, _get, fetch_emsc, fetch_usgs, merge_duplicates, parse_time, USGS_URL

CONFIG = DATA.parent / "pipeline" / "events.json"
OUT = PUBLIC_DATA / "events"
REPORT = DATA / "events" / "RAPPORT_EVENEMENTS.md"


def usgs_detail(event_id: str) -> dict:
    r = _get(USGS_URL, {"eventid": event_id, "format": "geojson"})
    j = r.json()
    p = j["properties"]
    lon, lat, depth = j["geometry"]["coordinates"]
    mechanisms = []
    for kind in ("moment-tensor", "focal-mechanism"):
        for m in p.get("products", {}).get(kind, []):
            mp = m.get("properties", {})
            if not mp.get("nodal-plane-1-strike"):
                continue
            planes = []
            for n in (1, 2):
                if mp.get(f"nodal-plane-{n}-strike"):
                    planes.append({k: round(float(mp[f"nodal-plane-{n}-{k}"]), 0) for k in ("strike", "dip", "rake")})
            mechanisms.append({
                "kind": kind, "source": m.get("source"), "method": mp.get("derived-magnitude-type") or mp.get("beachball-type"),
                "magnitude": float(mp["derived-magnitude"]) if mp.get("derived-magnitude") else None,
                "depth": float(mp["derived-depth"]) if mp.get("derived-depth") else None,
                "planes": planes,
            })
    # Doublons exacts (même solution publiée deux fois)
    seen, unique = set(), []
    for m in mechanisms:
        key = json.dumps(m["planes"])
        if key not in seen:
            seen.add(key)
            unique.append(m)
    return {
        "id": f"usgs:{j['id']}", "usgsId": j["id"], "time": parse_time(p["time"]).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-4] + "Z",
        "lat": lat, "lon": lon, "depth": depth, "mag": p.get("mag"), "magType": p.get("magType"),
        "place": p.get("place"), "alert": p.get("alert"), "url": p.get("url"), "tsunami": bool(p.get("tsunami")),
        "magSource": (p.get("magType") or "") + " (" + (p.get("net") or "").upper() + ")",
        "mechanisms": unique,
    }


def pelaez_match(day: str, near: tuple[float, float] | None) -> dict | None:
    rows = []
    for name in ("instrumental.csv", "historique.csv"):
        with (DATA / "catalogue" / name).open(encoding="utf-8") as f:
            rows += [r for r in csv.DictReader(f) if r["date"].startswith(day)]
    if not rows:
        return None
    def score(r):
        mag = float(r.get("magnitude") or r.get("magnitude_estimee") or 0)
        d = haversine_km(near[0], near[1], float(r["latitude"]), float(r["longitude"])) if near else 0
        return (d > 100, -mag)
    r = sorted(rows, key=score)[0]
    return {
        "id": r["id"], "date": r["date"], "time": r.get("heure_utc") or None,
        "lat": float(r["latitude"]), "lon": float(r["longitude"]),
        "depth": float(r["profondeur_km"]) if r.get("profondeur_km") else None,
        "mw": float(r.get("magnitude") or r.get("magnitude_estimee")),
        "mwMethod": r.get("remarques", "").split(" ; ")[0] if r.get("remarques") else r.get("methode_magnitude"),
        "imax": float(r["intensite_max"]) if r.get("intensite_max") else None,
        "intensityScale": r.get("echelle_intensite") or None,
        "agency": r.get("agence"), "location": r.get("lieu") or r.get("zone_affectee"),
    }


def aftershocks(main: dict, days: int, radius_km: float) -> dict:
    t0 = parse_time(main["time"])
    t1 = t0 + timedelta(days=days)
    dlat = radius_km / 111 + 0.1
    dlon = dlat * 1.3
    bbox = {"min_lat": main["lat"] - dlat, "max_lat": main["lat"] + dlat, "min_lon": main["lon"] - dlon, "max_lon": main["lon"] + dlon}
    status = {}
    try:
        emsc = fetch_emsc(t0 - timedelta(seconds=30), t1, bbox)
        status["EMSC"] = len(emsc)
    except SourceError as e:
        emsc, status["EMSC"] = [], f"indisponible ({e})"
    try:
        usgs = fetch_usgs(t0 - timedelta(seconds=30), t1, bbox)
        status["USGS"] = len(usgs)
    except SourceError as e:
        usgs, status["USGS"] = [], f"indisponible ({e})"
    events, merged = merge_duplicates(emsc, usgs)
    out = []
    for e in events:
        dt = (e["time"] - t0).total_seconds()
        d = haversine_km(main["lat"], main["lon"], e["lat"], e["lon"])
        if d > radius_km or dt < 0:
            continue
        if dt < 20 and d < 50 and e["mag"] is not None and main["mag"] is not None and abs(e["mag"] - main["mag"]) < 0.8:
            continue  # le choc principal lui-même
        out.append(e)
    out.sort(key=lambda e: e["time"])
    per_day = Counter(int((e["time"] - t0).total_seconds() // 86400) for e in out)
    mags = [e["mag"] for e in out if e["mag"] is not None]
    return {
        "window": {"days": days, "radiusKm": radius_km},
        "sources": status, "merged": merged, "count": len(out),
        "maxMag": max(mags) if mags else None,
        "perDay": [per_day.get(i, 0) for i in range(days)],
        # [lon, lat, mag, profondeur, jours après le choc]
        "points": [[round(e["lon"], 3), round(e["lat"], 3), e["mag"], e["depth_km"], round((e["time"] - t0).total_seconds() / 86400, 3)] for e in out],
        "magTypes": dict(Counter((e["mag_type"] or "?").lower() for e in out).most_common(5)),
    }


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    lines = ["# Rapport — données des fiches séismes majeurs\n",
             f"*Généré le {now_utc():%d/%m/%Y à %H:%M} UTC par `pipeline/build_events.py`.* "
             "**Valeurs à vérifier** avant publication (comparer avec les publications de référence).\n"]
    errors = 0
    for ev in config["events"]:
        shocks = []
        lines.append(f"## {ev['slug']}\n")
        for s in ev["shocks"]:
            shock: dict = {"key": s["key"]}
            try:
                if s.get("usgs"):
                    shock["usgs"] = usgs_detail(s["usgs"])
            except SourceError as e:
                errors += 1
                print(f"[{ev['slug']}] USGS indisponible : {e}", file=sys.stderr)
            u = shock.get("usgs")
            if s.get("pelaez"):
                shock["pelaez"] = pelaez_match(s["pelaez"], (u["lat"], u["lon"]) if u else None)
            if u and s.get("aftershocks"):
                shock["aftershocks"] = aftershocks(u, s["aftershocks"]["days"], s["aftershocks"]["radius_km"])
            shocks.append(shock)

            lines.append(f"### Séisme {s['key']}\n")
            if u:
                lines.append(f"- **USGS** `{u['usgsId']}` : {u['time']} · {u['lat']:.3f}, {u['lon']:.3f} · {u['depth']} km · "
                             f"M {u['mag']} {u['magType']} · PAGER {u['alert'] or '—'} · {u['url']}")
                for m in u["mechanisms"]:
                    planes = " ; ".join(f"{p['strike']:.0f}/{p['dip']:.0f}/{p['rake']:.0f}" for p in m["planes"])
                    lines.append(f"  - mécanisme ({m['kind']}, {m['source']}, {m['method'] or '?'}) : plans {planes}")
            pz = shock.get("pelaez")
            if pz:
                lines.append(f"- **Peláez et al. (2007)** `{pz['id']}` : {pz['date']} {pz['time'] or ''} · {pz['lat']}, {pz['lon']} · "
                             f"Mw {pz['mw']} · Imax {pz['imax'] or '—'} {pz['intensityScale'] or ''} · {pz['agency']} · {pz['location']}")
            a = shock.get("aftershocks")
            if a:
                lines.append(f"- **Répliques** ({a['window']['days']} j, {a['window']['radiusKm']} km) : {a['count']} séismes "
                             f"(EMSC {a['sources'].get('EMSC')}, USGS {a['sources'].get('USGS')}, fusionnés {a['merged']}), "
                             f"M max {a['maxMag']}, types {a['magTypes']}")
            lines.append("")
        write_json_atomic(OUT / f"{ev['slug']}.json", {"slug": ev["slug"], "generated": now_utc().isoformat(timespec="seconds"),
                                                       "shocks": shocks})
        print(f"{ev['slug']} → {rel(OUT / (ev['slug'] + '.json'))}")
    lines += ["## Sources\n", "- USGS ANSS ComCat (paramètres, mécanismes au foyer, PAGER) — domaine public.",
              "- EMSC-CSEM et USGS (répliques).",
              "- Peláez J. A. et al. (2007), SRL 78(6), 614–621, doi:10.1785/gssrl.78.6.614 (catalogue de référence).", ""]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Rapport : {rel(REPORT)}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
