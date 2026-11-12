import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Organisation des fichiers : src/content/<collection>/<langue>/<slug>.mdx
 * Le même slug (nom de fichier) est utilisé dans les trois langues ;
 * `translationKey` relie les traductions entre elles.
 */

const reference = z.object({
  /** Référence complète, ex. « Peláez J. A. et al. (2007). A Catalog of… SRL 78(6), 614–621. » */
  citation: z.string(),
  /** DOI sans préfixe, ex. 10.1785/gssrl.78.6.614 */
  doi: z.string().optional(),
  url: z.url().optional(),
});

/** Métadonnées d'article — section 5.5 du cahier des charges. */
const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  author: z.string().default('SismoAtlas'),
  lang: z.enum(['fr', 'ar', 'en']),
  translationKey: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  references: z.array(reference).default([]),
  license: z.literal('CC BY 4.0').default('CC BY 4.0'),
  draft: z.boolean().default(false),
  /**
   * Identifiants des séismes traités (facultatif, en plus de la section 5.5) : « usgs:us7000kufc »,
   * « emsc:20230908_0000250 ». Permet de relier un séisme de la carte à son rapport ou à sa fiche.
   */
  eventIds: z.array(z.string()).default([]),
});

const articleCollection = (dir: string) =>
  defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: `./src/content/${dir}` }),
    schema: articleSchema,
  });

/** Pages institutionnelles (à propos, mentions légales…) : schéma allégé. */
const pageSchema = z.object({
  title: z.string(),
  description: z.string(),
  lang: z.enum(['fr', 'ar', 'en']),
  translationKey: z.string(),
  updated: z.coerce.date().optional(),
  draft: z.boolean().default(false),
});

export const collections = {
  /** Analyses, actualités. */
  articles: articleCollection('articles'),
  /** Fiches « séismes majeurs » (section 5.4). */
  earthquakes: articleCollection('earthquakes'),
  /** « Comprendre » : vulgarisation. */
  understand: articleCollection('understand'),
  /** « Vrai ou faux ? » : rumeurs. */
  factchecks: articleCollection('factchecks'),
  /** Rapports générés par le robot puis validés (section 5.3). */
  reports: articleCollection('reports'),
  /** Guide de sécurité avant / pendant / après. */
  guide: articleCollection('guide'),
  /** Pages institutionnelles. */
  pages: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
    schema: pageSchema,
  }),
};
