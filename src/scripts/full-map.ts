/**
 * Carte complète (phase 7).
 * - catalogue de référence 1045–2005 (Peláez et al., 2007) et sismicité depuis 2006 (EMSC + USGS) ;
 * - filtres appliqués par MapLibre (expressions), compteur calculé avec le même critère ;
 * - les petits séismes (M < 2) ne sont téléchargés que si l'utilisateur abaisse la magnitude minimale ;
 * - fiche détaillée au clic, ville la plus proche calculée dans le navigateur.
 */
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, FilterSpecification, MapGeoJSONFeature } from 'maplibre-gl';
import { STYLES, adaptBaseStyle, css, cssUrl, isDark, loadCss, MOROCCO_BOUNDS } from './quake-map';
import { esc, formatMag, localTime, makeT, nearestCity, placePhrase, type City, type Lang, type T } from '../lib/quake';

type Cat = 'hist' | 'ref' | 'rec';
interface Props {
  c: Cat;
  m: number; // magnitude (-1 si inconnue)
  d: number; // profondeur (-1 si inconnue)
  y: number; // année décimale
  k: 0 | 1; // îles Canaries
  i: number; // index de la ligne dans le fichier
  s: number; // fichier : 0 = référence, 1 = récent M ≥ 2, 2 = récent M < 2
}
interface Filters {
  hist: boolean;
  ref: boolean;
  rec: boolean;
  y0: number;
  y1: number;
  mag: number;
  d0: number;
  d1: number;
  canaries: boolean;
  faults: boolean;
  plates: boolean;
  limits: boolean;
  color: 'mag' | 'depth';
}

const MINUTE_MS = 60_000;

interface Feat {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: number[] };
  properties: Props;
}
interface FC {
  type: 'FeatureCollection';
  features: Feat[];
}

