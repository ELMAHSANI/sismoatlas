# Rapport de qualité — import du catalogue de référence

*Généré le 12/11/2026 à 13:28 UTC par `pipeline/import_catalogue.py`.*

**Source** : `donnees_brutes/excel/moroccan_catalog1045_2005.xls` (Peláez et al., 2007, version septembre 2007), feuille « Catalog ».

## Volumes

| | Lignes |
|---|---|
| Lues dans le fichier | 1738 |
| Historique (avant 1900) → `historique.csv` | 113 |
| Instrumental (1900–2005) → `instrumental.csv` | 1625 |

L'article annonce 1 739 séismes principaux ; le fichier en contient 1738. [À COMPLÉTER : écart d'une ligne à expliquer avec les auteurs]

## Valeurs aberrantes

Aucune : toutes les coordonnées sont dans la zone de l'article (27–37 °N, 15 °W–1 °E), toutes les Mw entre 3 et 9, profondeurs entre 0 et 700 km, dates et heures valides.

## Doublons

- Doublons exacts (même date, heure, minute et position) : **0**.
- Quasi-doublons (≤ 1 min et ≤ 30 km) : **0**.

Le catalogue étant déclusterisé par les auteurs, aucun doublon n'est attendu.

## Champs manquants

| Champ du fichier | Vides | % |
|---|---|---|
| mois | 4 | 0.2 |
| jour | 7 | 0.4 |
| heure | 15 | 0.9 |
| minute | 24 | 1.4 |
| seconde | 134 | 7.7 |
| profondeur | 366 | 21.1 |
| magnitude d'origine | 279 | 16.1 |
| intensité max. | 1132 | 65.1 |

Champs de la structure cible **absents du fichier** (laissés vides, rien n'est inventé) : `id_agence`, `province`, `region` (à calculer quand la couche des limites sera fournie), `victimes`, `blesses`, `tsunami`, `description_effets`, `fiabilite`, `precision_localisation_km`, `intensite_epicentrale` (le fichier donne l'intensité **maximale** EMS-98, rangée dans `intensite_max`).

## Répartitions

**Par agence** : IGN 1287, SPGM 330, CRAAG 59, NEIC 23, BCIS 17, ISC 12, HIST 7, IMGP 3.

**Méthode d'obtention de la Mw** :

- code 1 — Mw publiée : 59
- code 2 — Mw calculée à partir des intensités (Bakun et Wentworth, 1997, 1999) : 10
- code 3 — Mw convertie depuis Ms : 62
- code 4 — Mw convertie depuis mbLg : 1069
- code 5 — Mw convertie depuis mb : 200
- code 6 — Mw convertie depuis ML : 6
- code 7 — Mw convertie depuis Imax : 257
- code 8 — Mw convertie depuis MD : 53
- code 9 — Mw d'après l'intensité épicentrale réévaluée (épicentre en mer) : 22

**Par magnitude (Mw)** : 3–4 : 1217, 4–5 : 380, 5–6 : 113, 6–7 : 24, 7–10 : 4.

## Transformations appliquées

- Coordonnées : nombres en millièmes de degré divisés par 1 000 ; les longitudes saisies en texte (déjà en degrés, proches du méridien 0 : 128 lignes avec |lon| < 1°) lues telles quelles.
- Dates en ISO 8601, partielles si le mois ou le jour manque (colonne `precision_date` pour l'historique, mention dans `remarques` pour l'instrumental).
- `magnitude` = Mw unifiée par les auteurs ; la magnitude et le type d'origine sont conservés.
- Identifiants `PEL-0001`… dans l'ordre du fichier (stables tant que le fichier ne change pas).

