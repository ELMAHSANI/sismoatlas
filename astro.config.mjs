// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Adresse publique du site : variable SITE_URL (Cloudflare Pages), sinon l'adresse provisoire.
// À remplacer par le domaine définitif (ex. https://sismoatlas.com) quand il sera acheté.
const SITE_URL = process.env.SITE_URL || 'https://sismoatlas.pages.dev';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  integrations: [
    mdx(),
    sitemap({
      // La racine « / » ne fait que rediriger vers une langue ; la page 404 n'a pas à être indexée.
      filter: (page) => new URL(page).pathname !== '/' && !page.includes('/404'),
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
