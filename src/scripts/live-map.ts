/**
 * Carte MapLibre de la section « Séismes au Maroc » (chargée à la demande, jamais au premier affichage).
 * - fond de carte OpenFreeMap (gratuit, sans clé), clair ou sombre selon le thème ;
 * - frontières et noms de pays du fond de carte masqués : on dessine la couche des limites du Maroc
 *   fournie (territoire complet, CLAUDE.md §4.1) ;
 * - cercles colorés selon l'échelle de magnitude, séisme le plus récent mis en évidence.
 */
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
// Feuille de style chargée avec la carte (et non dans le <head> de la page : elle bloquerait l'affichage en 3G)
import cssUrl from 'maplibre-gl/dist/maplibre-gl.css?url';
import { popupHtml, type Lang, type Quake, type T } from '../lib/quake';

maplibregl.setWorkerUrl(workerUrl);

function loadCss(href: string): Promise<void> {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
}

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const BOUNDS: [[number, number], [number, number]] = [
  [-17.5, 20.5],
  [0.5, 37.5],
];

export interface LiveMap {
  setData(quakes: Quake[], latestId?: string): void;
  select(id: string): void;
}

interface Options {
  lang: Lang;
  t: T;
  onSelect: (id: string) => void;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
};

/** Masque frontières et noms de pays du fond de carte ; noms de lieux dans la langue de la page. */
function adaptBaseStyle(map: MLMap, lang: Lang): void {
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

export async function createLiveMap(container: HTMLElement, { lang, t, onSelect }: Options): Promise<LiveMap> {
  let data: Quake[] = [];
  let latest: string | undefined;
  const byId = new Map<string, Quake>();
  await loadCss(cssUrl);

  const map = new maplibregl.Map({
    container,
    style: isDark() ? STYLES.dark : STYLES.light,
    bounds: BOUNDS,
    fitBoundsOptions: { padding: 12 },
    maxZoom: 11,
    attributionControl: { compact: true, customAttribution: 'EMSC-CSEM · USGS' },
    cooperativeGestures: true,
    locale: {
      'CooperativeGesturesHandler.WindowsHelpText': t('live.map.coopWindows'),
      'CooperativeGesturesHandler.MacHelpText': t('live.map.coopMac'),
      'CooperativeGesturesHandler.MobileHelpText': t('live.map.coopMobile'),
    },
  });
  map.getCanvas().setAttribute('aria-label', t('live.map.label'));
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
    features: data.map((q) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [q.lon, q.lat] },
      properties: { id: q.id, mag: q.mag ?? 0, latest: q.id === latest },
    })),
  });

  function addOverlays(): void {
    adaptBaseStyle(map, lang);
    if (!map.getSource('morocco')) {
      map.addSource('morocco', { type: 'geojson', data: '/data/sig/morocco.geojson' });
      map.addLayer({
        id: 'morocco-line',
        type: 'line',
        source: 'morocco',
        paint: { 'line-color': css('--color-primary'), 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 8, 2], 'line-opacity': 0.8 },
      });
    }
    if (!map.getSource('quakes')) {
      map.addSource('quakes', { type: 'geojson', data: toGeoJSON() });
      map.addLayer({
        id: 'quakes',
        type: 'circle',
        source: 'quakes',
        layout: { 'circle-sort-key': ['get', 'mag'] },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 3, 2.5, 5, 4, 9, 5, 13, 6, 18, 7, 24],
          'circle-color': ['step', ['get', 'mag'], css('--mag-1'), 3, css('--mag-2'), 4, css('--mag-3'), 5, css('--mag-4'), 6, css('--mag-5')],
          'circle-opacity': 0.85,
          'circle-stroke-width': ['case', ['get', 'latest'], 3, 1],
          'circle-stroke-color': ['case', ['get', 'latest'], css('--color-accent'), css('--color-bg')],
        },
      });
    }
  }

  function refresh(): void {
    (map.getSource('quakes') as GeoJSONSource | undefined)?.setData(toGeoJSON());
    const q = latest ? byId.get(latest) : undefined;
    if (q && !reduceMotion) pulse.setLngLat([q.lon, q.lat]).addTo(map);
    else pulse.remove();
  }

  function showPopup(q: Quake): void {
    popup.setLngLat([q.lon, q.lat]).setHTML(popupHtml(q, lang, t)).addTo(map);
  }

  map.on('style.load', () => {
    addOverlays();
    refresh();
  });
  map.on('click', 'quakes', (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    const q = id ? byId.get(id) : undefined;
    if (q) {
      showPopup(q);
      onSelect(q.id);
    }
  });
  map.on('mouseenter', 'quakes', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'quakes', () => (map.getCanvas().style.cursor = ''));

  // Changement de thème : nouveau fond de carte (les couches sont rajoutées à « style.load »)
  const applyTheme = () => map.setStyle(isDark() ? STYLES.dark : STYLES.light);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  await new Promise<void>((resolve) => (map.loaded() ? resolve() : map.once('load', () => resolve())));
  // Cadrage sur tout le territoire une fois la taille définitive du conteneur connue
  map.resize();
  map.fitBounds(BOUNDS, { padding: 12, animate: false });

  return {
    setData(quakes, latestId) {
      data = quakes;
      latest = latestId;
      byId.clear();
      for (const q of quakes) byId.set(q.id, q);
      if (latestId && !byId.has(latestId)) latest = undefined;
      refresh();
    },
    select(id) {
      const q = byId.get(id);
      if (!q) return;
      map.flyTo({ center: [q.lon, q.lat], zoom: Math.max(map.getZoom(), 7), duration: reduceMotion ? 0 : 900 });
      showPopup(q);
    },
  };
}
