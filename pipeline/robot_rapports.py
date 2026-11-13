"""
Robot de rapports (CLAUDE.md §5.3) — sans IA : des modèles de texte où seuls chiffres, dates et lieux changent.

1. Détecte les séismes au-dessus des seuils : monde M ≥ 6,5 ou PAGER orange/rouge ; Maroc + alentours M ≥ 4,5.
2. Collecte : paramètres USGS (ou EMSC), mécanismes au foyer, PAGER, répliques, rapports ReliefWeb, actualités GDELT.
3. Écrit un brouillon en FR / AR / EN (src/content/reports/<langue>/<slug>.mdx) + les données de la carte et
   du graphique (public/data/events/<slug>.json, lues par les composants des fiches).
4. Décrit chaque rapport dans un « changeset » (JSON) : le workflow GitHub ouvre UNE Pull Request par rapport.
   Rien n'est publié sans relecture et validation humaine (fusion de la PR).
5. Étapes : préliminaire (H+2), mise à jour (J+1), bilan (J+7). Les mises à jour ne réécrivent que les données
   et le bloc « mises à jour » du texte : les corrections faites par l'équipe sont conservées.

Ne crée jamais de doublon : un séisme/étape est ignoré si le rapport existe déjà avec cette étape, si sa branche
robot/<slug>-<étape> existe (option --existing-branches) ou s'il figure dans data/robot/ignore.json.

Usage :
  python pipeline/robot_rapports.py --changesets out.json [--existing-branches branches.txt]
  python pipeline/robot_rapports.py --event usgs:us7000kufc --now 2023-09-16T00:00:00Z   (test sur un séisme passé)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time as _time
import unicodedata
import zoneinfo
from datetime import datetime, timedelta, timezone
from pathlib import Path

zoneinfo.reset_tzpath([])  # utiliser le paquet tzdata (à jour) plutôt que la base du système

from build_events import aftershocks, usgs_detail
from common import BBOX, DATA, PUBLIC_DATA, ROOT, USER_AGENT, bearing_deg, compass8, haversine_km, rel, write_json_atomic
from sources import SourceError, fetch_emsc, fetch_usgs, merge_duplicates, session

WORLD_MIN_MAG = 6.5
WORLD_PAGER = {"orange", "red"}
LOCAL_MIN_MAG = 4.5
LOOKBACK_DAYS = 10
STAGES = [("preliminaire", timedelta(hours=2)), ("mise-a-jour", timedelta(days=1)), ("bilan", timedelta(days=7))]
REPORTS = ROOT / "src" / "content" / "reports"
STATE = DATA / "robot" / "state.json"
IGNORE = DATA / "robot" / "ignore.json"
LANGS = ("fr", "ar", "en")
TZ = zoneinfo.ZoneInfo("Africa/Casablanca")
SITE = "https://sismoatlas.pages.dev"

# Textes d'interface partagés avec le site (directions, « à 18 km au nord de… »)
I18N = {lang: json.loads((ROOT / "src" / "i18n" / f"{lang}.json").read_text(encoding="utf-8")) for lang in LANGS}

MONTHS = {
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    "ar": ["يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو", "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر"],
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
}

# ------------------------------------------------------------------ modèles de texte (seuls les {…} changent)
T = {
    "fr": {
        "title_local": "Séisme de magnitude {mag} {place} ({date})",
        "title_world": "Séisme de magnitude {mag} : {place} ({date})",
        "description": "Rapport préliminaire sur le séisme de magnitude {mag} du {date} : paramètres, impact estimé, répliques et sources.",
        "notice": "Rapport préparé automatiquement à partir de données publiques, vérifié par l'équipe.",
        "h_summary": "Résumé", "h_params": "Paramètres du séisme", "h_tecto": "Contexte tectonique", "h_impact": "Impact",
        "h_links": "Rapports et actualités", "h_after": "Répliques", "h_map": "Carte", "h_felt": "L'avez-vous ressenti ?",
        "h_sources": "Sources", "h_updates": "Mises à jour",
        "summary": "Un séisme de magnitude {mag} ({magType}) s'est produit le {date} à {timeUtc} UTC ({timeLocal}, heure du Maroc), {place}, à une profondeur d'environ {depth} km{agency}.",
        "agency_src": " (source : {agency})",
        "world_place": "dans la région décrite par l'USGS comme « {place} »",
        "pager": {"green": "Le système PAGER de l'USGS estime un impact faible (alerte verte).",
                  "yellow": "Le système PAGER de l'USGS estime un impact modéré (alerte jaune).",
                  "orange": "Le système PAGER de l'USGS estime un impact important (alerte orange).",
                  "red": "Le système PAGER de l'USGS estime un impact très important (alerte rouge)."},
        "pager_none": "Aucun niveau d'impact PAGER n'est publié pour ce séisme à cette heure.",
        "tsunami": "Il s'agit d'un séisme fort en mer : les centres d'alerte peuvent publier une information tsunami ; ce signal ne signifie pas qu'un tsunami s'est produit.",
        "todo_summary": "relire et compléter le résumé (ressenti, premiers bilans officiels)",
        "todo_tecto": "contexte tectonique de la région, failles possibles, séismes historiques proches",
        "todo_impact": "bilan humain et matériel avec sources officielles",
        "reliefweb_missing": "ReliefWeb non consulté : identifiant d'application (appname) à configurer",
        "links_none": "Aucun lien trouvé automatiquement.",
        "links_note": "Liens trouvés automatiquement, à vérifier avant toute citation :",
        "felt": "Si vous avez ressenti ce séisme, vous pouvez témoigner sur le formulaire de l'agence :",
        "felt_link": "formulaire de témoignage",
        "stage": {"preliminaire": "rapport préliminaire (H+2)", "mise-a-jour": "mise à jour (J+1)", "bilan": "bilan (J+7)"},
        "updated_on": "{stage} : données du {when} UTC",
        "src_usgs": "USGS, page de l'événement", "src_emsc": "EMSC-CSEM, page de l'événement",
    },
    "ar": {
        "title_local": "زلزال بقوة {mag} {place} ({date})",
        "title_world": "زلزال بقوة {mag}: {place} ({date})",
        "description": "تقرير أولي حول الزلزال بقوة {mag} بتاريخ {date}: المعطيات، والتأثير المقدَّر، والهزات الارتدادية، والمصادر.",
        "notice": "تقرير أُعِدّ آليًا انطلاقًا من بيانات عمومية، وراجعه الفريق.",
        "h_summary": "ملخص", "h_params": "معطيات الزلزال", "h_tecto": "السياق التكتوني", "h_impact": "التأثير",
        "h_links": "تقارير وأخبار", "h_after": "الهزات الارتدادية", "h_map": "الخريطة", "h_felt": "هل شعرت به؟",
        "h_sources": "المصادر", "h_updates": "التحديثات",
        "summary": "وقع زلزال بقوة {mag} ({magType}) يوم {date} على الساعة {timeUtc} بالتوقيت العالمي ({timeLocal} بتوقيت المغرب)، {place}، على عمق يقارب {depth} كلم{agency}.",
        "agency_src": " (المصدر: {agency})",
        "world_place": "في المنطقة التي تصفها هيئة المسح الجيولوجي الأمريكية بـ «{place}»",
        "pager": {"green": "يقدّر نظام PAGER التابع لهيئة المسح الجيولوجي الأمريكية تأثيرًا ضعيفًا (إنذار أخضر).",
                  "yellow": "يقدّر نظام PAGER التابع لهيئة المسح الجيولوجي الأمريكية تأثيرًا متوسطًا (إنذار أصفر).",
                  "orange": "يقدّر نظام PAGER التابع لهيئة المسح الجيولوجي الأمريكية تأثيرًا كبيرًا (إنذار برتقالي).",
                  "red": "يقدّر نظام PAGER التابع لهيئة المسح الجيولوجي الأمريكية تأثيرًا كبيرًا جدًا (إنذار أحمر)."},
        "pager_none": "لم يُنشر أي مستوى تأثير PAGER لهذا الزلزال حتى الآن.",
        "tsunami": "يتعلق الأمر بزلزال قوي في البحر: قد تنشر مراكز الإنذار معلومة حول التسونامي، وهذه الإشارة لا تعني أن تسونامي قد وقع.",
        "todo_summary": "مراجعة الملخص واستكماله (الإحساس بالهزة، الحصيلة الرسمية الأولى)",
        "todo_tecto": "السياق التكتوني للمنطقة، الفوالق المحتملة، الزلازل التاريخية القريبة",
        "todo_impact": "الحصيلة البشرية والمادية مع المصادر الرسمية",
        "reliefweb_missing": "لم تتم استشارة ReliefWeb: يجب إعداد معرّف التطبيق (appname)",
        "links_none": "لم يُعثر آليًا على أي رابط.",
        "links_note": "روابط عُثر عليها آليًا، يجب التحقق منها قبل أي اقتباس:",
        "felt": "إذا شعرت بهذا الزلزال، يمكنك الإدلاء بشهادتك عبر استمارة الهيئة:",
        "felt_link": "استمارة الشهادات",
        "stage": {"preliminaire": "تقرير أولي (بعد ساعتين)", "mise-a-jour": "تحديث (بعد يوم)", "bilan": "حصيلة (بعد 7 أيام)"},
        "updated_on": "{stage}: بيانات {when} بالتوقيت العالمي",
        "src_usgs": "هيئة المسح الجيولوجي الأمريكية، صفحة الحدث", "src_emsc": "EMSC-CSEM، صفحة الحدث",
    },
    "en": {
        "title_local": "Magnitude {mag} earthquake {place} ({date})",
        "title_world": "Magnitude {mag} earthquake: {place} ({date})",
        "description": "Preliminary report on the magnitude {mag} earthquake of {date}: parameters, estimated impact, aftershocks and sources.",
        "notice": "Report prepared automatically from public data, checked by the team.",
        "h_summary": "Summary", "h_params": "Earthquake parameters", "h_tecto": "Tectonic setting", "h_impact": "Impact",
        "h_links": "Reports and news", "h_after": "Aftershocks", "h_map": "Map", "h_felt": "Did you feel it?",
        "h_sources": "Sources", "h_updates": "Updates",
        "summary": "A magnitude {mag} ({magType}) earthquake occurred on {date} at {timeUtc} UTC ({timeLocal} Morocco time), {place}, at a depth of about {depth} km{agency}.",
        "agency_src": " (source: {agency})",
        "world_place": "in the area described by the USGS as “{place}”",
        "pager": {"green": "The USGS PAGER system estimates a low impact (green alert).",
                  "yellow": "The USGS PAGER system estimates a moderate impact (yellow alert).",
                  "orange": "The USGS PAGER system estimates a significant impact (orange alert).",
                  "red": "The USGS PAGER system estimates a very significant impact (red alert)."},
        "pager_none": "No PAGER impact level has been published for this earthquake so far.",
        "tsunami": "This is a strong offshore earthquake: warning centres may issue tsunami information; this flag does not mean a tsunami occurred.",
        "todo_summary": "review and complete the summary (felt reports, first official figures)",
        "todo_tecto": "tectonic setting of the area, possible faults, nearby historical earthquakes",
        "todo_impact": "human and material toll with official sources",
        "reliefweb_missing": "ReliefWeb not queried: application name (appname) to be configured",
        "links_none": "No link found automatically.",
        "links_note": "Links found automatically, to be checked before any citation:",
        "felt": "If you felt this earthquake, you can share your experience on the agency's form:",
        "felt_link": "testimony form",
        "stage": {"preliminaire": "preliminary report (H+2)", "mise-a-jour": "update (D+1)", "bilan": "summary (D+7)"},
        "updated_on": "{stage}: data as of {when} UTC",
        "src_usgs": "USGS, event page", "src_emsc": "EMSC-CSEM, event page",
    },
}


# ------------------------------------------------------------------ mise en forme
def fmt_num(v: float | None, lang: str, nd: int = 1) -> str:
    if v is None:
        return "?"
    s = f"{v:.{nd}f}"
    return s.replace(".", ",") if lang in ("fr", "ar") else s


def long_date(dt: datetime, lang: str) -> str:
    m = MONTHS[lang][dt.month - 1]
    return f"{dt.day} {m} {dt.year}"


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def load_cities() -> list[dict]:
    return json.loads((PUBLIC_DATA / "cities.json").read_text(encoding="utf-8"))["cities"]


def nearest(cities: list[dict], lat: float, lon: float, min_pop: int = 5000) -> dict | None:
    best = min((c for c in cities if c["pop"] >= min_pop), key=lambda c: haversine_km(lat, lon, c["lat"], c["lon"]), default=None)
    if not best:
        return None
    return {**best, "km": round(haversine_km(lat, lon, best["lat"], best["lon"])), "dir": compass8(bearing_deg(best["lat"], best["lon"], lat, lon))}


def place_phrase(c: dict | None, lang: str) -> str:
    """Même règle que le site (src/lib/quake.ts) : « à 18 km au nord d'Al Hoceima »."""
    if not c:
        return ""
    t = I18N[lang]
    city = (c.get("ar") or c["fr"]) if lang == "ar" else c[lang]
    elide = lang == "fr" and city[:1].lower() in "aeiouâàéèêîïôûœ"
    of_city = t["place.ofElided" if elide else "place.of"].replace("{city}", city)
    if c["km"] < 5:
        return t["place.near"].replace("{ofCity}", of_city).replace("{city}", city)
    return t["place.far"].replace("{km}", str(c["km"])).replace("{dir}", t[f"dir.{c['dir']}"]).replace("{ofCity}", of_city).replace("{city}", city)


