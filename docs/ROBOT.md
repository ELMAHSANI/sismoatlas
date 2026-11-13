# Robot de rapports — mode d'emploi

Le robot (`pipeline/robot_rapports.py`, lancé par `.github/workflows/robot.yml` toutes les 15 minutes) prépare des
**brouillons de rapports** sans IA : des modèles de texte en FR / AR / EN où seuls les chiffres, les dates et les
lieux changent. Il ne publie jamais lui-même : il ouvre une **Pull Request (PR)** par rapport.

## Quand un rapport est-il proposé ?

| Zone | Seuil |
|---|---|
| Monde | magnitude ≥ 6,5 **ou** niveau PAGER orange / rouge |
| Maroc + alentours (20–38 °N, 18 °W–1 °E) | magnitude ≥ 4,5 |

| Étape | Moment | Ce qui change |
|---|---|---|
| Préliminaire | 2 h après le séisme | création du rapport (3 langues) + données de la carte et du graphique |
| Mise à jour | J+1 | données (répliques, paramètres révisés) + bloc « Mises à jour » |
| Bilan | J+7 | idem |

Les mises à jour **ne réécrivent pas le texte** : seules les données (`public/data/events/<slug>.json`), la date
`updated` et le bloc « Mises à jour » changent. Vos corrections sont conservées.

## Relire et publier un rapport

1. Ouvrir la PR « Rapport préliminaire (H+2) — M … » (étiquette `rapport`).
2. Vérifier les paramètres et le lieu (le lieu est la ville la plus proche : à reformuler si besoin).
3. Remplacer tous les `[À COMPLÉTER : …]` : résumé, contexte tectonique, bilan humain et matériel **sourcé**.
4. Vérifier les liens d'actualité proposés avant de les garder.
5. **Fusionner la PR = publier.** La vérification automatique refuse la fusion tant qu'il reste un `[À COMPLÉTER]`
   dans un contenu publié (`npm run check:content`).

## Refuser un rapport

Fermer la PR **sans supprimer la branche**, et ajouter l'identifiant du séisme (ex. `"usgs:us7000kufc"`) dans
`data/robot/ignore.json`.

## Lancer le robot à la main

- Sur GitHub : onglet *Actions* › *Robot de rapports* › *Run workflow* (champ facultatif : identifiant du séisme).
- En local (test, sans rien publier) :

```bash
.venv/Scripts/python pipeline/robot_rapports.py --event usgs:us7000kufc --now 2023-09-09T01:15:00Z --changesets essai.json
```

Supprimer ensuite les fichiers créés (`src/content/reports/*/…`, `public/data/events/…`) et remettre
`data/robot/state.json` à `{}`.

## Réglages GitHub nécessaires (phase 9)

- *Settings › Actions › General* : autoriser GitHub Actions à créer des Pull Requests.
- Secret facultatif `RELIEFWEB_APPNAME` : identifiant d'application ReliefWeb (l'API v2 l'exige ; demande gratuite :
  https://apidoc.reliefweb.int/parameters#appname). Sans lui, le rapport indique que ReliefWeb n'a pas été consulté.
- Secret facultatif `ROBOT_PAT` : sans jeton personnel, les PR ouvertes par le robot ne déclenchent pas la
  vérification automatique (limitation de GitHub) ; elle se lance dès que vous poussez une correction.

## Limites connues

- GDELT (actualités) limite fortement les requêtes : les liens d'actualité peuvent manquer.
- Le lieu « à X km de… » est calculé automatiquement ; pour un séisme lointain, la description USGS (en anglais)
  est reprise telle quelle.
- Le rayon de recherche des répliques (30 km minimum, croissant avec la magnitude) est indicatif.
