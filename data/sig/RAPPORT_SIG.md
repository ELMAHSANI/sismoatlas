# Rapport — conversion des couches SIG

*Généré le 17/11/2026 à 00:35 UTC par `pipeline/convert_shp.py`.*

Dossier analysé : `donnees_brutes` · simplification web : tolérance 0.002° · sortie en WGS84 (EPSG:4326).

**Aucune couche à convertir.** Déposez vos couches dans `donnees_brutes/shp/` (.shp avec .shx, .dbf, .prj et si possible .cpg ; ou .gpkg / .geojson).

Les limites du Maroc (territoire complet) proviennent de Natural Earth, domaine public : `pipeline/fetch_limits.py`.

## Fichiers ignorés

- `donnees_brutes/catalogue de sismicite/1045_2023.dbf` : table attributaire seule (pas de .shp) — ignorée par ce script.
- `donnees_brutes/shp/Morocco.shp` : remplacée par Natural Earth, domaine public (`pipeline/fetch_limits.py`), faute de licence connue — ignorée par ce script.