# ------------------------------------------------------------------ détection
def detect(now: datetime) -> list[dict]:
    start = now - timedelta(days=LOOKBACK_DAYS)
    found: list[dict] = []
    world = fetch_usgs(start, now, bbox=None, min_mag=6.0)
    for e in world:
        if (e["mag"] or 0) >= WORLD_MIN_MAG or e.get("alert") in WORLD_PAGER:
            found.append({**e, "scope": "world"})
    local_usgs = [e for e in fetch_usgs(start, now, min_mag=LOCAL_MIN_MAG)]
    local_emsc = [e for e in fetch_emsc(start, now, min_mag=LOCAL_MIN_MAG) if e["evtype"] in ("", "ke", "se")]
    merged, _ = merge_duplicates(local_usgs, local_emsc)  # USGS prioritaire ici : identifiant utilisé par la carte du monde
    for e in merged:
        if (e["mag"] or 0) >= LOCAL_MIN_MAG and not any(f["id"] == e["id"] for f in found):
            found.append({**e, "scope": "local"})
    return found


def fetch_event(event_id: str) -> dict:
    src, _, ident = event_id.partition(":")
    if src == "usgs":
        d = usgs_detail(ident)
        lat, lon = d["lat"], d["lon"]
        in_zone = BBOX["min_lat"] <= lat <= BBOX["max_lat"] and BBOX["min_lon"] <= lon <= BBOX["max_lon"]
        return {"id": event_id, "time": datetime.fromisoformat(d["time"].replace("Z", "+00:00")), "lat": lat, "lon": lon,
                "mag": d["mag"], "scope": "local" if in_zone else "world", "source": "USGS",
                "region": d["place"] or "", "tsunami": d.get("tsunami", False), "other_ids": []}
    raise SystemExit("--event : seuls les identifiants « usgs:… » sont acceptés en mode test")


