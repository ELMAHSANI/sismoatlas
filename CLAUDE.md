# SismoAtlas — Cahier des charges du projet

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Il contient toutes les décisions validées. Ne pas les remettre en question sans demander.

## 1. Le projet en bref

**SismoAtlas** est un site web scientifique et grand public sur l'activité sismique au Maroc,
avec un focus sur la région du **Rif**, et un suivi des grands séismes mondiaux.

- **Ce n'est pas seulement une plateforme de visualisation** : c'est d'abord un site de contenu
  (analyses de séismes majeurs, articles, vulgarisation) avec cartes et données intégrées.
- **Deux publics** : le grand public marocain (simple, mobile, rassurant) et le public scientifique
  (rigueur, sources, données).
- **Langues** : français (langue principale de rédaction), arabe (RTL), anglais — dès la V1.
- **Budget** : zéro. Tout doit fonctionner avec des services gratuits. **Aucune API d'IA payante.**

## 2. Règles de travail pour Claude

1. **Ne jamais modifier `donnees_brutes/`** : ce sont les fichiers originaux. Toute transformation
   produit un nouveau fichier dans `data/` (données traitées) ou `public/data/`.
2. **Travailler par phases** (voir `PROMPTS_PHASES.md`). À la fin de chaque phase : vérifier que
   `npm run build` passe, résumer ce qui a été fait, faire un commit git, puis attendre.
3. **Ne jamais inventer de données scientifiques** : magnitudes, bilans humains, dates, intensités.
   Chaque chiffre doit avoir une source citée. Si une info manque, écrire `[À COMPLÉTER : ...]`.
