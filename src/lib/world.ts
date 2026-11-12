/**
 * Grands séismes dans le monde (CLAUDE.md §5.2) : données USGS, M ≥ 6, niveau PAGER et indicateur tsunami.
 * Module partagé entre le rendu serveur et le navigateur.
 */
import { esc, formatMag, localTime, relativeTime, utcTime, type Lang, type T } from './quake';

export type PagerLevel = 'green' | 'yellow' | 'orange' | 'red';

export interface WorldQuake {
  id: string;
  time: string;
  lat: number;
  lon: number;
  mag: number | null;
  magType?: string;
  depth?: number | null;
  place?: string; // description USGS, en anglais
  alert?: PagerLevel | null;
  tsunami?: boolean;
  url?: string;
  report?: string; // lien vers notre rapport, s'il existe
}

export function fromWorldFeature(f: { geometry: { coordinates: number[] }; properties: Record<string, any> }): WorldQuake {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  return {
    id: p.id,
    time: p.time,
    lat,
    lon,
    mag: typeof p.mag === 'number' ? p.mag : null,
    magType: p.magType,
    depth: typeof p.depth === 'number' ? p.depth : null,
    place: p.place,
    alert: ['green', 'yellow', 'orange', 'red'].includes(p.alert) ? p.alert : null,
    tsunami: !!p.tsunami,
    url: p.url,
  };
}

// ---------------------------------------------------------------- pays, à partir de la description USGS

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** Noms employés par l'USGS qui ne correspondent pas exactement aux noms anglais des pays. */
const ALIASES: Record<string, string> = {
  alaska: 'US', hawaii: 'US', california: 'US', oregon: 'US', washington: 'US', nevada: 'US', puertorico: 'PR',
  fijiislands: 'FJ', kermadecislands: 'NZ', loyaltyislands: 'NC', timorleste: 'TL', easttimor: 'TL',
  southsandwichislands: 'GS', southgeorgiaandthesouthsandwichislands: 'GS', burma: 'MM', myanmar: 'MM',
  westernsahara: 'MA', // territoire marocain affiché dans son intégralité (CLAUDE.md §4.1)
};

let EN_INDEX: Map<string, string> | null = null;
function enIndex(): Map<string, string> {
  if (EN_INDEX) return EN_INDEX;
  EN_INDEX = new Map();
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a < 91; a++)
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const name = dn.of(code);
        if (name && name !== code) EN_INDEX.set(norm(name), code);
      } catch {
        /* code inconnu */
      }
    }
  return EN_INDEX;
}

/** Code pays ISO déduit de la fin de la description USGS (« 30 km WSW of Lata, Solomon Islands » → SB). */
export function countryCode(place: string | undefined): string | undefined {
  if (!place) return undefined;
  let tail = place.includes(',') ? place.slice(place.lastIndexOf(',') + 1) : place;
  tail = tail
    .replace(/\b(region|earthquake)\b/gi, '')
    .replace(/^\s*\d{4}\s+/, '')
    .replace(/^.*\bof the\b/i, '')
    .replace(/^.*\bof\b/i, '')
    .trim();
  const key = norm(tail);
  if (!key) return undefined;
  const code = ALIASES[key] ?? enIndex().get(key);
  return code === 'EH' ? 'MA' : code;
}

const DISPLAY = new Map<Lang, Intl.DisplayNames>();
export function countryName(code: string, lang: Lang): string {
  if (!DISPLAY.has(lang)) DISPLAY.set(lang, new Intl.DisplayNames([lang], { type: 'region' }));
  return DISPLAY.get(lang)!.of(code) ?? code;
}

// ---------------------------------------------------------------- rendu HTML

const ICON_WAVE =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0M8 6c1.5-2 3-2 4.5 0"/></svg>';

function pagerBadge(q: WorldQuake, t: T): string {
  const level = q.alert ?? 'none';
  return `<span class="pager pager--${level}" title="${esc(t('world.pager.help'))}"><span class="pager-dot" aria-hidden="true"></span>${esc(
    t(`world.pager.${level}`),
  )}</span>`;
}

function tsunamiBadge(q: WorldQuake, t: T): string {
  if (!q.tsunami) return '';
  return `<span class="tsunami" title="${esc(t('world.tsunami.help'))}">${ICON_WAVE}${esc(t('world.tsunami'))}</span>`;
}

/** Titre du séisme : pays dans la langue de la page, sinon la description USGS (anglais). */
function titleHtml(q: WorldQuake, lang: Lang): { main: string; sub: string } {
  const code = countryCode(q.place);
  if (code) return { main: esc(countryName(code, lang)), sub: q.place ? `<span lang="en" dir="ltr">${esc(q.place)}</span>` : '' };
  return { main: `<span lang="en" dir="ltr">${esc(q.place ?? '')}</span>`, sub: '' };
}

/** `client` = rendu navigateur (temps relatif + heure du Maroc) ; sinon rendu serveur (heure UTC). */
export function worldItemHtml(q: WorldQuake, lang: Lang, t: T, client: boolean): string {
  const { main, sub } = titleHtml(q, lang);
  const level = q.alert ?? 'none';
  const time = client
    ? `<span data-rel="${esc(q.time)}">${esc(relativeTime(q.time, lang))}</span> · <time datetime="${esc(q.time)}">${esc(localTime(q.time, lang))} (${esc(t('quake.moroccoTime'))})</time>`
    : `<time datetime="${esc(q.time)}">${esc(utcTime(q.time, lang))}</time>`;
  const links = [
    q.report ? `<a class="btn btn--felt" href="${esc(q.report)}">${esc(t('world.report'))}</a>` : '',
    q.url ? `<a class="btn btn--link" href="${esc(q.url)}" target="_blank" rel="noopener">${esc(t('world.source'))}</a>` : '',
  ].join('');
  return `
  <li class="wq" data-id="${esc(q.id)}" style="--p:var(--pager-${level})">
    <span class="wq-mag" aria-label="${esc(t('quake.mag', { mag: formatMag(q.mag, lang) }))}">${esc(formatMag(q.mag, lang))}</span>
    <div class="wq-body">
      <p class="wq-title">${main}</p>
      ${sub ? `<p class="wq-sub">${sub}</p>` : ''}
      <p class="wq-meta">${time}</p>
      <p class="wq-badges">${pagerBadge(q, t)}${tsunamiBadge(q, t)}</p>
      ${links ? `<div class="q-actions">${links}</div>` : ''}
    </div>
  </li>`;
}

export function worldPopupHtml(q: WorldQuake, lang: Lang, t: T): string {
  const { main } = titleHtml(q, lang);
  return `<div class="map-popup">
    <p class="map-popup-title"><strong>M ${esc(formatMag(q.mag, lang))}</strong> ${main}</p>
    <p class="map-popup-meta"><span data-rel="${esc(q.time)}">${esc(relativeTime(q.time, lang))}</span> · ${esc(localTime(q.time, lang))}</p>
    <p class="map-popup-meta">${esc(t(`world.pager.${q.alert ?? 'none'}`))}${q.tsunami ? ` · ${esc(t('world.tsunami'))}` : ''}</p>
  </div>`;
}
