# Hébergement gratuit et légal — choix pour la mise en ligne

*Vérifié le 13/11/2026 sur les documentations officielles ; les offres gratuites peuvent changer.*

## Les contraintes

| Service | Limite gratuite qui compte pour SismoAtlas |
|---|---|
| Cloudflare Pages | **500 constructions de site par mois** (une à la fois) ; nombre de déploiements et bande passante non limités |
| GitHub Actions | **illimité pour un dépôt public** ; 2 000 minutes par mois pour un dépôt privé |
| GitHub Pages | gratuit pour un dépôt public ; 100 Go de trafic par mois (limite souple), site ≤ 1 Go ; fichiers servis avec `Access-Control-Allow-Origin: *` (vérifié) et un cache de 10 minutes |

Mettre à jour les données toutes les 15 minutes en reconstruisant le site demanderait environ 2 900 constructions par
mois : impossible sur l'offre gratuite de Cloudflare. Avec un dépôt privé, les deux tâches de 15 minutes (données et
robot) consommeraient aussi plus de 2 000 minutes d'Actions par mois.

## Solution retenue (option A, recommandée) : dépôt public

```
                   toutes les 15 min                         à chaque changement de contenu + 1 fois par jour
 USGS / EMSC ──► data-live.yml ──► GitHub Pages (JSON)      GitHub (main) ──► Cloudflare Pages (site)
                                        │                                          │
                                        └──────── lu par le navigateur ◄───────────┘
                                                   (PUBLIC_LIVE_DATA_URL ; repli : copie incluse dans le site)
```

- **Site** : Cloudflare Pages, construit seulement quand le code ou le contenu change (fusion d'une PR, catalogue
  mensuel) et une fois par jour (`rebuild.yml`) : environ 30 à 100 constructions par mois.
- **Données en direct** : publiées toutes les 15 minutes sur GitHub Pages par `data-live.yml`, sans commit.
- **Temps réel** : le flux de l'EMSC (WebSocket) dans le navigateur complète le tout.
- **Robot** : `robot.yml` toutes les 15 minutes, gratuit en dépôt public.

### Réglages à faire (phase 9)

1. GitHub, dépôt **public** :
   - *Settings › Pages › Source* : **GitHub Actions** ;
   - *Settings › Actions › General* : autoriser GitHub Actions à créer des Pull Requests ;
   - secrets : `CLOUDFLARE_DEPLOY_HOOK` (étape 2), facultatifs `RELIEFWEB_APPNAME`, `ROBOT_PAT`.
2. Cloudflare Pages, projet relié au dépôt :
   - commande de construction : `npm run build:cf` (télécharge les données du moment puis construit le site)
     (le site part avec les données du moment ; si une source est en panne, la copie du dépôt est utilisée) ;
   - dossier de sortie : `dist` ;
   - variables : `NODE_VERSION=24`, `PUBLIC_LIVE_DATA_URL=https://<compte>.github.io/<dépôt>` ;
   - *Build watch paths* : exclure `public/data/live/*`, `public/data/world/*`, `data/robot/*` ;
   - créer un *Deploy hook* et copier son adresse dans le secret GitHub `CLOUDFLARE_DEPLOY_HOOK`.

## Option B : dépôt du site privé + petit dépôt public de données

Si le dépôt principal doit rester privé : un second dépôt **public** ne contient que `fetch_live.py` et ses modules
(`common.py`, `sources.py`), `public/data/cities.json` et le workflow `data-live.yml` (GitHub Pages). Le dépôt privé
garde le site, les catalogues et le robot, mais le robot doit alors tourner moins souvent (par exemple toutes les
heures) pour rester sous 2 000 minutes par mois.

## Options écartées

- **Commit toutes les 15 minutes + reconstruction Cloudflare** : dépasse les 500 constructions par mois et encombre
  l'historique (près de 3 000 commits par mois).
- **Envoi direct sur Cloudflare (`wrangler pages deploy`) toutes les 15 minutes** : la documentation ne dit pas
  clairement si ces envois comptent dans les 500 constructions ; trop incertain.
- **Stockage d'objets (Cloudflare R2, etc.)** : possible mais plus complexe (compte et clés supplémentaires) pour un
  gain nul par rapport à GitHub Pages.

## Ce qui devient public avec un dépôt public — vérifications légales

Le site publie déjà ces données (cartes, fiches) : un dépôt public ne change pas l'exposition, mais il faut respecter
les licences des fichiers redistribués. Détail par fichier : `data/LICENCES.md`.

- **Peláez et al. (2007)** : licence inconnue → **demander l'accord des auteurs** avant la mise en ligne publique
  (concerne `data/catalogue/historique.*`, `instrumental.*` et `public/data/catalogue/reference.json`).
- **OpenStreetMap** (noms arabes des villes) : base dérivée → licence **ODbL** à indiquer.
- **GEM Global Active Faults** : **CC BY-SA 4.0** (partage à l'identique) à indiquer.
- **GeoNames** : **CC BY 4.0**, attribution affichée.
- Les fichiers bruts (`donnees_brutes/`) ne sont pas versionnés.
- GitHub Pages ne sert ici que des fichiers de données : il n'accueille ni le site ni la publicité éventuelle.
