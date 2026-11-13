# SismoAtlas

Site scientifique et grand public sur l'activité sismique au Maroc (focus sur le Rif) et les grands séismes
mondiaux, en français, arabe et anglais.

- **Séismes au Maroc** en direct (EMSC, USGS), expliqués simplement : « à 18 km au nord d'Al Hoceima, il y a 12 minutes ».
- **Grands séismes dans le monde** (M ≥ 6), niveau d'impact PAGER, indicateur tsunami.
- **Fiches des séismes majeurs**, articles de vulgarisation, guide de sécurité consultable hors ligne.
- **Carte complète** : catalogue de référence 1045–2005 (Peláez et al., 2007) et sismicité depuis 2006.
- **Robot de rapports** sans IA : brouillons proposés en Pull Request, publiés seulement après relecture.

> Information, pas une alerte officielle. Données révisables. SismoAtlas ne fait aucune prévision.

## Technique

Astro + MDX + TypeScript (site statique), MapLibre GL JS, pipeline de données en Python, GitHub Actions,
Cloudflare Pages (site) et GitHub Pages (données en direct). Tout fonctionne avec des services gratuits.

```bash
npm install
npm run dev            # http://localhost:4321/fr/
npm run build          # site dans dist/
npm run check          # vérification des types
npm run check:content  # contenus publiés sans « [À COMPLÉTER] »
```

Pipeline de données : voir [`pipeline/README.md`](pipeline/README.md). Hébergement : [`docs/HEBERGEMENT.md`](docs/HEBERGEMENT.md).
Robot de rapports : [`docs/ROBOT.md`](docs/ROBOT.md). Modèle de fiche : [`docs/MODELE_FICHE.md`](docs/MODELE_FICHE.md).
Cahier des charges : [`CLAUDE.md`](CLAUDE.md).

## Licences

- **Textes** du site : [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fr), sauf mention contraire.
- **Données** : licences de leurs producteurs, détaillées fichier par fichier dans [`data/LICENCES.md`](data/LICENCES.md)
  (USGS : domaine public ; GeoNames : CC BY 4.0 ; OpenStreetMap : ODbL ; failles GEM : CC BY-SA 4.0 ;
  limites de plaques Bird 2003 : ODC-By 1.0 ; catalogue Peláez et al. 2007 : [À COMPLÉTER : accord des auteurs]).
- **Code** : [À COMPLÉTER : choisir une licence pour le code (par exemple MIT) ; à défaut, tous droits réservés].