function toYear(minutes: number): number {
  const d = new Date(minutes * MINUTE_MS);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

export function initFullMap(): void {
  const root = document.querySelector<HTMLElement>('[data-fullmap]');
  if (!root) return;
  const lang = root.dataset.lang as Lang;
  const maxYear = Number(root.dataset.maxYear);
  const t: T = makeT(JSON.parse(document.getElementById('map-i18n')?.textContent ?? '{}'));
  const form = root.querySelector<HTMLFormElement>('[data-filters]')!;
  const countEl = root.querySelector<HTMLElement>('[data-count]')!;
  const detail = root.querySelector<HTMLElement>('[data-detail]')!;
  const legendMag = root.querySelector<HTMLElement>('[data-legend="mag"]')!;
  const legendDepth = root.querySelector<HTMLElement>('[data-legend="depth"]')!;
  const filtersBox = root.querySelector<HTMLDetailsElement>('.fm-filters')!;
  if (!matchMedia('(min-width: 64rem)').matches) filtersBox.open = false;

  // Données brutes (lignes compactes) et propriétés calculées, par fichier
  const raw: { rows: any[]; agencies: string[]; magTypes?: string[] }[] = [];
  const props: Props[][] = [[], [], []];
  let cities: City[] | null = null;
  let smallState: 'none' | 'loading' | 'loaded' = 'none';

  const read = (): Filters => {
    const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement);
    const num = (n: string, def: number) => (Number.isFinite(parseFloat(v(n).value)) ? parseFloat(v(n).value) : def);
    return {
      hist: v('hist').checked, ref: v('ref').checked, rec: v('rec').checked,
      y0: num('y0', 1045), y1: num('y1', maxYear), mag: num('mag', 2.5), d0: num('d0', 0), d1: num('d1', 700),
      canaries: v('canaries').checked, faults: v('faults').checked, plates: v('plates').checked, limits: v('limits').checked,
      color: ((form.elements.namedItem('color') as RadioNodeList).value as 'mag' | 'depth') || 'mag',
    };
  };

  // ------------------------------------------------------------ critère commun (carte et compteur)
  function matches(p: Props, f: Filters): boolean {
    if (!f[p.c]) return false;
    if (p.y < f.y0 || p.y >= f.y1 + 1) return false;
    if (f.mag > 0 && p.m < f.mag) return false;
    if (p.d >= 0 && (p.d < f.d0 || p.d > f.d1)) return false;
    if (p.k && !f.canaries) return false;
    return true;
  }

  function filterExpr(f: Filters): FilterSpecification {
    const cats = (['hist', 'ref', 'rec'] as Cat[]).filter((c) => f[c]);
    const all: ExpressionSpecification[] = [
      ['in', ['get', 'c'], ['literal', cats]],
      ['>=', ['get', 'y'], f.y0],
      ['<', ['get', 'y'], f.y1 + 1],
      ['any', ['<', ['get', 'd'], 0], ['all', ['>=', ['get', 'd'], f.d0], ['<=', ['get', 'd'], f.d1]]],
    ];
    if (f.mag > 0) all.push(['>=', ['get', 'm'], f.mag]);
    if (!f.canaries) all.push(['==', ['get', 'k'], 0]);
    return ['all', ...all];
  }

  function color(f: Filters): ExpressionSpecification {
    if (f.color === 'depth') {
      return ['case', ['<', ['get', 'd'], 0], css('--depth-0'),
        ['step', ['get', 'd'], css('--depth-1'), 30, css('--depth-2'), 70, css('--depth-3'), 300, css('--depth-4')]];
    }
    return ['step', ['get', 'm'], css('--mag-1'), 3, css('--mag-2'), 4, css('--mag-3'), 5, css('--mag-4'), 6, css('--mag-5')];
  }

  // ------------------------------------------------------------ chargement des données
  async function loadFile(index: 0 | 1 | 2): Promise<FC> {
    const name = ['reference', 'recent-m2', 'recent-small'][index];
    const res = await fetch(`/data/catalogue/${name}.json`);
    const json = await res.json();
    raw[index] = json;
    const features: Feat[] = json.rows.map((r: any[], i: number) => {
      let p: Props;
      if (index === 0) {
        // [lon, lat, Mw, profondeur, année, date, heure, agence, Imax, lieu, id]
        p = { c: r[4] < 1900 ? 'hist' : 'ref', m: r[2] ?? -1, d: r[3] ?? -1, y: r[4], k: 0, i, s: index };
      } else {
        // [lon, lat, mag, profondeur, minutes, agence, type, id, canaries]
        p = { c: 'rec', m: r[2] ?? -1, d: r[3] ?? -1, y: toYear(r[4]), k: r[8] ? 1 : 0, i, s: index };
      }
      props[index].push(p);
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [r[0], r[1]] }, properties: p };
    });
    return { type: 'FeatureCollection', features };
  }

  // ------------------------------------------------------------ carte
  let map: maplibregl.Map;
  const SOURCES = ['ref', 'rec', 'small'];

  function addQuakeLayer(id: string, data: FC, f: Filters): void {
    if (map.getSource(id)) return;
    map.addSource(id, { type: 'geojson', data });
    map.addLayer({
      id,
      type: 'circle',
      source: id,
      filter: filterExpr(f),
      layout: { 'circle-sort-key': ['get', 'm'] },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['interpolate', ['linear'], ['get', 'm'], -1, 1.5, 2, 2, 4, 4, 6, 8, 8, 14],
          9, ['interpolate', ['linear'], ['get', 'm'], -1, 3, 2, 4, 4, 8, 6, 14, 8, 22]],
        'circle-color': color(f),
        'circle-opacity': 0.8,
        'circle-stroke-width': ['case', ['==', ['get', 'c'], 'rec'], 0.3, 1],
        'circle-stroke-color': css('--color-bg'),
      },
    });
  }

  const loaded: Partial<Record<string, FC>> = {};

  function addOverlays(): void {
    const f = read();
    adaptBaseStyle(map, lang);
    map.addSource('plates', { type: 'geojson', data: '/data/sig/plates.geojson' });
    map.addLayer({ id: 'plates', type: 'line', source: 'plates', paint: { 'line-color': css('--color-text-muted'), 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    map.addSource('faults', { type: 'geojson', data: '/data/sig/gem_faults.geojson' });
    map.addLayer({ id: 'faults', type: 'line', source: 'faults', paint: { 'line-color': css('--color-danger'), 'line-width': 1.3, 'line-opacity': 0.8 } });
    map.addSource('limits', { type: 'geojson', data: '/data/sig/morocco.geojson' });
    map.addLayer({ id: 'limits', type: 'line', source: 'limits', paint: { 'line-color': css('--color-primary'), 'line-width': 1.4, 'line-opacity': 0.85 } });
    // Les données déjà chargées sont rajoutées après un changement de fond de carte (thème)
    for (const id of SOURCES) if (loaded[id]) addQuakeLayer(id, loaded[id]!, f);
    apply();
  }

  function apply(): void {
    const f = read();
    const out = form.elements.namedItem('magOut') as HTMLOutputElement;
    out.value = f.mag > 0 ? formatMag(f.mag, lang) : t('map.magAll');
    legendMag.hidden = f.color !== 'mag';
    legendDepth.hidden = f.color !== 'depth';
    if (!map) return;
    for (const id of ['faults', 'plates', 'limits'] as const) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', f[id] ? 'visible' : 'none');
    }
    for (const id of SOURCES) {
      if (!map.getLayer(id)) continue;
      map.setFilter(id, filterExpr(f));
      map.setPaintProperty(id, 'circle-color', color(f));
    }
    // Petits séismes : téléchargés à la première demande
    if (f.rec && f.mag < 2 && smallState === 'none') {
      smallState = 'loading';
      countEl.textContent = t('map.loadingSmall');
      loadFile(2).then((fc) => {
        loaded.small = fc;
        smallState = 'loaded';
        addQuakeLayer('small', fc, read());
        apply();
      });
    }
    let n = 0;
    for (const list of props) for (const p of list) if (matches(p, f)) n++;
    if (smallState !== 'loading') countEl.textContent = t('map.count', { n: n.toLocaleString(lang === 'ar' ? 'ar-MA-u-nu-latn' : lang) });
  }

  // ------------------------------------------------------------ fiche détaillée
  async function showDetail(feature: MapGeoJSONFeature): Promise<void> {
    const p = feature.properties as unknown as Props;
    const file = raw[p.s];
    const r = file.rows[p.i];
    const rows: [string, string][] = [];
    let link = '';
    let place = '';
    if (p.s === 0) {
      const [, , mw, depth, , date, time, ag, imax, loc, id] = r;
      rows.push([t('map.detail.date'), date], [t('map.detail.time'), time || '—'], [t('map.detail.mag'), `${formatMag(mw, lang)} Mw`],
        [t('map.detail.depth'), depth != null ? `${depth} km` : t('map.detail.unknown')]);
      if (imax != null) rows.push([t('map.detail.imax'), String(imax)]);
      rows.push([t('map.detail.agency'), `${file.agencies[ag]} · ${id}`],
        [t('map.detail.catalog'), `${t(p.c === 'hist' ? 'map.cat.hist' : 'map.cat.ref')} — Peláez et al. (2007)`]);
      place = loc;
      link = 'https://doi.org/10.1785/gssrl.78.6.614';
    } else {
      const [lon, lat, mag, depth, minutes, ag, mt, id, can] = r;
      const iso = new Date(minutes * MINUTE_MS).toISOString();
      rows.push([t('map.detail.date'), iso.slice(0, 10)], [t('map.detail.time'), `${iso.slice(11, 16)} · ${localTime(iso, lang, false)} (${t('quake.moroccoTime')})`],
        [t('map.detail.mag'), mag != null ? `${formatMag(mag, lang)} ${file.magTypes?.[mt] ?? ''}` : t('map.detail.unknown')],
        [t('map.detail.depth'), depth != null ? `${depth} km` : t('map.detail.unknown')],
        [t('map.detail.agency'), file.agencies[ag]], [t('map.detail.catalog'), t('map.cat.rec') + (can ? ` — ${t('map.detail.canaries')}` : '')]);
      try {
        cities ??= ((await (await fetch('/data/cities.json')).json()).cities as City[]);
        place = placePhrase(nearestCity(cities, lat, lon, 5000), lang, t);
      } catch {
        place = '';
      }
      const code = String(id);
      if (code.startsWith('u')) link = `https://earthquake.usgs.gov/earthquakes/eventpage/${code.slice(1)}`;
      else {
        const unid = code.startsWith('E') ? code.slice(1) : `${iso.slice(0, 10).replaceAll('-', '')}_${code.slice(1)}`;
        link = `https://www.seismicportal.eu/eventdetails.html?unid=${unid}`;
      }
    }
    if (place) rows.splice(2, 0, [t('map.detail.place'), place]);
    detail.innerHTML = `<h2>${esc(t('map.detail.title'))}</h2><dl>${rows
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
      .join('')}</dl>${link ? `<p style="margin-top:.5rem"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(t('map.detail.link'))}</a></p>` : ''}`;
  }

  // ------------------------------------------------------------ démarrage
  (async () => {
    await loadCss(cssUrl);
    map = new maplibregl.Map({
      container: 'full-map',
      style: isDark() ? STYLES.dark : STYLES.light,
      bounds: MOROCCO_BOUNDS,
      fitBoundsOptions: { padding: 12 },
      maxZoom: 12,
      attributionControl: { compact: true, customAttribution: 'Peláez et al. 2007 · EMSC-CSEM · USGS · GEM GAF · Bird 2003' },
      cooperativeGestures: !matchMedia('(min-width: 64rem)').matches,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': t('live.map.coopWindows'),
        'CooperativeGesturesHandler.MacHelpText': t('live.map.coopMac'),
        'CooperativeGesturesHandler.MobileHelpText': t('live.map.coopMobile'),
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), document.documentElement.dir === 'rtl' ? 'top-left' : 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), document.documentElement.dir === 'rtl' ? 'bottom-right' : 'bottom-left');
    map.on('style.load', addOverlays);
    await new Promise<void>((r) => map.once('load', () => r()));
    map.resize();
    map.fitBounds(MOROCCO_BOUNDS, { padding: 12, animate: false });

    for (const [id, index] of [['ref', 0], ['rec', 1]] as const) {
      loaded[id] = await loadFile(index);
      addQuakeLayer(id, loaded[id]!, read());
      apply();
    }
    for (const id of SOURCES) {
      map.on('click', id, (e) => e.features?.[0] && showDetail(e.features[0]));
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    const applyTheme = () => map.setStyle(isDark() ? STYLES.dark : STYLES.light);
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  })().catch((err) => {
    console.error('[SismoAtlas] carte complète indisponible', err);
    countEl.textContent = t('map.loading');
  });

  form.addEventListener('input', apply);
  form.addEventListener('change', apply);
  form.addEventListener('reset', () => setTimeout(apply, 0));
  apply();
}
