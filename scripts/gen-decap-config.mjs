// Génère public/admin/config.yml (Decap CMS) à partir d'une description unique des collections.
// Usage : node scripts/gen-decap-config.mjs [compte/dépôt] [adresse du site]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = process.argv[2] || 'COMPTE/sismoatlas';
const SITE = process.argv[3] || 'https://sismoatlas.pages.dev';
const OUT = fileURLToPath(new URL('../public/admin/config.yml', import.meta.url));

const y = (v) => JSON.stringify(v);

/** Champs de la section 5.5 du cahier des charges. */
function articleFields(category, { eventIds = false, richText = true } = {}) {
  const f = [
    `{ label: "Titre", name: title, widget: string, i18n: true }`,
    `{ label: "Description (une phrase)", name: description, widget: text, i18n: true }`,
    `{ label: "Date", name: date, widget: datetime, format: "YYYY-MM-DD", date_format: "DD/MM/YYYY", time_format: false, i18n: duplicate }`,
    `{ label: "Mise à jour", name: updated, widget: datetime, format: "YYYY-MM-DD", date_format: "DD/MM/YYYY", time_format: false, required: false, i18n: duplicate }`,
    `{ label: "Auteur", name: author, widget: string, default: "SismoAtlas", i18n: duplicate }`,
    `{ label: "Langue (doit correspondre à l'onglet de langue)", name: lang, widget: select, options: [fr, ar, en], i18n: true }`,
    `{ label: "Clé de traduction (= nom du fichier, identique dans les 3 langues)", name: translationKey, widget: string, i18n: duplicate }`,
    `{ label: "Catégorie", name: category, widget: hidden, default: ${y(category)}, i18n: duplicate }`,
    `{ label: "Mots-clés", name: tags, widget: list, required: false, i18n: true }`,
    `{ label: "Références", name: references, widget: list, required: false, i18n: duplicate, fields: [{ label: "Référence complète", name: citation, widget: string }, { label: "DOI (sans https://doi.org/)", name: doi, widget: string, required: false }, { label: "Lien", name: url, widget: string, required: false }] }`,
    `{ label: "Licence", name: license, widget: hidden, default: "CC BY 4.0", i18n: duplicate }`,
    `{ label: "Brouillon (non publié)", name: draft, widget: boolean, default: true, i18n: true }`,
  ];
  if (eventIds) f.push(`{ label: "Identifiants des séismes (ex. usgs:us7000kufc)", name: eventIds, widget: list, required: false, i18n: duplicate }`);
  // Les fiches et rapports contiennent des composants (<EventMap …/>) : édition en Markdown brut uniquement
  f.push(`{ label: "Texte", name: body, widget: markdown, i18n: true, modes: ${richText ? '[rich_text, raw]' : '[raw]'} }`);
  return f;
}

const pageFields = [
  `{ label: "Titre", name: title, widget: string, i18n: true }`,
  `{ label: "Description", name: description, widget: text, i18n: true }`,
  `{ label: "Langue (doit correspondre à l'onglet de langue)", name: lang, widget: select, options: [fr, ar, en], i18n: true }`,
  `{ label: "Clé de traduction", name: translationKey, widget: string, i18n: duplicate }`,
  `{ label: "Mise à jour", name: updated, widget: datetime, format: "YYYY-MM-DD", date_format: "DD/MM/YYYY", time_format: false, required: false, i18n: duplicate }`,
  `{ label: "Brouillon (non publié)", name: draft, widget: boolean, default: true, i18n: true }`,
  `{ label: "Texte", name: body, widget: markdown, i18n: true, modes: [rich_text, raw] }`,
];

const COLLECTIONS = [
  { name: 'earthquakes', label: 'Séismes majeurs (fiches)', category: 'major-earthquake', eventIds: true, richText: false },
  { name: 'understand', label: 'Comprendre', category: 'understand', richText: false },
  { name: 'factchecks', label: 'Vrai ou faux ?', category: 'fact-check' },
  { name: 'articles', label: 'Articles', category: 'news' },
  { name: 'reports', label: 'Rapports (relecture des rapports du robot)', category: 'report', eventIds: true, richText: false },
  { name: 'guide', label: 'Guide de sécurité', category: 'safety', richText: false, create: false },
];

const lines = [
  '# Decap CMS — édition des contenus sans code (https://decapcms.org/docs/)',
  '# Fichier généré par scripts/gen-decap-config.mjs : modifier le script, pas ce fichier.',
  '# Chaque modification passe par une Pull Request (publish_mode: editorial_workflow) : rien n\'est publié sans validation.',
  '# Connexion GitHub : functions/api/auth.js et functions/api/callback.js (Cloudflare Pages Functions).',
  '',
  'backend:',
  '  name: github',
  `  repo: ${REPO}`,
  '  branch: main',
  `  base_url: ${SITE}`,
  '  auth_endpoint: api/auth',
  '',
  'publish_mode: editorial_workflow',
  'locale: fr',
  'media_folder: public/images/uploads',
  'public_folder: /images/uploads',
  '',
  'i18n:',
  '  structure: multiple_folders',
  '  locales: [fr, ar, en]',
  '  default_locale: fr',
  '',
  'collections:',
];
for (const c of COLLECTIONS) {
  lines.push(
    `  - name: ${c.name}`,
    `    label: ${y(c.label)}`,
    `    folder: src/content/${c.name}`,
    '    extension: mdx',
    '    format: frontmatter',
    `    create: ${c.create !== false}`,
    '    slug: "{{slug}}"',
    '    i18n: true',
    '    fields:',
    ...articleFields(c.category, c).map((f) => `      - ${f}`),
  );
}
lines.push(
  '  - name: pages',
  '    label: "Pages institutionnelles"',
  '    folder: src/content/pages',
  '    extension: mdx',
  '    format: frontmatter',
  '    create: false',
  '    slug: "{{slug}}"',
  '    i18n: true',
  '    fields:',
  ...pageFields.map((f) => `      - ${f}`),
  '',
);
writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`public/admin/config.yml généré (dépôt : ${REPO}, site : ${SITE})`);
