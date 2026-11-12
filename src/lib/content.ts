import { getCollection, type CollectionEntry } from 'astro:content';
import { LANGS, type Lang } from '../i18n/config';
import { SITE } from '../site.config';

export type ArticleCollection = 'articles' | 'earthquakes' | 'understand' | 'factchecks' | 'reports' | 'guide';
export type ArticleEntry = CollectionEntry<ArticleCollection>;

/** Slug d'URL d'une entrée : nom du fichier sans le dossier de langue. */
export function entrySlug(entry: { id: string }): string {
  return entry.id.split('/').slice(1).join('/') || entry.id;
}

/** Entrées publiables d'une collection (les brouillons selon SITE.showDrafts). */
export async function getPublished<C extends ArticleCollection | 'pages'>(collection: C) {
  const all = await getCollection(collection);
  return all.filter((e) => SITE.showDrafts || !e.data.draft);
}

/** Entrées d'une langue, des plus récentes aux plus anciennes. */
export async function getByLang(collection: ArticleCollection, lang: Lang) {
  const entries = (await getPublished(collection)).filter((e) => e.data.lang === lang);
  return entries.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/**
 * Pour chaque langue, le slug de la traduction d'une entrée (s'il existe).
 * Sert au sélecteur de langue : sans traduction, il renvoie vers la rubrique.
 */
export async function getAlternates(collection: ArticleCollection | 'pages', translationKey: string) {
  const all = await getPublished(collection);
  const result: Partial<Record<Lang, string>> = {};
  for (const lang of LANGS) {
    const match = all.find((e) => e.data.lang === lang && e.data.translationKey === translationKey);
    if (match) result[lang] = entrySlug(match);
  }
  return result;
}
