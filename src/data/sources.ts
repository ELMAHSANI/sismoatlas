/**
 * Sources de données citées dans le pied de page et la page « Données & méthodes ».
 * Noms propres : non traduits. Licences à vérifier avant toute réutilisation (CLAUDE.md §4.3).
 */
export const DATA_SOURCES = [
  { id: 'usgs', name: 'USGS', url: 'https://earthquake.usgs.gov/' },
  { id: 'emsc', name: 'EMSC-CSEM', url: 'https://www.emsc-csem.org/' },
  { id: 'ign', name: 'IGN (España)', url: 'https://www.ign.es/web/sis-catalogo-terremotos' },
  { id: 'pelaez2007', name: 'Peláez et al. (2007)', url: 'https://doi.org/10.1785/gssrl.78.6.614' },
  // Villes de référence (« à 18 km au nord de… ») : attribution exigée par les licences
  { id: 'geonames', name: 'GeoNames (CC BY 4.0)', url: 'https://www.geonames.org/' },
  { id: 'osm', name: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
] as const;
