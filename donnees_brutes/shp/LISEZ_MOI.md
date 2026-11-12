# shp — couches SIG

Pour chaque couche, copie TOUS les fichiers qui portent le même nom :
`.shp` `.shx` `.dbf` `.prj` (obligatoires) + `.cpg` (encodage, pour les accents et l'arabe).

Sans le `.prj`, le système de coordonnées est inconnu (souvent Lambert Nord Maroc EPSG:26191
ou Lambert Sud Maroc EPSG:26192) : indique-le dans `SOURCES.md` si tu le connais.

Couches utiles pour SismoAtlas :
- limites du Maroc (pays, régions, provinces, communes) — territoire complet
- failles actives (Rif, Atlas, Alboran)
- zonage sismique RPS 2000
- villes / localités (nom, coordonnées)
- géologie, unités structurales du Rif (optionnel)
- intensités macrosismiques de séismes majeurs (optionnel)

Un GeoPackage (.gpkg) ou un GeoJSON convient aussi.
