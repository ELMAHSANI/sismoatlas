# Rapport d'analyse des données brutes — Phase 1

*Analyse du 12/11/2026. Lecture seule : aucun fichier de `donnees_brutes/` n'a été modifié
(un fichier y a seulement été **ajouté** : `excel/moroccan_catalog1045_2005.xls`).*

> **Phase 1 clôturée le 12/11/2026.** La stratégie de la section 7 (option A pour la V1) est validée et reportée dans
> `CLAUDE.md` §4.2. Les points 3 à 7 et 9 de la section 5 concernent l'ancien fichier `1045_2023`, désormais réservé
> aux contrôles croisés : ils ne bloquent plus rien. Restent ouverts : la couche des limites du Maroc (avant la phase 4),
> et la licence du fichier Peláez (à voir avec les auteurs).
>
> **Mise à jour phase 3 (12/11/2026)** : le M 6 du 13/02/2015 (34,555 °N −5,907 °E) est absent des catalogues
> EMSC et USGS (seul séisme de la zone ce jour-là : mb 2,9 au large d'Arzew). C'est une erreur de l'ancien
> fichier `1045_2023`, qui n'est de toute façon plus publié.

---

## 1. Inventaire de `donnees_brutes/`

| Dossier | Contenu | État |
|---|---|---|
| `catalogue de sismicite/` | `1045_2023.dbf` (103 Mo), `.prj`, `.cpg` | **`.shp` et `.shx` absents** |
| `shp/` | `LISEZ_MOI.md` seulement | vide |
| `excel/` | `moroccan_catalog1045_2005.xls` (2,8 Mo) | ajouté le 12/11/2026 : catalogue Peláez et al. (2007), copié depuis le OneDrive de l'utilisateur, voir section 6 |
| `documents/` | `LISEZ_MOI.md` seulement | vide |
| `images/` | `LISEZ_MOI.md` seulement | vide |
| `SOURCES.md` | — | absent |

**Couches qui manquent encore pour la V1** :
- limites du Maroc (territoire complet, provinces du Sud comprises) : **indispensable** (règle 4.1 de CLAUDE.md) ;
- villes (pour « à X km de… »), failles actives, zonage RPS 2000.

---

## 2. Couche `1045_2023`

### 2.1 Fichiers

| Fichier | Présent | Remarque |
|---|---|---|
| `.shp` (géométries) | ❌ | Pas bloquant : chaque ligne contient `Lat` / `Lon`, la géométrie est reconstructible |
| `.shx` (index) | ❌ | Pas bloquant pour la même raison |
| `.dbf` (attributs) | ✅ | dBASE III, enregistré le 11/12/2023, taille cohérente avec l'en-tête, 0 ligne supprimée |
| `.prj` | ✅ | `GCS_WGS_1984` → **EPSG:4326**, **aucune reprojection nécessaire** |
| `.cpg` | ✅ | `UTF-8` |

- **Géométrie** : points (épicentres), déduits de `Lat`/`Lon`.
- **Nombre d'entités** : **74 693**.
- **Emprise brute** : lat 0,25 → 48,09 ; lon −571 → 9,04. Elle est faussée par 3 valeurs aberrantes (voir 2.6).
- **Emprise utile** : lat ≈ 26 → 45 °N ; lon ≈ −20 → 9 °E.
- **Dans la zone de travail** (20–38 °N, 18 °W–1 °E) : **69 536** entités (93 %).

### 2.2 Attributs

| Champ | Type dBASE | Contenu observé | Vides |
|---|---|---|---|
| `Year` | N(10) | 1045 → 2023 | 0 |
| `Mounth` *(sic)* | N(10) | 0–12 (0 = inconnu, 4 cas « Historique ») | 0 |
| `Day` | N(10) | 0–31 (0 = inconnu, 7 cas « Historique ») | 0 |
| `Hour`, `Minute` | N(10) | 0–23, 0–59, toujours valides | 0 |
| `Second` | **texte** | 2 formats mélangés : entier (`37`) **ou** `HH:MM:SS` (voir 2.5) | 113 |
| `Lat`, `Lon` | F(19,11) | degrés décimaux | 0 |
| `Depth` | **texte** | km, séparateur décimal **virgule** (`20,9`) ou entier | 115 (tous « Historique ») |
| `Mag` | **texte** | décimal **point** (IGN) ou **virgule** (Historique) ; 1 valeur illisible `0   3.` | 0 |
| `Source` | texte | `IGN Maroc` 42 761 · `IGN Spain` 31 817 · `Historique` 115 | 0 |
| `Modificati` | texte | `Mounth` 797 · `Mounth+mag` 179 · `mag` 149 · `dep` 25 · `Année` 1 | 73 542 |
| `Mw` | F(19,11) | **inutilisable** (voir 2.4) | 0 |

### 2.3 Période et sources

| Source | Lignes | Période | Remarques |
|---|---|---|---|
| Historique | 115 | 1045 → 1915 | Mw 3,1 à 8,7 ; pas de profondeur ; dates parfois partielles. **Source probable : Peláez et al. (2007)**, voir 2.3 bis |
| IGN Maroc | 42 761 | 01/1901 → **30/06/2021** | Couverture faible avant 1960 (≈ 100 à 250 séismes par décennie) |
| IGN Spain | 31 817 | **01/07/2021** → **16/08/2023** | Prend exactement le relais d'IGN Maroc ; couvre aussi la péninsule Ibérique et les Canaries |

Séismes par décennie : 1960 : 1 906 · 1970 : 2 756 · 1980 : 1 690 · 1990 : 3 020 · 2000 : 4 704 · **2010 : 20 663** · 2020–2023 : 38 980.
La forte hausse après 2010 traduit surtout une **meilleure détection** (plus de stations), pas une hausse de l'activité. Il faudra le dire sur le site.

**Points importants** :
- Le catalogue **s'arrête le 16/08/2023**, malgré son nom « 1045_2023 ». **Le séisme d'Al Haouz (08/09/2023) n'y figure pas.**
- Les deux agences ne se recouvrent **pas** dans le temps : aucun doublon IGN Maroc / IGN Spain. En revanche, le changement d'agence au 01/07/2021 crée une **rupture d'homogénéité** (types de magnitude, seuil de détection, zone couverte).
- Séismes de référence présents : Agadir 29/02/1960 (Mag 5,9, coordonnées arrondies à 30 °N 10 °W) ; Al Hoceima 26/05/1994 (5,8) ; Al Hoceima 24/02/2004 (6,3) ; Alboran 25/01/2016 (6,4) ; Lisbonne 01/11/1755 (8,7, « Historique »).

### 2.3 bis Origine des séismes « Historique »

D'après l'utilisateur (12/11/2026), ces séismes proviennent de la publication de Chourak, Tadili et al.
La référence correspondante est :

> Peláez J. A., Chourak M., Tadili B. A., Aït Brahim L., Hamdache M., López Casado C., Martínez Solares J. M. (2007).
> *A Catalog of Main Moroccan Earthquakes from 1045 to 2005.* Seismological Research Letters 78(6), 614–621.
> doi:10.1785/gssrl.78.6.614

Les mêmes auteurs ont présenté une version pour le nord du Maroc à la conférence SEE5 (Téhéran, 2007) :
*A main earthquake catalog for seismic hazard studies in northern Morocco*.

**Le fichier est cohérent avec cette publication** :

| Caractéristique de l'article | Valeurs dans `1045_2023` (Source = Historique) |
|---|---|
| Zone 27–37 °N, 15 °W–1 °E | lat 28,33 → 37,00 ; lon −15,0 → 0,5 ✅ |
| Magnitudes en Mw, seuil Mw ≥ 3,0 | 3,1 → 8,7 ; `Mw` = `Mag` sur les 115 lignes ✅ |
| Début en 1045 | premier séisme : 1045 ✅ |
| Catalogue déclusterisé (sans répliques) | pas de séquence de répliques visible ✅ |

Ce n'est qu'un **extrait** : la partie antérieure à 1916, soit 115 séismes. Le catalogue complet compte 1 739 séismes
principaux jusqu'en 2005, la partie instrumentale ayant ici été remplacée par IGN Maroc.
Selon les auteurs, le catalogue est complet depuis ~1700 pour Mw ≥ 6,0 et depuis ~1910 pour Mw ≥ 4,0.

**Confirmé** : les 115 lignes correspondent (année et Mw) au fichier original du catalogue, retrouvé depuis
(`excel/moroccan_catalog1045_2005.xls`, voir section 6).

**Provenance des autres lignes** (d'après l'utilisateur) : « IGN Maroc » et « IGN Spain » sont des extraits
téléchargés il y a plusieurs années depuis le site de l'IGN espagnol et depuis l'USGS. L'étiquette « IGN Maroc »
ne désigne donc pas une agence marocaine. On ne peut pas savoir, ligne par ligne, quelle agence est à l'origine
de chaque séisme.

### 2.4 Magnitudes

- **Type de magnitude absent** : rien n'indique s'il s'agit de Mw, mb, ML, Md ou mbLg. La colonne `Mag` mélange donc vraisemblablement plusieurs échelles, selon l'agence et l'époque.
- **La colonne `Mw` n'est pas une magnitude de moment.** Pour IGN Maroc, elle ne vaut Mag que lorsque Mag est un entier (1.0, 2.0, 3.0…) et vaut 0 dans les 39 532 autres cas. Pour IGN Spain, elle vaut toujours 0. C'est la trace d'une conversion texte → nombre qui a échoué à cause du séparateur décimal (point / virgule). Seules les 115 valeurs « Historique » sont cohérentes (Mw = Mag). → **À ignorer ; on utilisera `Mag`.**
- **Mag = 0 : 8 313 lignes.** Elles se concentrent dans les années 1960–1970 (≈ 2 900) et 2010–2023 (≈ 4 900). Il s'agit très probablement de « magnitude non déterminée » plutôt que de vrais M 0.
- **Magnitudes négatives : 44** (−0,7 à −0,1). C'est plausible pour la microsismicité.
- Précision : 2 décimales entre 2014 et 2018 (1 062 lignes), 1 décimale ailleurs.
- Volumes : M ≥ 2,5 dans la zone de travail : 22 071 ; M ≥ 4,5 : 556 ; M ≥ 6 : 30.

### 2.5 Dates et heures

- Toutes les dates sont valides (pas de mois > 12, de jour > 31, d'heure > 23 ni de minute > 59).
- 7 dates partielles (mois ou jour = 0), toutes de source « Historique ».
- **Secondes abîmées : 14 322 lignes (IGN Maroc, 1905 → 2011)** ont `Second` au format `HH:MM:SS`. Toutes les valeurs sont des multiples exacts de 0,01 jour (04:48:00 = 0,20 ; 19:12:00 = 0,80…). Excel a donc interprété la valeur des secondes comme un nombre de jours et n'a gardé que la partie décimale. **La partie entière des secondes est perdue**, et elle n'est pas récupérable depuis ce fichier. Pour ces lignes, l'heure n'est précise qu'à la minute.
- Le fuseau horaire n'est pas indiqué. Les heures sont probablement en UTC, comme c'est l'usage des agences (à confirmer).

### 2.6 Coordonnées

- **3 valeurs aberrantes** (toutes IGN Maroc) à exclure ou corriger :
  - 13/11/1969 05:53 — lon **−571**
  - 16/06/1971 20:44 — 39 °N, lon **−162** (Pacifique)
  - 12/08/2014 08:54 — **0,25 °N −84,8 °E** (Équateur)
- **Coordonnées arrondies** : 1 360 séismes au degré entier près (ex. 33,0 / −7,0) et 2 792 au 0,1° près, surtout avant 1980. L'incertitude atteint plusieurs dizaines de km, ce qu'il faudra indiquer sur la carte.
- **Hors de la zone de travail** : 5 157 lignes (IGN Spain 5 006, surtout la péninsule Ibérique au nord de 38 °N ; IGN Maroc 151).
- **Essaim volcanique de La Palma (Canaries, 2021)** : 9 244 séismes IGN Spain de 2021, et 14 390 aux Canaries en tout. Ils sont **dans** la boîte de travail mais n'ont rien à voir avec la sismicité tectonique du Maroc, et ils fausseraient les chiffres « activité habituelle ».

### 2.7 Profondeurs

- Profondeur = 0 : **9 858** lignes. C'est probablement une profondeur inconnue ou fixée par défaut, pas une vraie valeur. Les valeurs 10 et 33 km, très fréquentes, sont aussi des profondeurs fixées classiques.
- Profondeur > 100 km : 891. Profondeur > 300 km : 19, dont 4 dans le nid profond de Grenade, qui est connu (dont 1954, Mag 7, 657 km).
- **15 séismes à plus de 300 km hors de Grenade** (IGN Maroc, 2015–2019, ex. 32,8 °N −7,1 °E à 510 km) : très suspects, **à vérifier**.

### 2.8 Doublons

- **Doublons exacts** (toutes colonnes identiques) : 425 lignes concernées, **215 à supprimer** (IGN Maroc 397 lignes, IGN Spain 28).
- **Quasi-doublons** (≤ 5 s et ≤ 20 km, secondes connues) : **120 paires**, dont 26 de même magnitude. Il peut s'agir de doublons réels ou de répliques très rapprochées : une revue est nécessaire.
- Le critère plus large (≤ 1 min, ≤ 50 km) donne 3 645 paires. Elles correspondent surtout à des séquences de répliques et d'essaims (Al Hoceima, La Palma), donc **pas** à des doublons.
- « Historique » / IGN Maroc : un seul jour en commun (16/06/1915, Canaries). Les coordonnées sont proches mais les heures diffèrent (00:00 contre 21:00) : à vérifier.

### 2.9 Valeurs à vérifier

- **13/02/2015 19:04:30 — Mag 6, 34,555 °N −5,907 °E, 20,9 km (IGN Maroc).** Je ne connais pas de séisme M 6 à cette date dans cette zone (région du Gharb). Il pourrait s'agir d'une faute de saisie (6 au lieu de 0,6 ou 1,6 ?). **À contrôler avant toute publication.**
- `Mag` = `0   3.` (28/11/2019, 36,81 °N −5,74 °E) : valeur illisible.
- Colonne `Modificati` (1 151 lignes, IGN Maroc 1968–2021) : elle semble tracer des corrections manuelles (mois, magnitude, profondeur, année). Il faut savoir ce qui a été modifié et à partir de quoi.

---

## 3. Correspondance avec la structure cible (section 4.2)

### 3.1 Table **instrumental** (IGN Maroc + IGN Spain)

| Champ cible | Source dans `1045_2023` | Transformation |
|---|---|---|
| `id` | — | à générer (ex. `MA-19940526-0826`) |
| `date` | `Year`, `Mounth`, `Day` | → `AAAA-MM-JJ` |
| `heure_utc` | `Hour`, `Minute`, `Second` | → `HH:MM:SS` ; secondes inconnues pour les 14 322 lignes abîmées (marquées) ; UTC à confirmer |
| `latitude`, `longitude` | `Lat`, `Lon` | déjà en WGS84 ; exclure les 3 aberrantes ; noter la précision (arrondi) |
| `profondeur_km` | `Depth` | virgule → point ; 0 → vide/« non déterminée » (à décider) |
| `magnitude` | `Mag` | virgule → point ; 0 → vide (à décider) ; **ne pas utiliser `Mw`** |
| `type_magnitude` | — | **absent** : à renseigner par agence/période ou mettre « M » (non précisé) |
| `agence` | `Source` | `IGN Maroc` → nom exact à confirmer ; `IGN Spain` → « IGN (Espagne) » |
| `id_agence` | — | absent (récupérable seulement depuis les catalogues en ligne des agences) |
| `lieu`, `province`, `region` | — | à calculer : jointure spatiale avec la couche des limites (**manquante**) et liste de villes |
| `intensite_max`, `echelle_intensite` | — | absents ; à compléter à la main pour les séismes majeurs, avec source |
| `victimes`, `blesses`, `tsunami` | — | absents ; idem |
| `source_ref` | — | à construire à partir de `Source` + référence bibliographique du catalogue |
| `remarques` | `Modificati` | à reprendre (« mois corrigé », etc.) + drapeaux qualité (secondes perdues, coordonnées arrondies, doublon fusionné) |

### 3.2 Table **historique** (Source = « Historique », 115 lignes)

| Champ cible | Source | Transformation |
|---|---|---|
| `id` | — | à générer |
| `date`, `precision_date` | `Year`, `Mounth`, `Day` | date partielle si mois/jour = 0 → `precision_date` = année / mois / jour |
| `zone_affectee` | — | absent |
| `latitude`, `longitude` | `Lat`, `Lon` | OK |
| `precision_localisation_km` | — | absent (seul l'arrondi des coordonnées en donne une idée) |
| `intensite_epicentrale` | — | absent |
| `magnitude_estimee` | `Mag` | virgule → point |
| `methode_magnitude` | — | absent ; d'après l'article : Mw obtenue par relations empiriques (magnitudes publiées, intensité) |
| `description_effets`, `victimes` | — | absents |
| `fiabilite` (A/B/C) | — | absent |
| `source_ref` | — | Peláez et al. (2007), doi:10.1785/gssrl.78.6.614 (à confirmer avec le PDF) |

### 3.3 Table **sources**
À créer. Au minimum : le catalogue IGN Maroc, le catalogue IGN Espagne, la source des séismes historiques, et Peláez et al. (2007) si le fichier est obtenu.

---

## 4. Ce qui est utilisable dès maintenant

- Le catalogue est lisible et déjà en WGS84 : il suffit pour la carte du catalogue et les fiches Al Hoceima 1994/2004, Agadir 1960, Alboran 2016 et Lisbonne 1755 (position).
- La période **après le 16/08/2023** (dont Al Haouz) devra venir de l'USGS / de l'EMSC (phase 3, `fetch_live.py`).

---

## 5. Décisions à prendre

1. **`.shp` / `.shx` manquants** : les ajouter si tu les as, ou valider qu'on reconstruit les points depuis `Lat`/`Lon`.
2. ~~Agence « IGN Maroc »~~ **Réglé** : ce sont des extraits IGN Espagne et USGS, et la source « Historique » est Peláez et al. (2007). **Nouvelle stratégie proposée en section 7**, qui remplace en grande partie les points 3 à 7 et 9.
3. **Type de magnitude** : le connais-tu par agence ou par période ? Sinon, on affiche « M » (non précisé).
4. **Mag = 0 (8 313)** et **profondeur = 0 (9 858)** : les traiter comme « non déterminé » (proposé) ou les garder telles quelles ?
5. **Secondes perdues (14 322 lignes)** : accepter une précision à la minute (proposé) ou récupérer le catalogue d'origine ?
6. **Doublons** : supprimer les 215 doublons exacts (proposé) ; les 120 quasi-doublons sont-ils à revoir à la main ou à marquer automatiquement ?
7. **Valeurs suspectes** : exclure les 3 coordonnées aberrantes ; vérifier le M 6 du 13/02/2015 et les 15 séismes profonds hors Grenade.
8. **Canaries / La Palma 2021** : les exclure des statistiques « Maroc + alentours » (proposé), les garder avec un filtre, ou réduire la boîte de travail ?
9. **IGN Spain hors zone** (5 006 lignes, Ibérie au nord de 38 °N) : les écarter du catalogue traité ?
10. **Colonne `Modificati`** : que signifient ces corrections et sur quelle base ont-elles été faites ?
11. **Couches manquantes** : ajouter au minimum les **limites du Maroc** (territoire complet), puis villes, failles et RPS 2000.

---

## 6. Catalogue Peláez et al. (2007) — `excel/moroccan_catalog1045_2005.xls`

Le fichier a été retrouvé sur le OneDrive de l'utilisateur (`PROJETS/Article Tanger/.../Bibliographie zonage/`).
C'est le fichier original diffusé par l'université de Jaén : il a été créé en 07/2006 par le « Servicio de Informática »
et porte la mention « Version: September 2007 ». L'URL d'origine
(`ujaen.es/investiga/rnm217/moroccan_catalog.xls`) n'est plus en ligne ni archivée.

**Titre interne** : *A Poissonian North-Moroccan earthquake catalog (27°N–37°N, 15°W–1°E) aimed to seismic hazard
assessment studies.* Auteurs : Peláez, Chourak, Tadili, Aït Brahim, Hamdache, López Casado, Martínez Solares.

### 6.1 Feuilles

| Feuille | Contenu |
|---|---|
| Home page | titre, auteurs et affiliations, version septembre 2007 |
| Introduction | catalogues utilisés : IGN (jusqu'en 2005), USGS/NEIC-PDE (1973–2005), CRAAG (jusqu'en 2005), SPG Rabat (jusqu'en 1999), ISC, études publiées |
| Relationships | ordre de préférence des magnitudes (Mw > Mwc > Ms > mbLg > mb > ML > MD > Imax) et relations de conversion en Mw |
| Aftershocks | méthode de déclusterisation : **Gardner & Knopoff (1974)**, fenêtres de 20 km / 10 jours (Mw 3) à 100 km / 900 jours (Mw 8), interpolation logarithmique, puis coupure à **Mw 3,0** |
| **Catalog** | **1 738 séismes principaux** (l'article en annonce 1 739, l'écart d'une ligne reste à expliquer) |
| Top ten | les 10 plus forts (1755 Mw 8,7 ; 1969 Mw 7,9 ; 1954 Mw 7,8…) |
| Explanation | légende des agences, des types de magnitude et des codes de conversion |
| Statistics | répartition par agence, profondeur, magnitude, siècle, intensité |

### 6.2 Colonnes de la feuille `Catalog`

`agency, year, mnth, day, hour, min, sec, longitude, latitude, depth, mag., type, int., location, Mw, code`

- **Coordonnées en millièmes de degré** (−5000 = −5,000°) : diviser par 1 000. Emprise : 27,79 → 37,00 °N ; −15,0 → 1,0 °E.
- **`agency`** : IGN 1 287 · SPGM (Rabat) 330 · CRAAG 59 · NEIC 23 · BCIS 17 · ISC 12 · HIST 7 (El Mrabet, 2005) · IMGP 3.
- **`mag.` + `type`** : magnitude d'origine et son type (mbLg 1 069, mb 200, Ms 62, Mw 59, MD 53, Mwc 10, ML 6 ; vide 279).
- **`Mw`** : magnitude de moment unifiée (3,0 → 8,7). **`code`** (1–9) : méthode utilisée pour obtenir la Mw (Mw publiée, intensités, Ms, mbLg, mb, ML, Imax, MD, Io marine).
- **`int.`** : intensité maximale **EMS-98** (renseignée pour 35 % des séismes).
- **`location`** : lieu en clair (ex. « SW Al Hoceima. Morocco »).
- Profondeur absente pour 366 séismes (21 %).

**Ce fichier répond à plusieurs manques de `1045_2023`** : il indique pour chaque ligne l'agence, le type de magnitude,
une Mw homogène, l'intensité et le lieu, et ses secondes ne sont pas abîmées.
Exemples : Al Hoceima 26/05/1994 Mw 6,0 (IGN) ; 24/02/2004 Mw 6,4 (IGN, Imax VIII) ; Agadir 29/02/1960 Mw 6,3 (BCIS, mbLg 6,0, Imax X).

### 6.3 Limites à garder en tête

- **Déclusterisé** : il ne contient que des séismes principaux, sans précurseurs, répliques ni essaims. Il est parfait pour
  les statistiques et l'aléa, mais **inutilisable pour les séquences de répliques** des fiches (Al Hoceima 1994/2004, etc.).
- **Seuil Mw ≥ 3,0** : les petits séismes n'y figurent pas.
- **Zone 27–37 °N** : elle **ne couvre pas les provinces du Sud au sud de 27 °N**, ni la zone 37–38 °N ou 15–18 °W
  de la boîte de travail.
- Il s'arrête au 31/12/2005.

---

## 7. Stratégie proposée pour le catalogue (à valider)

À la suite des précisions de l'utilisateur (12/11/2026) : garder le catalogue de Tadili et al. jusqu'en 2005, puis compléter avec les sources en ligne.

| Période / usage | Source | Nature |
|---|---|---|
| **1045 → 2005**, catalogue de référence | Peláez et al. (2007), fichier original | séismes principaux, Mw homogène ≥ 3, zone 27–37 °N |
| **2006 → aujourd'hui** | téléchargé directement par le pipeline : **IGN Espagne** (Maroc nord, Alboran), **USGS** et **EMSC** ; ISC en option | catalogue complet (avec répliques), magnitudes de types variés |
| Répliques des séismes historiques récents (1994, 2004, 2016…) | IGN Espagne / USGS / ISC (téléchargés) | séquences complètes autour de chaque séisme |
| Hors de la zone Peláez (sud de 27 °N, etc.) avant 2006 | USGS / ISC-GEM | à compléter si nécessaire |
| `1045_2023.dbf` (ancien travail) | **non publié** ; sert seulement à des contrôles croisés | provenance mélangée, défauts listés en section 2 |

**Point de vigilance : l'hétérogénéité.** Avant 2006, on n'a que des séismes principaux de Mw ≥ 3. Après, on a tous les séismes,
répliques comprises. Si on mélange les deux sans précaution, l'activité semblera exploser en 2006. Deux options :

- **A (proposée pour la V1)** : afficher deux couches distinctes et clairement nommées, « Catalogue de référence 1045–2005
  (séismes principaux) » et « Sismicité 2006–aujourd'hui (tous les séismes) », et ne faire de statistiques qu'à l'intérieur
  de chaque couche.
- **B (V2, tableau de bord statistique)** : prolonger le catalogue de référence jusqu'à aujourd'hui avec la même méthode
  (conversion en Mw selon la feuille *Relationships*, déclusterisation Gardner & Knopoff avec les mêmes fenêtres, seuil Mw 3,0),
  en le signalant comme une extension faite par SismoAtlas et non par les auteurs.

**Questions en suspens** : la licence de réutilisation du fichier (à demander aux auteurs, contacts prévus après la V1 ;
d'ici là, citer l'article sur chaque page) et la couche des limites du Maroc.

---

## Annexe — Environnement

- Python 3.14.2 disponible (`py` / `python`) : pandas, numpy, openpyxl, shapely et pyproj sont installés ; **geopandas absent**. Un environnement virtuel `.venv` sera créé en phase 3.
- Les scripts d'analyse de cette phase sont temporaires et n'ont pas été ajoutés au projet. Le pipeline reproductible sera écrit en phase 3.
