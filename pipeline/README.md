# Pipeline de données SismoAtlas

Scripts Python qui transforment les données brutes et les données en ligne en fichiers propres pour le site.
Les originaux de `donnees_brutes/` ne sont jamais modifiés.

## Installation (une fois)

```bash
py -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt     # Windows
# .venv/bin/python -m pip install -r pipeline/requirements.txt       # Linux / macOS
```

## Scripts, dans l'ordre

| Script | Rôle | Entrées | Sorties | Fréquence |
|---|---|---|---|---|
| `import_catalogue.py` | Catalogue de référence Peláez et al. (2007), 1045–2005 | `donnees_brutes/excel/moroccan_catalog1045_2005.xls` | `data/catalogue/{historique,instrumental,sources}.csv` + GeoJSON + `RAPPORT_QUALITE.md` | quand le fichier change |
| `convert_shp.py` | Couches SIG → WGS84, version complète et version web simplifiée | `donnees_brutes/**/*.shp, .gpkg, .geojson` | `data/sig/`, `public/data/sig/` + `RAPPORT_SIG.md` | quand une couche est ajoutée |
| `build_cities.py` | Villes de référence FR / AR / EN | GeoNames (téléchargé, cache `.cache/`) + `data/villes/noms_arabes_osm.csv` | `data/villes/cities.csv`, `public/data/cities.json` + `RAPPORT_VILLES.md` | rarement |
| `fetch_recent_catalogue.py` | Sismicité depuis 2006 (EMSC + USGS) | services FDSN en ligne | `data/catalogue/recent_2006.csv` + `RAPPORT_RECENT.md` | mensuelle |
| `fetch_faults.py` | Failles actives GEM (Styron et Pagani, 2020, CC BY-SA 4.0), zone Maroc | GitHub GEM (cache `.cache/`) | `public/data/sig/gem_faults.geojson` | rarement |
| `build_events.py` | Données des fiches séismes majeurs : paramètres USGS, mécanismes au foyer, valeurs Peláez, répliques | `pipeline/events.json` + USGS/EMSC + `data/catalogue/` | `public/data/events/<slug>.json` + `data/events/RAPPORT_EVENEMENTS.md` | à l'ajout d'une fiche |
| `build_map_data.py` | Données de la carte complète (formats compacts) + limites de plaques (Bird, 2003, ODC-By) | `data/catalogue/` + GitHub fraxen/tectonicplates | `public/data/catalogue/{reference,recent-m2,recent-small}.json`, `public/data/sig/plates.geojson` | après chaque mise à jour des catalogues |
| `robot_rapports.py` | Robot de rapports : seuils, brouillons FR/AR/EN, données carte/graphique, une PR par rapport (voir `docs/ROBOT.md`) | USGS, EMSC, ReliefWeb (si `RELIEFWEB_APPNAME`), GDELT | `src/content/reports/`, `public/data/events/`, `data/robot/state.json` | toutes les 15 min (`robot.yml`) |
| `fetch_live.py` | Séismes récents (Maroc 30 j) et grands séismes mondiaux (M ≥ 6, 1 an) | services FDSN en ligne | `public/data/live/{24h,7d,30d}.geojson`, `public/data/world/{7d,30d,1y}.geojson` | toutes les 15 min (`data-live.yml`) |

```bash
.venv/Scripts/python pipeline/import_catalogue.py
.venv/Scripts/python pipeline/convert_shp.py
.venv/Scripts/python pipeline/build_cities.py
.venv/Scripts/python pipeline/fetch_recent_catalogue.py
.venv/Scripts/python pipeline/fetch_faults.py
.venv/Scripts/python pipeline/build_events.py
.venv/Scripts/python pipeline/build_map_data.py
.venv/Scripts/python pipeline/fetch_live.py
```

Sous Windows, ajouter `PYTHONIOENCODING=utf-8` si la console affiche mal les accents.

## Noms arabes des villes

GeoNames a peu de noms arabes pour les petites villes marocaines. Ils ont été complétés une fois à partir d'une couche
OpenStreetMap de l'utilisateur (même nom latin, moins de 10 km) :

```bash
.venv/Scripts/python pipeline/build_cities.py --osm-names "<chemin>/Villes.shp" --check-osm "<chemin>/Villes.shp"
```

Le résultat est conservé dans `data/villes/noms_arabes_osm.csv` et réappliqué automatiquement ensuite.
Pour corriger un nom arabe à la main, modifier ce fichier puis relancer `build_cities.py`.

## Règles

- Fusion des doublons entre agences : même séisme si écart ≤ 20 s et ≤ 50 km ; l'EMSC est l'agence de référence
  pour la zone Maroc (il relaie l'IGN espagnol et les agences régionales), l'identifiant USGS est conservé.
- Profondeur : `shallow` < 70 km ≤ `intermediate` < 300 km ≤ `deep` (classes usuelles de l'USGS).
- Îles Canaries signalées (`canaries: true`) pour pouvoir les écarter des statistiques « Maroc ».
- Si une source principale est indisponible, les fichiers existants sont conservés (jamais de liste vide publiée
  par erreur) et le script se termine avec le code 1.

## Automatisations (GitHub Actions, `.github/workflows/`)

| Workflow | Quand | Rôle |
|---|---|---|
| `data-live.yml` | toutes les 15 min | `fetch_live.py`, publie `live/` et `world/` sur GitHub Pages (sans commit ; voir `docs/HEBERGEMENT.md`) |
| `rebuild.yml` | chaque jour | reconstruit le site sur Cloudflare Pages (deploy hook) |
| `robot.yml` | toutes les 15 min (décalé) | robot de rapports, une Pull Request par rapport |
| `catalogue.yml` | le 1er du mois | `fetch_recent_catalogue.py` + `build_map_data.py` |
| `check.yml` | chaque PR et push sur main | contenus publiés complets, types, construction du site |
