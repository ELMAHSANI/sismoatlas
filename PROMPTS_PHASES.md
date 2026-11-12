# SismoAtlas — Prompts à donner à Claude Code, phase par phase

Copie-colle **un prompt à la fois** dans Claude Code (terminal ouvert dans le dossier `SismoAtlas`).
Attends la fin de chaque phase, vérifie le résultat, puis passe à la suivante.
Claude lit automatiquement `CLAUDE.md` : inutile de tout réexpliquer.

---

## Avant de commencer (à faire une seule fois)

1. Installer **Node.js LTS** (nodejs.org), **Git** (git-scm.com) et **Python 3** (python.org,
   cocher « Add to PATH »). Si QGIS est installé, Python est souvent déjà présent.
2. Placer tes fichiers dans `donnees_brutes/` (voir le `LISEZ_MOI.md` de chaque sous-dossier).
3. Ouvrir un terminal dans le dossier `SismoAtlas`, puis lancer :
   ```
   claude
   ```
4. Plus tard (phase 9) : créer un compte **GitHub** et un compte **Cloudflare** (gratuits).

---

## Phase 1 — Analyse des données (aucun site encore)

```
Lis CLAUDE.md. Phase 1 : analyse uniquement, ne crée pas encore le site.
1. Fais l'inventaire complet de donnees_brutes/ (shp, excel, documents, images).
2. Pour chaque shapefile : géométrie, nombre d'entités, attributs, système de coordonnées (.prj),
   emprise, fichiers manquants (.shx, .dbf, .prj, .cpg).
3. Pour chaque fichier Excel : feuilles, colonnes, nombre de lignes, période couverte, formats de
   date, types de magnitude, sources, doublons probables, valeurs aberrantes, cellules vides.
4. Compare avec la structure cible du catalogue (section 4.2 de CLAUDE.md) : correspondance des
   colonnes, ce qui manque, ce qui doit être transformé.
5. Écris le résultat dans data/RAPPORT_ANALYSE.md et résume-moi les points qui demandent ma décision.
Ne modifie aucun fichier dans donnees_brutes/.
```

---

## Phase 2 — Squelette du site

```
Phase 2 : crée le squelette du site selon CLAUDE.md.
- Initialise git et un projet Astro (TypeScript, MDX) dans ce dossier, sans toucher à donnees_brutes/.
- Ajoute un .gitignore adapté (node_modules, .venv, fichiers temporaires).
- Mets en place l'i18n FR / AR / EN (URL /fr/, /ar/, /en/), avec RTL complet pour l'arabe.
- Crée le système de design : tokens CSS clair/sombre, bleu profond + accents orange/rouge,
  polices auto-hébergées (latine + arabe), mise en page mobile d'abord.
- Crée toutes les pages de l'arborescence (section 5) avec un contenu provisoire, l'en-tête,
  le menu, le sélecteur de langue, le pied de page avec l'avertissement et les sources.
- Crée les collections de contenu (articles, fiches, comprendre, rumeurs, rapports, guide)
  avec le schéma de frontmatter de la section 5.5.
- Crée les pages Mentions légales, Confidentialité (loi 09-08), Avertissement, Données & méthodes.
Vérifie que npm run build passe, lance le serveur de dev, puis fais un commit.
```

---

## Phase 3 — Pipeline de données

```
Phase 3 : pipeline de données en Python dans pipeline/ (environnement virtuel .venv, requirements.txt).
1. import_catalogue.py : lit les Excel de donnees_brutes/excel/, produit le catalogue nettoyé
   (instrumental, historique, sources) dans data/catalogue/ (CSV + GeoJSON) selon la section 4.2,
   avec un rapport de qualité data/catalogue/RAPPORT_QUALITE.md.
2. convert_shp.py : reprojette tous les shapefiles en WGS84, produit une version complète
   (data/sig/) et une version simplifiée légère pour le web (public/data/sig/).
3. fetch_live.py : récupère USGS + EMSC pour la zone Maroc + alentours (section 4.4) sur 30 jours,
   fusionne et dédoublonne, ajoute la ville la plus proche et la distance, écrit
   public/data/live/{24h,7d,30d}.geojson. Récupère aussi les séismes mondiaux M ≥ 6 avec PAGER et
   tsunami → public/data/world/{7d,30d,1y}.geojson.
4. Prépare la liste des villes marocaines de référence (nom FR/AR/EN, coordonnées) pour les
   descriptions « à X km au nord de … ».
Chaque script doit pouvoir être relancé sans erreur. Montre-moi le rapport de qualité, puis commit.
```

---

## Phase 4 — Section d'accueil « Séismes au Maroc » (priorité)

