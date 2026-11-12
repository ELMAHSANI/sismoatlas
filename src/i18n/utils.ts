import fr from './fr.json';
import ar from './ar.json';
import en from './en.json';
import { DEFAULT_LANG, LANGS, ROUTES, type Lang, type RouteKey } from './config';

export type UIKey = keyof typeof fr;

const DICTS: Record<Lang, Partial<Record<UIKey, string>>> = { fr, ar, en };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * Renvoie la fonction de traduction d'une langue.
 * Si une clé manque dans la langue demandée, on retombe sur le français.
 * Les variables s'écrivent {nom} dans les chaînes : t('footer.copyright', { year: 2026 }).
 */
export function useTranslations(lang: Lang) {
  return function t(key: UIKey, vars?: Record<string, string | number>): string {
    let str = DICTS[lang][key] ?? DICTS[DEFAULT_LANG][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v));
    }
    return str;
  };
}

/** Chemin d'une page dans une langue : localizePath('ar', 'understand') → /ar/understand/ */
export function localizePath(lang: Lang, path = ''): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  return clean ? `/${lang}/${clean}/` : `/${lang}/`;
}

export function routePath(lang: Lang, route: RouteKey, sub?: string): string {
  return localizePath(lang, [ROUTES[route], sub].filter(Boolean).join('/'));
}

/** Remplace la langue en tête d'un chemin : /fr/map/ → /en/map/ */
export function switchLangPath(pathname: string, target: Lang): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length && isLang(parts[0])) parts.shift();
  return localizePath(target, parts.join('/'));
}

/** getStaticPaths commun : une page par langue. */
export function langStaticPaths() {
  return LANGS.map((lang) => ({ params: { lang } }));
}

/** Date lisible dans la langue (chiffres occidentaux, usage courant au Maroc). */
export function formatDate(date: Date, lang: Lang): string {
  const locale = lang === 'ar' ? 'ar-MA-u-nu-latn' : lang === 'fr' ? 'fr-MA' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Casablanca' }).format(date);
}
