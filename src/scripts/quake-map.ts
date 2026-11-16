/**
 * Carte MapLibre des séismes, partagée par les sections « Séismes au Maroc » et « Grands séismes dans le monde ».
 * Chargée à la demande (jamais au premier affichage) ; la bibliothèque n'est téléchargée qu'une fois.
 * - fond de carte OpenFreeMap (gratuit, sans clé), clair ou sombre selon le thème ;
 * - frontières et noms de pays du fond de carte masqués, couche des limites du Maroc fournie
 *   (territoire complet, CLAUDE.md §4.1) ;
 * - cercles colorés selon la magnitude (Maroc) ou le niveau d'impact PAGER (monde).
 */
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
// Feuille de style chargée avec la carte (et non dans le <head> de la page : elle bloquerait l'affichage en 3G)
import cssUrl from 'maplibre-gl/dist/maplibre-gl.css?url';
export { cssUrl };
import type { Lang, T } from '../lib/quake';

maplibregl.setWorkerUrl(workerUrl);

export const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
export const MOROCCO_BOUNDS: [[number, number], [number, number]] = [
  [-17.5, 20.5],
  [0.5, 37.5],
];
export const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-180, -58],
  [180, 72],
];

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  mag: number | null;
  alert?: string | null;
  tsunami?: boolean;
}

export interface QuakeMap {
  setData(points: MapPoint[], latestId?: string): void;
  select(id: string): void;
}

export interface QuakeMapOptions {
  lang: Lang;
  t: T;
  label: string;
  bounds: [[number, number], [number, number]];
  colorMode: 'mag' | 'pager';
  popup: (id: string) => string;
  onSelect: (id: string) => void;
  maxZoom?: number;
  selectZoom?: number;
}

export function loadCss(href: string): Promise<void> {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
}

export const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const isDark = () => {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
};

