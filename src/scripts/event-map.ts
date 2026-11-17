/**
 * Carte intégrée d'une fiche séisme : choc(s) principal(aux), répliques, failles actives (GEM), limites du Maroc.
 * Chargée quand la carte approche de l'écran ; données : /data/events/<slug>.json.
 */
import * as maplibregl from 'maplibre-gl';
import { STYLES, adaptBaseStyle, css, cssUrl, isDark, loadCss } from './quake-map';
import type { Lang } from '../lib/quake';

interface EventJson {
  shocks: {
    key: string;
    usgs?: { lat: number; lon: number; mag: number | null };
    pelaez?: { lat: number; lon: number; mw: number } | null;
    aftershocks?: { points: [number, number, number | null, number | null, number][] };
  }[];
}

export async function renderEventMap(el: HTMLElement): Promise<void> {
  const slug = el.dataset.event!;
  const lang = el.dataset.lang as Lang;
  const res = await fetch(`/data/events/${slug}.json`);
  const ev: EventJson = await res.json();
  await loadCss(cssUrl);

  const mains = ev.shocks
    .map((s) => {
      const p = s.usgs ?? (s.pelaez ? { lat: s.pelaez.lat, lon: s.pelaez.lon, mag: s.pelaez.mw } : null);
      return p ? { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }, properties: { label: s.key, mag: p.mag ?? 0 } } : null;
    })
    .filter((f): f is NonNullable<typeof f> => !!f);
  const after = ev.shocks.flatMap((s) =>
    (s.aftershocks?.points ?? []).map(([lon, lat, mag, , day]) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
      properties: { mag: mag ?? 0, day },
    })),
  );

  // Cadrage : chocs principaux + répliques, avec une marge minimale
  const coords = [...mains, ...after].map((f) => f.geometry.coordinates);
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const pad = Number(el.dataset.pad ?? 0.4);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lons) - pad, Math.min(...lats) - pad],
    [Math.max(...lons) + pad, Math.max(...lats) + pad],
  ];

  el.innerHTML = '';
  const map = new maplibregl.Map({
    container: el,
    style: isDark() ? STYLES.dark : STYLES.light,
    bounds,
    fitBoundsOptions: { padding: 16 },
    maxZoom: 11,
    attributionControl: { compact: true, customAttribution: 'USGS · EMSC-CSEM · GEM GAF (CC BY-SA 4.0) · Natural Earth' },
    cooperativeGestures: true,
  });
  map.getCanvas().setAttribute('aria-label', el.getAttribute('aria-label') ?? '');
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), document.documentElement.dir === 'rtl' ? 'top-left' : 'top-right');

  map.on('style.load', () => {
    adaptBaseStyle(map, lang);
    map.addSource('morocco', { type: 'geojson', data: '/data/sig/morocco.geojson' });
    map.addLayer({ id: 'morocco', type: 'line', source: 'morocco', paint: { 'line-color': css('--color-primary'), 'line-width': 1.2, 'line-opacity': 0.7 } });
    map.addSource('faults', { type: 'geojson', data: '/data/sig/gem_faults.geojson' });
    map.addLayer({ id: 'faults', type: 'line', source: 'faults', paint: { 'line-color': css('--color-danger'), 'line-width': 1.6, 'line-opacity': 0.85 } });
    map.addSource('after', { type: 'geojson', data: { type: 'FeatureCollection', features: after } });
    map.addLayer({
      id: 'after',
      type: 'circle',
      source: 'after',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 2, 3, 3.5, 5, 7],
        'circle-color': ['step', ['get', 'mag'], css('--mag-1'), 3, css('--mag-2'), 4, css('--mag-3'), 5, css('--mag-4'), 6, css('--mag-5')],
        'circle-opacity': 0.7,
        'circle-stroke-width': 0.5,
        'circle-stroke-color': css('--color-bg'),
      },
    });
    map.addSource('mains', { type: 'geojson', data: { type: 'FeatureCollection', features: mains } });
    map.addLayer({
      id: 'mains',
      type: 'circle',
      source: 'mains',
      paint: {
        'circle-radius': 11,
        'circle-color': css('--mag-5'),
        'circle-stroke-width': 3,
        'circle-stroke-color': css('--color-bg'),
      },
    });
    map.addLayer({
      id: 'mains-label',
      type: 'symbol',
      source: 'mains',
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.6], 'text-anchor': 'top' },
      paint: { 'text-color': css('--color-text'), 'text-halo-color': css('--color-bg'), 'text-halo-width': 1.5 },
    });
  });
  const applyTheme = () => map.setStyle(isDark() ? STYLES.dark : STYLES.light);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
