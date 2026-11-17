/**
 * Réglages globaux du site.
 */
export const SITE = {
  name: 'SismoAtlas',
  /**
   * Afficher les contenus marqués `draft: true` (avec un badge « Brouillon »).
   * Laissé à `true` pendant la construction du site pour voir les pages provisoires.
   * ⚠️ À passer à `false` avant la mise en ligne publique (vérification de la phase 10).
   */
  showDrafts: true,
  /** Adresse de contact publique du site. */
  contactEmail: 'sismoatlas@gmail.com',
  /** Licence des contenus éditoriaux. */
  contentLicense: 'CC BY 4.0',
  contentLicenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;