```
Phase 4 : construis la section d'accueil grand public décrite en section 5.1 de CLAUDE.md.
- Onglets En direct / 24 h / 7 jours / 30 jours ; M ≥ 2.5 par défaut + bouton « afficher tout ».
- Carte MapLibre (chargement différé) avec la couche de limites du Maroc fournie, cercles
  colorés selon l'échelle de la section 5.1, le plus récent mis en évidence.
- Bandeau « le plus récent », chiffres clés, liste lisible ; textes en langage simple
  (distance à la ville la plus proche, « il y a … », fuseau Africa/Casablanca).
- Temps réel via le WebSocket EMSC (avec reconnexion et repli sur les fichiers GeoJSON).
- Boutons « L'avez-vous ressenti ? » (EMSC) et « Partager sur WhatsApp ».
- Légende de l'échelle de magnitude, avertissement, attribution des sources.
- Les trois langues, RTL vérifié. Teste en largeur mobile et vérifie le poids de la page.
Commit à la fin.
```

---

## Phase 5 — Section « Grands séismes dans le monde »

```
Phase 5 : construis la section monde (section 5.2 de CLAUDE.md) sous la section Maroc :
onglets 7 j / 30 j / 1 an, carte du monde légère, liste avec magnitude, lieu, temps écoulé,
niveau PAGER et indicateur tsunami, lien vers le rapport s'il existe. Trois langues. Commit.
```

---

## Phase 6 — Contenu : modèles et premières pages

```
Phase 6 : prépare le contenu V1 sans inventer de données (règle 3 de CLAUDE.md).
1. Crée le composant « carte intégrée » utilisable dans les MDX (épicentre, répliques, failles).
2. Crée le modèle de fiche séisme majeur (section 5.4) et la fiche Al Hoceima 2004 (+ 1994) :
   paramètres tirés de l'USGS/ISC avec source, carte, graphique des répliques ; laisse
   [À COMPLÉTER] pour l'analyse que je rédigerai.
3. Crée les fiches Al Haouz 2023, Agadir 1960, Alboran 2016, Lisbonne 1755 sur le même modèle.
4. Crée la structure des 4 articles « Comprendre » et des articles « Vrai ou faux ? » avec plan
   détaillé et emplacements de figures.
5. Guide de sécurité avant / pendant / après : page + PWA hors ligne + export PDF.
Liste-moi tout ce que je dois rédiger ou vérifier. Commit.
```

---

## Phase 7 — Carte complète et page Données & méthodes

```
Phase 7 : page « Carte complète » avec filtres avancés (période, magnitude, profondeur,
province, source), couches activables (failles, plaques, limites, catalogue historique),
fiche détaillée au clic. Complète la page « Données & méthodes » : sources, licences, zone,
méthode de fusion et de dédoublonnage, limites des données. Commit.
```

---

## Phase 8 — Robot de rapports (sans IA)

```
Phase 8 : robot de rapports selon la section 5.3 de CLAUDE.md.
- Script pipeline/robot_rapports.py : détecte les séismes au-dessus des seuils, collecte les
  données (USGS, EMSC, ReliefWeb, GDELT), génère le brouillon en FR / AR / EN avec des modèles de
  texte (pas d'IA), crée carte et graphiques, liste les sources.
- Garde la trace des séismes déjà traités pour ne jamais créer de doublon.
- Workflows GitHub Actions : mise à jour des données toutes les 15 min, robot qui ouvre une
  Pull Request par rapport (jamais de publication directe).
- Teste le robot sur un séisme passé réel (ex. Al Haouz 2023) en mode local. Commit.
```

---

## Phase 9 — Mise en ligne

```
Phase 9 : guide-moi pas à pas pour la mise en ligne, en faisant toi-même ce qui est possible :
créer le dépôt GitHub (privé ou public, demande-moi), pousser le code, connecter Cloudflare
Pages, activer les workflows, configurer Decap CMS, Cloudflare Web Analytics, sitemap,
balises SEO et Open Graph dans les trois langues. Explique-moi chaque étape que je dois faire
moi-même dans un navigateur.
```

---

## Phase 10 — Vérification finale

```
Phase 10 : vérification complète avant annonce publique : liens cassés, build, Lighthouse
(performance, accessibilité, SEO), affichage mobile, mode sombre, arabe RTL, comportement en
connexion lente, fonctionnement hors ligne du guide, attributions des sources, pages légales.
Donne-moi une liste de corrections classées par priorité, puis corrige celles que je valide.
```

---

## Conseils

- Si Claude part dans une mauvaise direction : appuie sur **Échap** et recadre-le.
- Après chaque phase, ouvre le site en local et vérifie toi-même sur ton téléphone.
- Garde ce fichier et `CLAUDE.md` à jour si tu changes une décision.
