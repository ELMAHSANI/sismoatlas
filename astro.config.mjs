// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  // URL provisoire : à remplacer par le domaine définitif en phase 9.
  site: 'https://sismoatlas.pages.dev',
  trailingSlash: 'always',
  integrations: [mdx()],
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