# ------------------------------------------------------------------ données (carte, graphique, paramètres)
def emsc_shock(e: dict) -> dict:
    return {"source": "EMSC", "id": e["id"], "usgsId": e.get("unid") or e["id"].split(":", 1)[1],
            "time": e["time"].strftime("%Y-%m-%dT%H:%M:%S.%f")[:-4] + "Z", "lat": e["lat"], "lon": e["lon"],
            "depth": e["depth_km"], "mag": e["mag"], "magType": e["mag_type"], "place": e["region"], "alert": None,
            "url": e["url"], "mechanisms": []}


def build_data(event: dict, now: datetime) -> dict:
    if event["id"].startswith("usgs:"):
        main = usgs_detail(event["id"].split(":", 1)[1])
        main["source"] = "USGS"
    else:
        main = emsc_shock(event)
    t0 = datetime.fromisoformat(main["time"].replace("Z", "+00:00"))
    days = max(1, min(120, math.ceil((now - t0).total_seconds() / 86400)))
    radius = round(max(30.0, 20 * 2 ** ((main["mag"] or 5) - 5)))  # rayon de recherche indicatif, croît avec la magnitude
    shock = {"key": t0.strftime("%Y"), "usgs": main}
    try:
        shock["aftershocks"] = aftershocks(main, days, radius)
    except SourceError as err:
        print(f"[robot] répliques indisponibles : {err}", file=sys.stderr)
    return {"slug": None, "generated": now.isoformat(timespec="seconds"), "shocks": [shock]}


