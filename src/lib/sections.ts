import type { RouteKey } from '../i18n/config';
import type { UIKey } from '../i18n/utils';
import type { ArticleCollection } from './content';

/** Lien entre une collection de contenu, sa rubrique (URL) et son texte d'introduction. */
export const SECTIONS: Record<ArticleCollection, { route: RouteKey; intro?: UIKey }> = {
  earthquakes: { route: 'majorEarthquakes', intro: 'section.majorEarthquakes.intro' },
  understand: { route: 'understand', intro: 'section.understand.intro' },
  factchecks: { route: 'factCheck', intro: 'section.factCheck.intro' },
  reports: { route: 'reports', intro: 'section.reports.intro' },
  articles: { route: 'articles', intro: 'section.articles.intro' },
  guide: { route: 'safetyGuide' },
};
