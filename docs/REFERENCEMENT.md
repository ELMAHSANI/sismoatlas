# Référencement : faire apparaître SismoAtlas dans les moteurs de recherche

## Ce que le site fait déjà (automatique)

- **Plan du site** : `https://sismoatlas.pages.dev/sitemap-index.xml` (pages publiées seulement, brouillons exclus).
- **robots.txt** : tout est autorisé sauf `/admin/`, avec le lien vers le plan du site.
- Sur chaque page : titre, description, adresse canonique, liens vers les traductions (`hreflang` fr / ar / en),
  aperçu de partage (Open Graph, image 1200 × 630).
- **Données structurées (schema.org)** : `WebSite` + `Organization` (logo, e-mail) sur l'accueil,
  `Article` (titre, dates, auteur, licence, mots-clés) sur les articles et fiches publiés.
- **Brouillons** : marqués `noindex`, ils n'apparaissent pas dans Google tant que `draft: true`.
- **Partage WhatsApp** : le message contient des mots-dièse (#séisme, ville proche, #Maroc, #SismoAtlas).

## À faire une fois (par toi, avec le compte sismoatlas@gmail.com)

### 1. Google Search Console (le plus important)

1. Ouvrir <https://search.google.com/search-console> et se connecter avec sismoatlas@gmail.com.
2. Ajouter une propriété → **Préfixe de l'URL** → `https://sismoatlas.pages.dev/`
   (le type « Domaine » est impossible sur une adresse `pages.dev`).
3. Méthode de validation : **Balise HTML**. Copier seulement la valeur `content="…"`.
4. Cloudflare → Workers & Pages → sismoatlas → Settings → Variables and Secrets (Production) :
   ajouter `PUBLIC_GOOGLE_SITE_VERIFICATION` = la valeur copiée, puis relancer un déploiement
   (Deployments → Retry deployment).
5. Revenir dans Search Console → **Valider**.
6. Menu **Sitemaps** → saisir `sitemap-index.xml` → Envoyer.
7. Facultatif : **Inspection de l'URL** → `https://sismoatlas.pages.dev/fr/` → « Demander une indexation »
   (idem pour `/ar/` et `/en/`).

Délai habituel : quelques jours à quelques semaines avant les premières apparitions.

### 2. Bing Webmaster Tools (Bing, DuckDuckGo, Yahoo, Ecosia…)

1. Ouvrir <https://www.bing.com/webmasters> → se connecter.
2. Choisir **Importer depuis Google Search Console** (le plus simple : site et plan du site repris).
   Sinon : balise meta → variable `PUBLIC_BING_SITE_VERIFICATION` dans Cloudflare, comme pour Google.

## Ce qui fait vraiment monter le site

1. **Du contenu publié** (sans `[À COMPLÉTER]`, `draft: false`) : la fiche Al Hoceima, le guide, les articles.
   Google classe des pages, pas un site : chaque fiche bien sourcée peut répondre à une recherche
   (« séisme Al Hoceima 2004 », « زلزال الحسيمة »…).
2. **Les trois langues** : beaucoup de recherches au Maroc se font en arabe ; les pages arabes comptent autant.
3. **Des liens vers le site** : partenaires universitaires, associations, pages de ressources, médias
   (après la V1, voir CLAUDE.md §7), et ses propres comptes sur les réseaux sociaux.
4. **Les réseaux sociaux** (page Facebook, X, Instagram, TikTok « SismoAtlas ») : publier chaque séisme ressenti
   avec le lien et les mots-dièse. Les mots-dièse aident sur les réseaux ; ils ne jouent aucun rôle dans Google.

## Mots-dièse conseillés

| Langue | Toujours | Selon le séisme |
|---|---|---|
| Français | #SismoAtlas #séisme #Maroc | #AlHoceima, #Rif, #tremblementdeterre |
| Arabe | #SismoAtlas #زلزال #المغرب | #الحسيمة، #الريف، #هزة_أرضية |
| Anglais | #SismoAtlas #earthquake #Morocco | #AlHoceima, #Rif |

Le site ajoute déjà automatiquement : thème, ville proche (≤ 100 km), pays si la ville est au Maroc, #SismoAtlas.