def reliefweb_links(event: dict, country_hint: str) -> list[dict] | None:
    """Rapports ReliefWeb (API v2 : identifiant d'application approuvé obligatoire). None si non configuré."""
    appname = os.environ.get("RELIEFWEB_APPNAME")
    if not appname:
        return None
    t0 = event["time"]
    body = {"query": {"value": f"earthquake {country_hint}".strip()}, "limit": 5, "sort": ["date:desc"],
            "fields": {"include": ["title", "url_alias", "source.shortname", "date.created"]},
            "filter": {"field": "date.created", "value": {"from": t0.strftime("%Y-%m-%dT00:00:00+00:00")}}}
    try:
        r = session.post(f"https://api.reliefweb.int/v2/reports?appname={appname}", json=body, timeout=60)
        r.raise_for_status()
        return [{"title": d["fields"]["title"], "url": d["fields"].get("url_alias") or d.get("href", ""),
                 "source": ", ".join(s["shortname"] for s in d["fields"].get("source", []))} for d in r.json().get("data", [])]
    except Exception as err:  # service externe : ne bloque jamais le rapport
        print(f"[robot] ReliefWeb indisponible : {err}", file=sys.stderr)
        return []


def gdelt_links(event: dict, keywords: str) -> list[dict]:
    """Actualités GDELT DOC 2.0 (une requête, au mieux : limite d'une requête toutes les 5 s)."""
    t0 = event["time"]
    params = {"query": f"earthquake {keywords}".strip(), "mode": "artlist", "format": "json", "maxrecords": 8,
              "startdatetime": t0.strftime("%Y%m%d%H%M%S"), "enddatetime": (t0 + timedelta(days=3)).strftime("%Y%m%d%H%M%S")}
    try:
        _time.sleep(6)
        r = session.get("https://api.gdeltproject.org/api/v2/doc/doc", params=params, timeout=60)
        data = r.json()
        return [{"title": a["title"], "url": a["url"], "source": a.get("domain", "")} for a in data.get("articles", [])][:8]
    except Exception as err:
        print(f"[robot] GDELT indisponible : {err}", file=sys.stderr)
        return []


