export const LANGS = ['fr', 'ar', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'fr';

export const LANG_META: Record<Lang, { label: string; short: string; dir: 'ltr' | 'rtl'; htmlLang: string; ogLocale: string }> = {
  fr: { label: 'Français', short: 'FR', dir: 'ltr', htmlLang: 'fr', ogLocale: 'fr_MA' },
  ar: { label: 'العربية', short: 'عربي', dir: 'rtl', htmlLang: 'ar', ogLocale: 'ar_MA' },
  en: { label: 'English', short: 'EN', dir: 'ltr', htmlLang: 'en', ogLocale: 'en_US' },
};

/**
 * Sections du site et leur chemin (slugs en anglais, identiques dans les trois langues).
 * Le libellé affiché vient des fichiers de traduction (`nav.<clé>`).
 */
export const ROUTES = {
  home: '',
  majorEarthquakes: 'major-earthquakes',
  understand: 'understand',
  factCheck: 'fact-check',
  reports: 'reports',
  articles: 'articles',
  safetyGuide: 'safety-guide',
  map: 'map',
  dataMethods: 'data-methods',
  about: 'about',
  legalNotice: 'legal-notice',
  privacy: 'privacy',
  disclaimer: 'disclaimer',
} as const;
export type RouteKey = keyof typeof ROUTES;

/** Entrées du menu principal, dans l'ordre d'affichage. */
export const MAIN_NAV: RouteKey[] = [
  'home',
  'majorEarthquakes',
  'understand',
  'factCheck',
  'reports',
  'safetyGuide',
  'map',
  'dataMethods',
];

/** Liens du pied de page. */
export const FOOTER_NAV: RouteKey[] = ['articles', 'about', 'legalNotice', 'privacy', 'disclaimer', 'dataMethods'];
