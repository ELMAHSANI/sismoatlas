# Modèle de fiche « séisme majeur » (CLAUDE.md §5.4)

## 1. Déclarer le séisme dans le pipeline

Ajouter une entrée dans `pipeline/events.json` :

```json
{
  "slug": "nom-annee",
  "shocks": [
    { "key": "2024", "usgs": "us7000xxxx", "pelaez": "AAAA-MM-JJ", "aftershocks": { "days": 120, "radius_km": 50 } }
  ]
}
```

- `usgs` : identifiant ComCat (dans l'adresse de la page USGS du séisme) ;
- `pelaez` : date à retrouver dans le catalogue de référence (séismes jusqu'en 2005) ;
- `aftershocks` : fenêtre de recherche des répliques.

Puis lancer `.venv/Scripts/python pipeline/build_events.py` : il crée `public/data/events/<slug>.json`
et met à jour `data/events/RAPPORT_EVENEMENTS.md` (valeurs à vérifier).

## 2. Écrire la fiche

Créer `src/content/earthquakes/fr/<slug>.mdx` (puis `ar/` et `en/` avec le même nom de fichier) :

```mdx
---
title: "Séisme de … (AAAA)"
description: "Une phrase."
date: "AAAA-MM-JJ"
author: "SismoAtlas"
lang: "fr"
translationKey: "<slug>"
category: "major-earthquake"
tags: ["…"]
references:
  - citation: "Auteur A. (année). Titre. Revue, volume, pages."
    doi: "10.xxxx/xxxx"
license: "CC BY 4.0"
draft: true
eventIds: ["usgs:us7000xxxx"]   # relie la fiche au séisme sur la carte du monde
---
import EventParams from '../../../components/quake/EventParams.astro';
import EventMap from '../../../components/quake/EventMap.astro';
import FocalMechanisms from '../../../components/quake/FocalMechanisms.astro';
import AftershockChart from '../../../components/quake/AftershockChart.astro';
import FigureTodo from '../../../components/FigureTodo.astro';

## 1. Résumé
…
<EventParams event="<slug>" shock="2024" />

## 2. Contexte tectonique
## 3. Carte interactive
<EventMap event="<slug>" />

## 4. Mécanisme au foyer
<FocalMechanisms event="<slug>" shock="2024" />

## 5. Séquence de répliques
<AftershockChart event="<slug>" shock="2024" days={60} />

## 6. Intensités et dégâts
## 7. Enseignements
```

## 3. Composants disponibles

| Composant | Rôle | Données |
|---|---|---|
| `<EventParams event shock />` | tableau des paramètres, USGS et catalogue de référence côte à côte | `public/data/events/<slug>.json` |
| `<FocalMechanisms event shock />` | plans nodaux publiés (tenseurs des moments, mécanismes USGS) | idem |
| `<AftershockChart event shock days />` | nombre de répliques par jour (SVG, sans JavaScript) | idem |
| `<EventMap event pad />` | carte : choc(s) principal(aux), répliques, failles actives GEM, limites du Maroc | idem + `public/data/sig/` |
| `<FigureTodo>…</FigureTodo>` | emplacement d'une figure à produire (visible en brouillon) | — |
| `<MagnitudeScale />` | légende de l'échelle de magnitude | — |

## 4. Règles

- Aucun chiffre sans source (règle 3) : les composants affichent les valeurs des catalogues avec leur source ;
  tout chiffre ajouté dans le texte doit être cité dans `references`.
- Laisser `draft: true` jusqu'à la relecture ; passer à `false` pour publier.
- Les marqueurs `[À COMPLÉTER : …]` et `<FigureTodo>` doivent avoir disparu avant publication
  (liste à jour dans `docs/A_COMPLETER.md`, régénérée par `node docs/lister-a-completer.mjs`).