# ------------------------------------------------------------------ texte du rapport
UPD_START, UPD_END = "{/* robot:mises-a-jour */}", "{/* /robot:mises-a-jour */}"


def updates_block(lang: str, history: dict[str, str]) -> str:
    t = T[lang]
    lines = [f"- {t['updated_on'].format(stage=t['stage'][s], when=when)}" for s, when in history.items()]
    return f"{UPD_START}\n## {t['h_updates']}\n\n" + "\n".join(lines) + f"\n{UPD_END}"


def report_mdx(lang: str, slug: str, event: dict, data: dict, place: str, links: dict, history: dict, now: datetime) -> str:
    t = T[lang]
    main = data["shocks"][0]["usgs"]
    t0 = datetime.fromisoformat(main["time"].replace("Z", "+00:00"))
    mag = fmt_num(main["mag"], lang)
    date = long_date(t0, lang)
    title = (t["title_local"] if event["scope"] == "local" else t["title_world"]).format(mag=mag, place=place, date=date)
    summary = t["summary"].format(
        mag=mag, magType=main.get("magType") or "?", date=date, timeUtc=t0.strftime("%H:%M"),
        timeLocal=t0.astimezone(TZ).strftime("%H:%M"), place=place, depth=fmt_num(main.get("depth"), lang, 0),
        agency=t["agency_src"].format(agency=main.get("source", "USGS")),
    )
    impact = [t["pager"][main["alert"]] if main.get("alert") in t["pager"] else t["pager_none"]]
    if event.get("tsunami"):
        impact.append(t["tsunami"])
    refs = [{"citation": f"{t['src_usgs'] if main.get('source') == 'USGS' else t['src_emsc']} ({main['usgsId']})", "url": main["url"]}]

    link_lines: list[str] = []
    if links["reliefweb"] is None:
        link_lines.append(f"- [À COMPLÉTER : {t['reliefweb_missing']}]")
    items = (links["reliefweb"] or []) + links["gdelt"]
    if items:
        link_lines.insert(0, t["links_note"])
        for a in items:
            suffix = f" — {a['source']}" if a.get('source') else ''
            link_lines.append(f"- [{a['title']}]({a['url']}){suffix}")
    elif links["reliefweb"] is not None:
        link_lines.append(t["links_none"])

    felt_url = (f"https://www.emsc-csem.org/Earthquake_information/earthquake_testimonies.php?id={event['emsc_source_id']}"
                if event.get("emsc_source_id") else (f"{main['url']}/tellus" if main.get("source") == "USGS" else main["url"]))

    front = {
        "title": title, "description": t["description"].format(mag=mag, date=date), "date": now.strftime("%Y-%m-%d"),
        "updated": now.strftime("%Y-%m-%d"), "author": "SismoAtlas (robot)", "lang": lang, "translationKey": slug,
        "category": "report", "tags": ["rapport automatique"], "license": "CC BY 4.0", "draft": False,
    }
    lines = ["---"] + [f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in front.items()]
    lines.append("references:")
    for r in refs:
        lines += [f"  - citation: {json.dumps(r['citation'], ensure_ascii=False)}", f"    url: {json.dumps(r['url'])}"]
    lines.append("eventIds:")
    lines += [f"  - {json.dumps(i)}" for i in event["all_ids"]]
    lines += ["---",
              "import EventParams from '../../../components/quake/EventParams.astro';",
              "import FocalMechanisms from '../../../components/quake/FocalMechanisms.astro';",
              "import AftershockChart from '../../../components/quake/AftershockChart.astro';",
              "import EventMap from '../../../components/quake/EventMap.astro';",
              "", f"> {t['notice']}", "",
              f"## {t['h_summary']}", "", summary, "", f"[À COMPLÉTER : {t['todo_summary']}]", "",
              f"## {t['h_params']}", "", f'<EventParams event="{slug}" />', "", f'<FocalMechanisms event="{slug}" />', "",
              f"## {t['h_tecto']}", "", f"[À COMPLÉTER : {t['todo_tecto']}]", "",
              f"## {t['h_impact']}", "", " ".join(impact), "", f"[À COMPLÉTER : {t['todo_impact']}]", "",
              f"### {t['h_links']}", "", *link_lines, "",
              f"## {t['h_after']}", "", f'<AftershockChart event="{slug}" />', "",
              f"## {t['h_map']}", "", f'<EventMap event="{slug}" />', "",
              f"## {t['h_felt']}", "", f"{t['felt']} [{t['felt_link']}]({felt_url}).", "",
              f"## {t['h_sources']}", "",
              f"- [{refs[0]['citation']}]({refs[0]['url']})",
              "- EMSC-CSEM, USGS — " + ("répliques" if lang == "fr" else "الهزات الارتدادية" if lang == "ar" else "aftershocks"),
              "", updates_block(lang, history), ""]
    return "\n".join(lines)


