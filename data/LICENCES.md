# Licences des données redistribuées

| Fichiers | Origine | Licence | Obligation |
|---|---|---|---|
| `catalogue/historique.*`, `catalogue/instrumental.*`, `../public/data/catalogue/reference.json`, `../public/data/events/*.json` (colonnes « pelaez ») | Peláez J. A. et al. (2007), SRL 78(6), 614–621, doi:10.1785/gssrl.78.6.614 | [À COMPLÉTER : conditions à obtenir des auteurs] | **non publiés** (exclus du dépôt par .gitignore, couche absente de la carte) jusqu'à l'accord écrit des auteurs ; seules quelques valeurs sont citées, avec le DOI, dans les fiches des séismes majeurs |
| `catalogue/recent_2006.csv`, `../public/data/catalogue/recent-*.json`, `../public/data/live/*`, `../public/data/events/*.json` (répliques) | EMSC-CSEM, USGS (ANSS ComCat) | USGS : domaine public ; EMSC : CC BY 4.0 (https://www.seismicportal.eu/terms.html, crédit « EMSC-CSEM SeismicPortal ») ; solutions IGN relayées : CC BY 4.0 (Orden FOM/2807/2015) | citer les sources |
| `../public/data/world/*`, mécanismes au foyer et PAGER dans `../public/data/events/*.json` | USGS (ANSS ComCat) | domaine public | citer la source |
| `villes/cities.csv`, `../public/data/cities.json` | GeoNames (cities1000 et noms alternatifs) | CC BY 4.0 | attribution « GeoNames » |
| `villes/noms_arabes_osm.csv` (et les noms arabes repris dans les fichiers ci-dessus) | © contributeurs OpenStreetMap | ODbL 1.0 | attribution « © OpenStreetMap » ; base dérivée redistribuée sous ODbL |
| `sig/gem_faults.geojson`, `../public/data/sig/gem_faults.geojson` | GEM Global Active Faults Database (Styron et Pagani, 2020) | CC BY-SA 4.0 | attribution ; dérivés sous CC BY-SA 4.0 |
| `../public/data/sig/plates.geojson` | Bird (2003), conversion Ahlenius / Nordpil | ODC-By 1.0 | attribution |
| `sig/morocco.geojson`, `../public/data/sig/morocco.geojson` | Natural Earth v5.1.2, Admin 0 – Countries, édition « point de vue du Maroc » (`pipeline/fetch_limits.py`) | domaine public | aucune (citée par principe) |
| Rapports de qualité (`*.md`) | SismoAtlas | CC BY 4.0 | — |