/** Masque frontières et noms de pays du fond de carte ; noms de lieux dans la langue de la page. */
export function adaptBaseStyle(map: MLMap, lang: Lang): void {
  for (const layer of map.getStyle().layers ?? []) {
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
    if (sourceLayer === 'boundary' || /country/i.test(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      continue;
    }
    if (layer.type === 'symbol') {
      const field = map.getLayoutProperty(layer.id, 'text-field');
      if (field && JSON.stringify(field).includes('name')) {
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${lang}`], ['get', 'name:latin'], ['get', 'name']]);
      }
    }
  }
}

function circleColor(mode: 'mag' | 'pager'): any {
  if (mode === 'pager') {
    return [
      'match', ['get', 'alert'],
      'green', css('--pager-green'),
      'yellow', css('--pager-yellow'),
      'orange', css('--pager-orange'),
      'red', css('--pager-red'),
      css('--pager-none'),
    ];
  }
  return ['step', ['get', 'mag'], css('--mag-1'), 3, css('--mag-2'), 4, css('--mag-3'), 5, css('--mag-4'), 6, css('--mag-5')];
}

export async function createQuakeMap(container: HTMLElement, o: QuakeMapOptions): Promise<QuakeMap> {
  let points: MapPoint[] = [];
  let latest: string | undefined;
  const byId = new Map<string, MapPoint>();
  await loadCss(cssUrl);

  const map = new maplibregl.Map({
    container,
    style: isDark() ? STYLES.dark : STYLES.light,
    bounds: o.bounds,
    fitBoundsOptions: { padding: 12 },
    maxZoom: o.maxZoom ?? 11,
    renderWorldCopies: false,
    attributionControl: { compact: true, customAttribution: o.colorMode === 'pager' ? 'USGS' : 'EMSC-CSEM · USGS' },
    cooperativeGestures: true,
    locale: {
      'CooperativeGesturesHandler.WindowsHelpText': o.t('live.map.coopWindows'),
      'CooperativeGesturesHandler.MacHelpText': o.t('live.map.coopMac'),
      'CooperativeGesturesHandler.MobileHelpText': o.t('live.map.coopMobile'),
    },
  });
  map.getCanvas().setAttribute('aria-label', o.label);
  // Le canevas MapLibre est déjà une région nommée : éviter deux repères portant le même nom
  container.removeAttribute('role');
  container.removeAttribute('aria-label');
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), document.documentElement.dir === 'rtl' ? 'top-left' : 'top-right');

  // L'animation est sur un élément enfant : MapLibre positionne le marqueur avec `transform`
  const pulseEl = document.createElement('div');
  pulseEl.className = 'quake-pulse-wrap';
  pulseEl.innerHTML = '<div class="quake-pulse"></div>';
  const pulse = new maplibregl.Marker({ element: pulseEl });
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '18rem', offset: 10 });

  const toGeoJSON = () => ({
    type: 'FeatureCollection' as const,
    features: points.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      properties: { id: p.id, mag: p.mag ?? 0, alert: p.alert ?? 'none', tsunami: !!p.tsunami, latest: p.id === latest },
    })),
  });

  function addOverlays(): void {
    adaptBaseStyle(map, o.lang);
    if (!map.getSource('morocco')) {
      map.addSource('morocco', { type: 'geojson', data: '/data/sig/morocco.geojson' });
      map.addLayer({
        id: 'morocco-line',
        type: 'line',
        source: 'morocco',
        paint: { 'line-color': css('--color-primary'), 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 4, 1, 8, 2], 'line-opacity': 0.8 },
      });
    }
    if (!map.getSource('quakes')) {
      map.addSource('quakes', { type: 'geojson', data: toGeoJSON() });
      const radius =
        o.colorMode === 'pager'
          ? ['interpolate', ['linear'], ['get', 'mag'], 6, 4, 7, 8, 8, 14, 9, 20]
          : ['interpolate', ['linear'], ['get', 'mag'], 0, 3, 2.5, 5, 4, 9, 5, 13, 6, 18, 7, 24];
      map.addLayer({
        id: 'quakes',
        type: 'circle',
        source: 'quakes',
        layout: { 'circle-sort-key': ['get', 'mag'] },
        paint: {
          'circle-radius': radius as any,
          'circle-color': circleColor(o.colorMode),
          'circle-opacity': 0.88,
          'circle-stroke-width': ['case', ['get', 'latest'], 3, ['get', 'tsunami'], 2, 1],
          'circle-stroke-color': ['case', ['get', 'latest'], css('--color-accent'), ['get', 'tsunami'], css('--color-link'), css('--color-bg')],
        },
      });
    }
  }

  function refresh(): void {
    (map.getSource('quakes') as GeoJSONSource | undefined)?.setData(toGeoJSON());
    const p = latest ? byId.get(latest) : undefined;
    if (p && !reduceMotion) pulse.setLngLat([p.lon, p.lat]).addTo(map);
    else pulse.remove();
  }

  function showPopup(p: MapPoint): void {
    popup.setLngLat([p.lon, p.lat]).setHTML(o.popup(p.id)).addTo(map);
  }

  map.on('style.load', () => {
    addOverlays();
    refresh();
  });
  map.on('click', 'quakes', (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    const p = id ? byId.get(id) : undefined;
    if (p) {
      showPopup(p);
      o.onSelect(p.id);
    }
  });
  map.on('mouseenter', 'quakes', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'quakes', () => (map.getCanvas().style.cursor = ''));

  // Changement de thème : nouveau fond de carte (les couches sont rajoutées à « style.load »)
  const applyTheme = () => map.setStyle(isDark() ? STYLES.dark : STYLES.light);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  await new Promise<void>((resolve) => (map.loaded() ? resolve() : map.once('load', () => resolve())));
  // Cadrage une fois la taille définitive du conteneur connue
  map.resize();
  map.fitBounds(o.bounds, { padding: 12, animate: false });

  return {
    setData(next, latestId) {
      points = next;
      latest = latestId;
      byId.clear();
      for (const p of next) byId.set(p.id, p);
      if (latestId && !byId.has(latestId)) latest = undefined;
      refresh();
    },
    select(id) {
      const p = byId.get(id);
      if (!p) return;
      map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), o.selectZoom ?? 7), duration: reduceMotion ? 0 : 900 });
      showPopup(p);
    },
  };
}
