/**
 * Séismes : traduction des données brutes en langage simple + rendu HTML.
 * Module partagé entre le rendu serveur (Astro) et le navigateur (section « Séismes au Maroc »).
 * Aucun texte en dur : tout passe par la fonction de traduction `t`.
 */

export type Lang = 'fr' | 'ar' | 'en';
export type Dir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type T = (key: string, vars?: Record<string, string | number>) => string;

export interface NearCity {
  id: number;
  fr: string;
  ar?: string | null;
  en: string;
  cc: string;
  km: number;
  dir: Dir;
}

export interface Quake {
  id: string;
  time: string; // ISO UTC
  lat: number;
  lon: number;
  mag: number | null;
  magType?: string;
  depth?: number | null;
  depthClass?: 'shallow' | 'intermediate' | 'deep';
  agency?: string;
  source?: string;
  region?: string;
  url?: string;
  emscId?: string;
  near?: NearCity;
  nearMajor?: NearCity;
  canaries?: boolean;
}

export interface City {
  id: number;
  fr: string;
  ar: string | null;
  en: string;
  lat: number;
  lon: number;
  pop: number;
  cc: string;
}

/** Seuil d'affichage par défaut (CLAUDE.md §5.1). */
export const DEFAULT_MIN_MAG = 2.5;
/** Les îles Canaries (volcanisme, essaims) ne sont pas affichées dans la section « Maroc ». */
export const EXCLUDE_CANARIES = true;
export const CANARIES = { minLat: 27.4, maxLat: 29.6, minLon: -18.5, maxLon: -13.2 };
export const NEAR_MIN_POP = 5_000;
export const NEAR_MAJOR_MIN_POP = 100_000;

// ---------------------------------------------------------------- données

export function fromFeature(f: { geometry: { coordinates: number[] }; properties: Record<string, any> }): Quake {
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
    depthClass: p.depthClass,
    agency: p.agency,
    source: p.source,
    region: p.region,
    url: p.url,
    emscId: p.emscId,
    near: p.near,
    nearMajor: p.nearMajor,
    canaries: !!p.canaries,
  };
}

export function inCanaries(lat: number, lon: number): boolean {
  return lat >= CANARIES.minLat && lat <= CANARIES.maxLat && lon >= CANARIES.minLon && lon <= CANARIES.maxLon;
}

/** Niveau de l'échelle de couleurs : 1 (< 3) … 5 (≥ 6). */
export function magLevel(mag: number | null): 1 | 2 | 3 | 4 | 5 {
  if (mag == null || mag < 3) return 1;
  if (mag < 4) return 2;
  if (mag < 5) return 3;
  if (mag < 6) return 4;
  return 5;
}

export function depthClass(depth: number | null | undefined): Quake['depthClass'] {
  if (depth == null) return undefined;
  return depth < 70 ? 'shallow' : depth < 300 ? 'intermediate' : 'deep';
}