4. **Demander avant** toute décision structurante non prévue ici (nouvelle dépendance lourde,
   service externe, changement d'architecture).
5. Code et noms de fichiers en anglais ; contenu, commentaires d'interface et documentation en français.
6. Tout texte d'interface passe par les fichiers de traduction (jamais de texte en dur).

## 3. Architecture technique (100 % gratuite)

| Besoin | Choix |
|---|---|
| Générateur de site | **Astro** (version stable actuelle) + **MDX** + TypeScript |
| Carte | **MapLibre GL JS** ; fond de carte gratuit sans clé (ex. OpenFreeMap) ou PMTiles |
| Graphiques | Chart.js ou Observable Plot (léger) |
| Formules | KaTeX |
| Recherche interne | Pagefind |
| Édition sans code | Decap CMS (branché sur GitHub) |
| Hors ligne / installable | PWA (guide de sécurité consultable sans internet) |
| Préparation des données | **Python 3** (pandas, openpyxl, geopandas, pyproj) dans `pipeline/` |
| Automatisation | **GitHub Actions** (cron) |
| Hébergement | **Cloudflare Pages** |
| Statistiques | Cloudflare Web Analytics (sans cookies) |
| Commentaires (plus tard) | Giscus |

**Principe** : site statique. GitHub Actions récupère les données toutes les 15 min, les nettoie,
écrit des fichiers GeoJSON dans le dépôt, et le site se redéploie. Le temps réel direct passe par
le WebSocket de l'EMSC côté navigateur.

## 4. Données

### 4.1 Données fournies par l'utilisateur (`donnees_brutes/`)
- `shp/` : couches SIG (limites administratives, failles, zonage RPS 2000, etc.)
- `excel/` : catalogue des séismes du Maroc + séismes historiques
- `documents/` : publications PDF de référence
- `images/` : photos, figures, logos

**Points d'attention SIG :**
- Les shapefiles marocains sont souvent en **Lambert Nord Maroc (EPSG:26191)** ou
  **Lambert Sud Maroc (EPSG:26192)**. Lire le `.prj` ; tout reprojeter en **WGS84 (EPSG:4326)**.
- Si un `.prj` manque, **demander** le système de coordonnées, ne pas deviner.
- Simplifier les géométries pour le web (poids léger), garder une version complète pour les analyses.
- **Le territoire marocain doit être affiché dans son intégralité, provinces du Sud comprises**,
  à partir de **Natural Earth (domaine public), édition « point de vue du Maroc »**
  (`pipeline/fetch_limits.py`). Décision du 17/11/2026 : la couche `donnees_brutes/shp/Morocco.shp`
  n'est plus utilisée (origine et licence inconnues). Masquer ou neutraliser les frontières du fond
  de carte si elles diffèrent.

### 4.2 Structure cible du catalogue (`data/catalogue/`)
Deux tables : **instrumental** et **historique**, + une table **sources**.

Instrumental : `id, date (AAAA-MM-JJ), heure_utc, latitude, longitude, profondeur_km, magnitude,
type_magnitude (Mw/mb/ML/Ms/Md), agence, id_agence, lieu, province, region, intensite_max,
echelle_intensite (EMS-98/MSK/MMI), victimes, blesses, tsunami, source_ref, remarques`

Historique : `id, date (peut être partielle), precision_date, zone_affectee, latitude, longitude,
precision_localisation_km, intensite_epicentrale, magnitude_estimee, methode_magnitude,
description_effets, victimes, fiabilite (A/B/C), source_ref`

Règles : une ligne = un séisme ; dates ISO ; point décimal ; WGS84 ; doublons entre agences
fusionnés (garder une agence de référence, autres id en remarques) ; source sur chaque ligne.
Produire un **rapport de qualité** (doublons, valeurs aberrantes, champs manquants) à chaque import.

**Référence historique** : Peláez et al. (2007), *A Catalog of Main Moroccan Earthquakes from 1045
to 2005*, SRL 78(6), 614–621, doi:10.1785/gssrl.78.6.614. Catalogue **déclusterisé** (sans
répliques, Gardner & Knopoff 1974, Mw ≥ 3), zone 27–37 °N / 15 °W–1 °E. Fichier original (version
sept. 2007, 1 738 séismes) : `donnees_brutes/excel/moroccan_catalog1045_2005.xls`.

**Stratégie du catalogue (validée le 12/11/2026)** — détails dans `data/RAPPORT_ANALYSE.md` §6–7 :
- **1045 → 2005** : Peláez et al. (2007) = catalogue de référence (Mw unifiée, agence et type de
  magnitude par ligne, intensité EMS-98).
- **2006 → aujourd'hui** : téléchargé par le pipeline depuis IGN Espagne, USGS, EMSC (ISC en option).
- **Répliques** des séismes majeurs et **zone hors Peláez** (sud de 27 °N…) : sources en ligne.
- `donnees_brutes/catalogue de sismicite/1045_2023.dbf` (ancien travail, extraits IGN Espagne + USGS,
  provenance mélangée) : **contrôle croisé uniquement, jamais publié**.
- V1 : deux couches distinctes « Catalogue de référence 1045–2005 (séismes principaux) » et
  « Sismicité depuis 2006 (tous les séismes) » ; statistiques uniquement à l'intérieur d'une couche.
  V2 : extension homogène du catalogue de référence (conversion Mw + même déclusterisation).

### 4.3 Sources externes (gratuites)
- **USGS** FDSN : `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&...`
  + flux résumés `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/...` (PAGER, tsunami)
- **EMSC** FDSN : `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&...`
  + WebSocket temps réel : `wss://www.seismicportal.eu/standing_order/websocket`
- **IGN Espagne** : catalogue (bonne couverture Alboran / nord du Maroc)
- **ISC / ISC-GEM** : catalogue historique instrumental
- **GEM Global Active Faults** (GitHub) : failles actives
- **Limites de plaques** (Bird 2003, GitHub `fraxen/tectonicplates`)
- **ReliefWeb** (ONU) et **GDELT** : rapports et actualités pour le robot (vérifier la version
  actuelle des API et les conditions d'accès)

Toujours afficher l'attribution des sources. Vérifier la licence avant toute réutilisation.

### 4.4 Zone géographique « Maroc + alentours »
Boîte englobante de travail : **latitude 20°N → 38°N, longitude 18°W → 1°E**
(Maroc entier, mer d'Alboran, sud de l'Espagne et du Portugal, ouest de l'Algérie).

## 5. Contenu du site (V1)

```
Accueil
├── Séismes au Maroc : En direct / 24 h / 7 jours / 30 jours   (grand public)
├── Grands séismes dans le monde : 7 j / 30 j / 1 an             (M ≥ 6)
├── Derniers articles et rapports
Séismes majeurs (fiches)
├── Al Hoceima 2004 (+ 1994)   ← fiche modèle, à faire en premier
├── Al Haouz 2023
├── Agadir 1960
├── Alboran 2016
└── Lisbonne 1755 (effets au Maroc)
Comprendre
├── Pourquoi le Maroc tremble
├── Magnitude vs intensité
├── Lire la carte du site
└── Construire parasismique (RPS 2000)
Vrai ou faux ? (rumeurs)      3 à 5 articles courts
Rapports                       générés par le robot, validés à la main
Guide de sécurité              avant / pendant / après — hors ligne + PDF
Carte complète                 filtres avancés
Données & méthodes             sources, catalogues, méthodologie
À propos · Mentions légales · Confidentialité (loi 09-08) · Avertissement
```

### 5.1 Section d'accueil « Séismes au Maroc » — PRIORITÉ, grand public
Objectif : une personne qui vient de sentir une secousse comprend tout en 5 secondes, sur mobile.

- Onglets : **En direct / 24 h / 7 jours / 30 jours**
- Magnitude affichée par défaut **≥ 2.5**, bouton « afficher tout »
- Carte + bandeau « le plus récent » + chiffres clés + liste
- **Traduire les données brutes en langage simple** :
  - coordonnées → « à 18 km au nord d'Al Hoceima » (ville la plus proche, liste locale de villes)
  - heure UTC → « il y a 12 minutes », heure du Maroc via le fuseau IANA **`Africa/Casablanca`**
    (ne jamais coder le décalage en dur : le Maroc est revenu à GMT/UTC+0 le 20/09/2026, décret
    n° 2.26.530, après le régime GMT+1 de 2018 ; les bases de fuseaux anciennes — ex. Node 24, tz 2025b —
    l'ignorent encore : le rendu serveur affiche l'heure UTC, le navigateur calcule l'heure du Maroc)
  - profondeur → « peu profond / profond » avec info-bulle
- **Échelle de couleurs** :
  - < 3 vert « généralement non ressenti »
  - 3–4 jaune « ressenti par certains, sans dégâts »
  - 4–5 orange « bien ressenti, objets qui bougent »
  - 5–6 rouge « dégâts possibles »
  - ≥ 6 violet « séisme fort, dégâts importants »
- Bouton **« L'avez-vous ressenti ? »** → formulaire de témoignage de l'EMSC pour l'événement
- Bouton **Partager sur WhatsApp** (texte court + lien)
- Comparaison prudente « activité habituelle pour la région » (jamais de prévision)
- Avertissement discret : « Information, pas une alerte officielle. Données révisables. »
- Page **légère** : fonctionne en 3G (carte chargée en différé, pas de bibliothèque inutile)

### 5.2 Section « Grands séismes dans le monde »
- M ≥ 6, carte du monde + liste
- **Niveau d'impact PAGER** (vert/jaune/orange/rouge) et **indicateur tsunami** (USGS)
- Lien vers le rapport du séisme s'il existe

### 5.3 Robot de rapports (sans IA)
1. GitHub Action (toutes les 15 min) détecte un nouveau séisme dépassant le seuil :
   **monde M ≥ 6.5 ou PAGER orange/rouge** ; **zone Maroc + alentours M ≥ 4.5**
2. Collecte : paramètres USGS/EMSC, PAGER, mécanisme au foyer, répliques, liens ReliefWeb/GDELT
3. Génère un **brouillon** de rapport en **FR / AR / EN** à partir de **modèles de texte**
   (seuls chiffres, dates et lieux changent) + carte et graphiques automatiques + sources
4. Ouvre une **Pull Request** : rien n'est publié sans relecture et validation humaine (merge)
5. Mises à jour prévues : préliminaire (H+2), mise à jour (J+1), bilan (J+7)

Structure d'un rapport : résumé grand public · paramètres · contexte tectonique `[À COMPLÉTER]` ·
impact (PAGER, bilan sourcé) · répliques · carte · sources.
Mention : « Rapport préparé automatiquement à partir de données publiques, vérifié par l'équipe. »

### 5.4 Fiches séismes majeurs (modèle)
1. Résumé · 2. Contexte tectonique · 3. Carte interactive intégrée (épicentre, répliques, failles) ·
4. Mécanisme au foyer · 5. Séquence de répliques (loi d'Omori) · 6. Intensités et dégâts ·
7. Enseignements · 8. Références (DOI)

### 5.5 Métadonnées de chaque article (frontmatter)
`title, description, date, updated, author, lang (fr/ar/en), translationKey, category, tags,
references (liste avec DOI), license: "CC BY 4.0", draft`

## 6. Design

- Style **scientifique moderne** : épuré, beaucoup de blanc, **bleu profond** + accents
  **orange/rouge** pour les séismes ; **mode sombre** ; inspiration INGV / Temblor
- Couleurs en variables CSS (tokens), clair et sombre
- **Mobile d'abord**, accessible (contrastes, clavier, textes alternatifs)
- Arabe : `dir="rtl"`, police arabe lisible, mise en page miroir testée
- Polices auto-hébergées, performance soignée (objectif Lighthouse > 90)

## 7. Feuille de route

**V1 (lancement)** : tout ce qui est décrit en section 5 + FR/AR/EN + PWA guide de sécurité.
Lancement possible avec un **noyau** (section en direct, monde, fiche Al Hoceima, 2 articles,
guide), le reste publié progressivement.

**V2** : « Ma commune, mon risque » (RPS 2000, failles) · comparateur de séismes · bulletin
sismique mensuel automatique · animation des séquences de répliques · images satellites dans les
rapports (Copernicus EMS, InSAR) · tableau de bord statistique (valeur b, énergie) · formulaire de
témoignages propre (conforme loi 09-08).

**V3** : profil 3D Rif–Alboran · données ouvertes avec DOI (Zenodo) · section tsunami ·
widget intégrable · alertes par ville (Telegram) · autres risques (glissements de terrain du Rif).

**Abandonné** : sismographe Raspberry Shake.

**Monétisation** : pas de publicité au lancement ; dons (Ko-fi) dès le début ; AdSense après
~20 articles et un trafic régulier (nécessite un domaine propre, ex. `sismoatlas.com`).

**Partenaires** : contactés après la V1 (universités du nord, ING-CNRST, auteurs du catalogue).

## 8. Structure du dépôt (cible)

```
SismoAtlas/
├── CLAUDE.md                 ← ce fichier
├── PROMPTS_PHASES.md         ← prompts à donner à Claude, phase par phase
├── donnees_brutes/           ← ORIGINAUX, ne jamais modifier
│   ├── shp/  excel/  documents/  images/
├── data/                     ← données traitées (catalogue nettoyé, rapports qualité)
├── pipeline/                 ← scripts Python (import, nettoyage, conversion, robot)
├── public/data/              ← GeoJSON légers servis au site
├── src/
│   ├── content/              ← articles, fiches, rapports, guide (MDX, par langue)
│   ├── components/           ← carte, listes, graphiques, cartes de séisme
│   ├── i18n/                 ← traductions fr / ar / en
│   ├── layouts/  pages/  styles/
└── .github/workflows/        ← automatisations (données, robot)
```
