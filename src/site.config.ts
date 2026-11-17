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
  /**
   * Jetons de validation des moteurs de recherche (publics par nature : ils figurent dans la page).
   * Une variable Cloudflare PUBLIC_GOOGLE_SITE_VERIFICATION / PUBLIC_BING_SITE_VERIFICATION les remplace si elle existe.
   * Ne pas supprimer : Google et Bing revérifient régulièrement leur présence.
   */
  googleSiteVerification: 'LB6Y5hWuNaAEvaVx3kjIYxrPxf_V6hIUMVtC-z9iEoE',
  bingSiteVerification: '800A7E984458552BEE0815A1F86B7E6A',
  /** Adresse de contact publique du site. */
  contactEmail: 'sismoatlas@gmail.com',
  /** Licence des contenus éditoriaux. */
  contentLicense: 'CC BY 4.0',
  contentLicenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;