# ------------------------------------------------------------------ traitement d'un séisme
def stage_done(slug: str, stage: str, state: dict, branches: set[str]) -> bool:
    return stage in state.get(slug, {}).get("stages", {}) or f"robot/{slug}-{stage}" in branches


def process(event: dict, now: datetime, state: dict, branches: set[str], cities: list[dict]) -> dict | None:
    age = now - event["time"]
    if age < STAGES[0][1]:
        return None  # moins de 2 h : on attend que les paramètres se stabilisent

    # Lieu et identifiant lisible
    if event["scope"] == "local":
        c = nearest(cities, event["lat"], event["lon"])
        places = {lang: place_phrase(c, lang) or event.get("region", "") for lang in LANGS}
        name = c["fr"] if c else event.get("region", "maroc")
        keywords = f"{c['en']} Morocco" if c else "Morocco"
    else:
        raw = event.get("region") or ""
        places = {lang: T[lang]["world_place"].format(place=raw) for lang in LANGS}
        name = raw.split(",")[-1] if raw else "monde"
        keywords = raw.split(",")[-1].strip()
    slug = slugify(f"{event['time']:%Y-%m-%d}-{name}-m{fmt_num(event['mag'], 'en')}")

    due = [s for s, delay in STAGES if age >= delay and not stage_done(slug, s, state, branches)]
    if not due:
        return None
    stage = due[-1]  # si plusieurs étapes sont dues (robot arrêté), on ne fait que la plus récente
    history = dict(state.get(slug, {}).get("stages", {}))
    for s in due:
        history[s] = now.strftime("%Y-%m-%d %H:%M")

    data = build_data(event, now)
    data["slug"] = slug
    data_path = PUBLIC_DATA / "events" / f"{slug}.json"
    write_json_atomic(data_path, data)
    files = [data_path]

    main = data["shocks"][0]["usgs"]
    event.setdefault("tsunami", bool(event.get("tsunami")))
    for lang in LANGS:
        path = REPORTS / lang / f"{slug}.mdx"
        if path.exists():
            # Mise à jour : on ne touche qu'à la date et au bloc des mises à jour (le texte relu est conservé)
            text = path.read_text(encoding="utf-8")
            text = re.sub(r'^updated: ".*"$', f'updated: "{now:%Y-%m-%d}"', text, count=1, flags=re.M)
            text = re.sub(re.escape(UPD_START) + r".*?" + re.escape(UPD_END), lambda m: updates_block(lang, history), text, flags=re.S)
        else:
            if lang == "fr":
                links = {"reliefweb": reliefweb_links(event, keywords), "gdelt": gdelt_links(event, keywords)}
            text = report_mdx(lang, slug, event, data, places[lang], links, history, now)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        files.append(path)

    state[slug] = {"event": event["id"], "scope": event["scope"], "stages": history}
    after = data["shocks"][0].get("aftershocks") or {}
    title = f"{T['fr']['stage'][stage][:1].upper()}{T['fr']['stage'][stage][1:]} — M {fmt_num(main['mag'], 'fr')} {places['fr']}"
    body = "\n".join([
        f"Rapport généré automatiquement ({T['fr']['stage'][stage]}) pour le séisme `{event['id']}`.",
        "",
        f"- Magnitude : **{fmt_num(main['mag'], 'fr')} {main.get('magType') or ''}** ({main.get('source')}) — {main['url']}",
        f"- Date : {main['time']} · profondeur {fmt_num(main.get('depth'), 'fr', 0)} km · PAGER : {main.get('alert') or '—'}",
        f"- Répliques à ce jour : {after.get('count', '—')} (rayon {after.get('window', {}).get('radiusKm', '—')} km)",
        "",
        "### À faire avant de fusionner (fusionner = publier)",
        "- [ ] Vérifier les paramètres et le lieu",
        "- [ ] Remplacer tous les `[À COMPLÉTER : …]` (FR, puis AR et EN)",
        "- [ ] Ajouter le bilan humain et matériel avec des sources officielles",
        "- [ ] Vérifier les liens d'actualité avant de les garder",
        "",
        "Pour refuser ce rapport : fermer la PR et ajouter l'identifiant dans `data/robot/ignore.json`.",
    ])
    return {"event": event["id"], "slug": slug, "stage": stage, "branch": f"robot/{slug}-{stage}", "title": title, "body": body,
            "files": [rel(p) for p in files] + [rel(STATE)]}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--changesets", type=Path, default=DATA / "robot" / "changesets.json")
    p.add_argument("--existing-branches", type=Path, help="fichier : une branche distante par ligne")
    p.add_argument("--event", help="traiter un seul séisme (ex. usgs:us7000kufc) — mode test")
    p.add_argument("--now", help="date simulée (ISO, UTC) — mode test")
    args = p.parse_args()

    now = datetime.fromisoformat(args.now.replace("Z", "+00:00")) if args.now else datetime.now(timezone.utc)
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    ignore = set(json.loads(IGNORE.read_text(encoding="utf-8"))) if IGNORE.exists() else set()
    branches = set()
    if args.existing_branches and args.existing_branches.exists():
        branches = {line.strip().removeprefix("refs/heads/") for line in args.existing_branches.read_text().splitlines() if line.strip()}
    cities = load_cities()

    try:
        events = [fetch_event(args.event)] if args.event else detect(now)
    except SourceError as err:
        print(f"[robot] sources indisponibles : {err}", file=sys.stderr)
        sys.exit(1)

    changesets = []
    for e in events:
        e.setdefault("all_ids", [e["id"], *e.get("other_ids", [])])
        if e.get("source") == "EMSC" or e["id"].startswith("emsc:"):
            e["emsc_source_id"] = e.get("source_id")
        else:
            e["emsc_source_id"] = None
        if e["id"] in ignore:
            continue
        cs = process(e, now, state, branches, cities)
        if cs:
            changesets.append(cs)
            print(f"[robot] {cs['branch']} : {cs['title']}")
    STATE.parent.mkdir(parents=True, exist_ok=True)
    write_json_atomic(STATE, state, compact=False)
    write_json_atomic(args.changesets, changesets, compact=False)
    print(f"[robot] {len(events)} séisme(s) au-dessus des seuils, {len(changesets)} rapport(s) à proposer → {rel(args.changesets)}")


if __name__ == "__main__":
    main()