// ---------------------------------------------------------------- géographie (événements reçus en direct)

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const DIRS: Dir[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Direction du point 2 vu depuis le point 1. */
export function compass(lat1: number, lon1: number, lat2: number, lon2: number): Dir {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return DIRS[Math.floor((deg + 22.5) / 45) % 8];
}

export function nearestCity(cities: City[], lat: number, lon: number, minPop: number): NearCity | undefined {
  let best: City | undefined;
  let bestD = Infinity;
  for (const c of cities) {
    if (c.pop < minPop) continue;
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return undefined;
  return { id: best.id, fr: best.fr, ar: best.ar, en: best.en, cc: best.cc, km: Math.round(bestD), dir: compass(best.lat, best.lon, lat, lon) };
}

// ---------------------------------------------------------------- textes

const LOCALES: Record<Lang, string> = { fr: 'fr-MA', ar: 'ar-MA-u-nu-latn', en: 'en-GB' };
/**
 * Heure du Maroc : toujours via le fuseau IANA, jamais de décalage codé en dur.
 * (Le Maroc est revenu à GMT le 20/09/2026, décret n° 2.26.530 : les bases de fuseaux anciennes,
 * comme celle de Node 24 / tz 2025b, l'ignorent encore. Le rendu serveur affiche donc l'heure UTC,
 * et c'est le navigateur, dont la base est à jour, qui calcule l'heure du Maroc.)
 */
const TZ = 'Africa/Casablanca';

export function cityName(c: NearCity, lang: Lang): string {
  if (lang === 'ar') return c.ar || c.fr;
  return lang === 'fr' ? c.fr : c.en;
}

/** « à 18 km au nord d'Al Hoceima » / « على بعد 18 كلم شمال الحسيمة » / « 18 km north of Al Hoceima » */
export function placePhrase(c: NearCity | undefined, lang: Lang, t: T): string {
  if (!c) return '';
  const city = cityName(c, lang);
  const elide = lang === 'fr' && /^[aeiouâàéèêîïôûœAEIOUÂÀÉÈÊÎÏÔÛŒ]/.test(city);
  const ofCity = t(elide ? 'place.ofElided' : 'place.of', { city });
  if (c.km < 5) return t('place.near', { ofCity, city });
  return t('place.far', { km: c.km, dir: t(`dir.${c.dir}`), ofCity, city });
}

/** Lieu d'un séisme : ville la plus proche, sinon la région donnée par l'agence. */
export function quakePlace(q: Quake, lang: Lang, t: T): string {
  return placePhrase(q.near, lang, t) || q.region || '';
}

/** Repère secondaire : grande ville connue, si la ville la plus proche est une petite localité. */
export function majorHint(q: Quake, lang: Lang, t: T): string {
  const m = q.nearMajor;
  if (!m || !q.near || m.id === q.near.id || m.km > 200) return '';
  return t('live.near', { km: m.km, city: cityName(m, lang) });
}

export function formatMag(mag: number | null, lang: Lang): string {
  if (mag == null) return '?';
  return new Intl.NumberFormat(LOCALES[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(mag);
}

export function localTime(iso: string, lang: Lang, withDate = true, timeZone = TZ): string {
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }
    : { hour: '2-digit', minute: '2-digit', timeZone };
  return new Intl.DateTimeFormat(LOCALES[lang], opts).format(new Date(iso));
}

/** Heure UTC (rendu serveur) : « jeu. 12 nov., 14:03 UTC ». */
export function utcTime(iso: string, lang: Lang, withDate = true): string {
  return `${localTime(iso, lang, withDate, 'UTC')} UTC`;
}

/** « il y a 12 minutes » / « قبل 12 دقيقة » / « 12 minutes ago » */
export function relativeTime(iso: string, lang: Lang, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function depthText(q: Quake, t: T): string {
  const cls = q.depthClass ?? depthClass(q.depth);
  if (!cls || q.depth == null) return '';
  return t('quake.depth.km', { label: t(`quake.depth.${cls}`), km: Math.round(q.depth) });
}

// ---------------------------------------------------------------- liens

export function feltUrl(q: Quake): string | undefined {
  if (q.emscId) return `https://www.emsc-csem.org/Earthquake_information/earthquake_testimonies.php?id=${encodeURIComponent(q.emscId)}`;
  if (q.source === 'USGS' && q.url) return `${q.url}/tellus`;
  return undefined;
}

export function shareUrl(q: Quake, lang: Lang, t: T, pageUrl: string): string {
  const text = t('live.share.text', {
    mag: formatMag(q.mag, lang),
    place: quakePlace(q, lang, t),
    ago: relativeTime(q.time, lang),
    time: localTime(q.time, lang),
  });
  const link = `${pageUrl}?q=${encodeURIComponent(q.id)}`;
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${link}\n${shareHashtags(q, lang, t)}`)}`;
}

/** Mot-dièse à partir d'un nom : « Al Hoceima » → #AlHoceima ; « الدار البيضاء » → #الدار_البيضاء */
export function hashtag(name: string): string {
  const words = name.replace(/[’'‘\-.,()]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const arabic = /[؀-ۿ]/.test(name);
  return '#' + (arabic ? words.join('_') : words.map((w) => w[0].toUpperCase() + w.slice(1)).join(''));
}

/**
 * Mots-dièse du partage : thème (« séisme »), ville proche (≤ 100 km), pays si la ville est au Maroc, nom du site.
 * Ils rendent le message trouvable sur les réseaux sociaux (Facebook, X, Instagram, TikTok…).
 */
export function shareHashtags(q: Quake, lang: Lang, t: T): string {
  const tags = [t('live.share.tagQuake')];
  if (q.near && q.near.km <= 100) tags.push(hashtag(cityName(q.near, lang)));
  if (q.near?.cc === 'MA') tags.push(t('live.share.tagCountry'));
  tags.push('#SismoAtlas');
  return [...new Set(tags.filter(Boolean))].join(' ');
}

// ---------------------------------------------------------------- rendu HTML (serveur et navigateur)

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function magStyle(q: Quake): string {
  const n = magLevel(q.mag);
  return `--c:var(--mag-${n});--on:var(--mag-${n}-on)`;
}

const ICON_SHARE =
  '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
const ICON_HAND =
  '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/></svg>';

export function actionsHtml(q: Quake, lang: Lang, t: T, pageUrl: string): string {
  const felt = feltUrl(q);
  const parts: string[] = [];
  if (felt) parts.push(`<a class="btn btn--felt" href="${esc(felt)}" target="_blank" rel="noopener">${ICON_HAND}<span>${esc(t('live.felt'))}</span></a>`);
  parts.push(
    `<a class="btn btn--share" href="${esc(shareUrl(q, lang, t, pageUrl))}" target="_blank" rel="noopener">${ICON_SHARE}<span>${esc(t('live.share'))}</span></a>`,
  );
  if (q.url) parts.push(`<a class="btn btn--link" href="${esc(q.url)}" target="_blank" rel="noopener">${esc(t('live.source', { agency: q.agency || q.source || '' }))}</a>`);
  return `<div class="q-actions">${parts.join('')}</div>`;
}

/** `relative` = rendu navigateur (temps relatif + heure du Maroc) ; sinon rendu serveur (heure UTC). */
function timeHtml(q: Quake, lang: Lang, t: T, relative: boolean): string {
  const abs = relative ? `${localTime(q.time, lang)} (${t('quake.moroccoTime')})` : utcTime(q.time, lang);
  const rel = relative ? `<span data-rel="${esc(q.time)}">${esc(relativeTime(q.time, lang))}</span> · ` : '';
  return `${rel}<time datetime="${esc(q.time)}">${esc(abs)}</time>`;
}

/** Bandeau « le plus récent ». */
export function latestHtml(q: Quake, lang: Lang, t: T, pageUrl: string, relative = true): string {
  const depth = depthText(q, t);
  const hint = majorHint(q, lang, t);
  return `
  <article class="latest-card" style="${magStyle(q)}" data-id="${esc(q.id)}">
    <div class="latest-mag" aria-label="${esc(t('quake.mag', { mag: formatMag(q.mag, lang) }))}">
      <span class="latest-mag-value">${esc(formatMag(q.mag, lang))}</span>
      <span class="latest-mag-type">${esc(magTypeLabel(q.magType))}</span>
    </div>
    <div class="latest-body">
      <p class="latest-kicker">${esc(t('live.latest'))}</p>
      <h2 class="latest-place">${esc(quakePlace(q, lang, t))}</h2>
      ${hint ? `<p class="latest-hint">${esc(hint)}</p>` : ''}
      <p class="latest-meta">${timeHtml(q, lang, t, relative)}</p>
      <p class="latest-effect"><span class="dot" aria-hidden="true"></span>${esc(t(`scale.m${magLevel(q.mag)}.label`))}${
        depth ? ` · <span title="${esc(t('quake.depth.help'))}" class="has-help">${esc(depth)}</span>` : ''
      }</p>
      ${actionsHtml(q, lang, t, pageUrl)}
    </div>
  </article>`;
}

/** Élément de la liste (dépliable sans JavaScript grâce à <details>). */
export function itemHtml(q: Quake, lang: Lang, t: T, pageUrl: string, relative = true, isNew = false): string {
  const depth = depthText(q, t);
  return `
  <li class="q${isNew ? ' q--new' : ''}" style="${magStyle(q)}" data-id="${esc(q.id)}">
    <details>
      <summary>
        <span class="q-mag" aria-label="${esc(t('quake.mag', { mag: formatMag(q.mag, lang) }))}">${esc(formatMag(q.mag, lang))}</span>
        <span class="q-body">
          <span class="q-place">${esc(quakePlace(q, lang, t))}${isNew ? ` <span class="badge badge--new">${esc(t('live.new'))}</span>` : ''}</span>
          <span class="q-meta">${timeHtml(q, lang, t, relative)}</span>
        </span>
      </summary>
      <div class="q-details">
        <p>${esc(t(`scale.m${magLevel(q.mag)}.label`))}${depth ? ` · <span title="${esc(t('quake.depth.help'))}" class="has-help">${esc(depth)}</span>` : ''}${
          q.agency ? ` · ${esc(q.agency)}` : ''
        }</p>
        ${actionsHtml(q, lang, t, pageUrl)}
      </div>
    </details>
  </li>`;
}

/** Contenu de la bulle sur la carte. */
export function popupHtml(q: Quake, lang: Lang, t: T): string {
  const depth = depthText(q, t);
  return `<div class="map-popup" style="${magStyle(q)}">
    <p class="map-popup-title"><span class="q-mag q-mag--sm">${esc(formatMag(q.mag, lang))}</span> ${esc(quakePlace(q, lang, t))}</p>
    <p class="map-popup-meta"><span data-rel="${esc(q.time)}">${esc(relativeTime(q.time, lang))}</span> · ${esc(localTime(q.time, lang))}</p>
    ${depth ? `<p class="map-popup-meta">${esc(depth)}</p>` : ''}
  </div>`;
}

/** Traduction côté navigateur, à partir d'un dictionnaire transmis par la page. */
export function makeT(dict: Record<string, string>): T {
  return (key, vars) => {
    let s = dict[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Exécute `fn` une fois la page entièrement chargée (immédiatement si c'est déjà le cas). */
export function afterLoad(fn: () => void): void {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', () => fn(), { once: true });
}

/**
 * Type de magnitude dans sa graphie usuelle (les agences le publient souvent en minuscules) :
 * ml → ML, mw → Mw, mww → Mww, mb → mb, mblg → mbLg, ms → Ms, md → Md.
 */
export function magTypeLabel(type: string | null | undefined): string {
  const s = (type ?? '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'ml') return 'ML';
  if (low === 'mb') return 'mb';
  if (low === 'mblg' || low === 'mb_lg') return 'mbLg';
  if (/^m[a-z_]*$/.test(low)) return 'M' + low.slice(1); // mw, mwr, mww, ms, md, mi…
  return s;
}
