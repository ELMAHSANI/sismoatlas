// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';
import { draftPaths } from './scripts/draft-paths.mjs';

// Adresse publique du site : variable SITE_URL (Cloudflare Pages), sinon l'adresse provisoire.
// À remplacer par le domaine définitif (ex. https://sismoatlas.com) quand il sera acheté.
const SITE_URL = process.env.SITE_URL || 'https://sismoatlas.pages.dev';

// Brouillons : jamais dans le sitemap (ils portent aussi « noindex » tant qu'ils sont affichés).
const DRAFTS = draftPaths(fileURLToPath(new URL('./src/content/', import.meta.url)));

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  integrations: [
    // Tableaux des contenus : enveloppés par src/components/ScrollTable.astro (défilement sur mobile)
    mdx(),
    sitemap({
      // La racine « / » ne fait que rediriger vers une langue ; la page 404 n'a pas à être indexée.
      filter: (page) => {
        const p = new URL(page).pathname;
        return p !== '/' && !p.includes('/404') && !DRAFTS.has(p);
      },
      i18n: {
        defaultLocale: 'fr',
        locales: { fr: 'fr-MA', ar: 'ar-MA', en: 'en' },
      },
    }),
  ],
  i18n: {
    locales: ['fr', 'ar', 'en'],
    defaultLocale: 'fr',
    routing: {
      prefixDefaultLocale: true,
      // La racine « / » est gérée par src/pages/index.astro (choix de langue).
      redirectToDefaultLocale: false,
    },
  },
});
