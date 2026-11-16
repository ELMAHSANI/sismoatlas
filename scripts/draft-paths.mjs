// Adresses des contenus marqués `draft: true` (src/content/<collection>/<langue>/<slug>.mdx).
// Utilisé par astro.config.mjs pour retirer les brouillons du sitemap : tant qu'ils sont affichés
// (site.config.ts : showDrafts), ils portent aussi <meta name="robots" content="noindex">.
import fs from 'node:fs';
import path from 'node:path';

/** Collection → chemin de la rubrique (voir src/i18n/config.ts ROUTES et src/lib/sections.ts). */
const ROUTE = {
  earthquakes: (slug) => `major-earthquakes/${slug}`,
  understand: (slug) => `understand/${slug}`,
  factchecks: (slug) => `fact-check/${slug}`,
  articles: (slug) => `articles/${slug}`,
  reports: (slug) => `reports/${slug}`,
  guide: () => 'safety-guide',
  pages: (slug) => slug,
};

export function draftPaths(contentDir) {
  const out = new Set();
  for (const [collection, route] of Object.entries(ROUTE)) {
    const base = path.join(contentDir, collection);
    if (!fs.existsSync(base)) continue;
    for (const lang of fs.readdirSync(base)) {
      const dir = path.join(base, lang);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!/\.mdx?$/.test(file)) continue;
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
        if (/^draft:\s*true\s*$/m.test(front)) out.add(`/${lang}/${route(file.replace(/\.mdx?$/, ''))}/`);
      }
    }
  }
  return out;
}
