/**
 * Section « Séismes au Maroc » côté navigateur.
 * - charge public/data/live/30d.geojson (fichiers régénérés toutes les 15 min) ;
 * - onglets En direct / 24 h / 7 jours / 30 jours, filtre magnitude ≥ 2,5 / tout ;
 * - temps relatif mis à jour toutes les 30 s ;
 * - direct : WebSocket EMSC, reconnexion progressive, repli sur les fichiers GeoJSON toutes les 5 min ;
 * - carte MapLibre chargée seulement quand elle approche de l'écran (ou au clic en mode économie de données).
 */
import {
  DEFAULT_MIN_MAG, EXCLUDE_CANARIES, NEAR_MAJOR_MIN_POP, NEAR_MIN_POP, depthClass, formatMag, fromFeature, inCanaries,
  itemHtml, latestHtml, localTime, makeT, popupHtml, nearestCity, relativeTime, type City, type Lang, type Quake, type T,
} from '../lib/quake';
import type { QuakeMap } from './quake-map';
import { fetchLiveData } from '../lib/data-url';

type Tab = 'live' | '24h' | '7d' | '30d';
const WINDOW_MS: Record<Exclude<Tab, 'live'>, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };
const BBOX = { minLat: 20, maxLat: 38, minLon: -18, maxLon: 1 };
const WS_URL = 'wss://www.seismicportal.eu/standing_order/websocket';
const POLL_MS = 5 * 60_000;

export function initLive(): void {
  const found = document.querySelector<HTMLElement>('[data-live]');
  if (!found) return;
  const root: HTMLElement = found;
  const lang = root.dataset.lang as Lang;
  const pageUrl = root.dataset.pageUrl ?? location.href;
  const minMag = Number(root.dataset.minMag ?? DEFAULT_MIN_MAG);
  const liveCount = Number(root.dataset.liveCount ?? 20);
  const t: T = makeT(JSON.parse(document.getElementById('live-i18n')?.textContent ?? '{}'));

  const els = {
    latest: root.querySelector<HTMLElement>('#live-latest')!,
    list: root.querySelector<HTMLOListElement>('#live-list')!,
    hint: root.querySelector<HTMLElement>('[data-list-hint]')!,
    empty: root.querySelector<HTMLElement>('[data-empty]'),
    status: root.querySelector<HTMLElement>('[data-status]')!,
    statusText: root.querySelector<HTMLElement>('[data-status-text]')!,
    toggle: root.querySelector<HTMLButtonElement>('[data-toggle-all]')!,
    tabs: [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')],
    mapEl: root.querySelector<HTMLElement>('#live-map')!,
    mapBtn: root.querySelector<HTMLButtonElement>('[data-map-load]'),
    updated: root.querySelector<HTMLElement>('[data-updated]'),
    stat: (k: string) => root.querySelector<HTMLElement>(`[data-stat="${k}"]`)!,
  };

  const state = {
    quakes: new Map<string, Quake>(),
    tab: 'live' as Tab,
    showAll: false,
    newIds: new Set<string>(),
    selected: new URLSearchParams(location.search).get('q'),
  };
  let map: QuakeMap | null = null;
  let cities: City[] | null = null;
  let scrollPending = !!state.selected;

  // ------------------------------------------------------------ sélection des séismes à afficher
  const keep = (q: Quake) => !(EXCLUDE_CANARIES && q.canaries) && (state.showAll || (q.mag != null && q.mag >= minMag));

  function current(): Quake[] {
    const all = [...state.quakes.values()].filter(keep).sort((a, b) => b.time.localeCompare(a.time));
    if (state.tab === 'live') return all.slice(0, liveCount);
    const since = Date.now() - WINDOW_MS[state.tab];
    return all.filter((q) => new Date(q.time).getTime() >= since);
  }

  // ------------------------------------------------------------ rendu
  function render(): void {
    const items = current();
    const all = [...state.quakes.values()].filter(keep).sort((a, b) => b.time.localeCompare(a.time));
    const latest = all[0];
    els.latest.innerHTML = latest ? latestHtml(latest, lang, t, pageUrl) : `<p class="placeholder">${t('live.unavailable')}</p>`;
    els.list.innerHTML = items.map((q) => itemHtml(q, lang, t, pageUrl, true, state.newIds.has(q.id))).join('');

    const minLabel = formatMag(minMag, lang);
    if (els.empty) els.empty.hidden = items.length > 0;
    if (!items.length) {
      els.list.innerHTML = `<li class="placeholder">${t(state.showAll ? 'live.list.emptyAll' : 'live.list.empty', { min: minLabel })}</li>`;
    }
    els.hint.textContent = state.tab === 'live' ? t('live.list.liveHint', { n: liveCount }) : '';
    els.hint.hidden = state.tab !== 'live';

    // Chiffres clés : fenêtre de l'onglet (24 h pour « En direct »)
    const statTab = state.tab === 'live' ? '24h' : state.tab;
    const since = Date.now() - WINDOW_MS[statTab];
    const win = all.filter((q) => new Date(q.time).getTime() >= since);
    const max = win.reduce<Quake | undefined>((m, q) => (!m || (q.mag ?? -9) > (m.mag ?? -9) ? q : m), undefined);
    els.stat('count').textContent = String(win.length);
    els.stat('countHint').textContent =
      `${t(`home.live.tab.${statTab}`)} · ` + (state.showAll ? t('live.stats.countHintAll') : t('live.stats.countHint', { min: minLabel }));
    els.stat('max').textContent = max ? formatMag(max.mag, lang) : '—';
    els.stat('maxHint').textContent = max ? localTime(max.time, lang) : '';
    els.stat('last').textContent = latest ? relativeTime(latest.time, lang) : '—';
    els.stat('lastHint').textContent = latest ? localTime(latest.time, lang) : '';

    map?.setData(items, latest?.id);
    // Garde ouvert le séisme sélectionné (on ne fait défiler la liste qu'à la première fois : lien partagé ?q=…)
    if (state.selected && state.quakes.has(state.selected)) {
      openItem(state.selected, false, scrollPending);
      scrollPending = false;
    }
  }

  function tick(): void {
    root.querySelectorAll<HTMLElement>('[data-rel]').forEach((el) => {
      el.textContent = relativeTime(el.dataset.rel!, lang);
    });
    const latest = [...state.quakes.values()].filter(keep).sort((a, b) => b.time.localeCompare(a.time))[0];
    if (latest) els.stat('last').textContent = relativeTime(latest.time, lang);
  }

  function openItem(id: string, fly = true, scroll = true): void {
    const li = els.list.querySelector<HTMLLIElement>(`li[data-id="${CSS.escape(id)}"]`);
    const details = li?.querySelector('details');
    if (details && !details.open) details.open = true;
    if (scroll) li?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (fly) map?.select(id);
  }

  // ------------------------------------------------------------ données
  function upsert(q: Quake): void {
    state.quakes.set(q.id, q);
  }

  async function loadFile(name: '30d' | '24h'): Promise<boolean> {
    try {
      const res = await fetchLiveData(`live/${name}.geojson`);
      if (!res.ok) return false;
      const fc = await res.json();
      for (const f of fc.features) upsert(fromFeature(f));
      // Retire les séismes sortis de la fenêtre de 30 jours
      const limit = Date.now() - WINDOW_MS['30d'];
      for (const [id, q] of state.quakes) if (new Date(q.time).getTime() < limit) state.quakes.delete(id);
      if (fc.metadata?.generated && els.updated) {
        els.updated.textContent = ` ${t('live.updated', { time: localTime(fc.metadata.generated, lang) })}.`;
      }
      return true;
    } catch {
      return false;
    }
  }

  async function getCities(): Promise<City[]> {
    if (!cities) {
      const res = await fetch('/data/cities.json');
      cities = (await res.json()).cities as City[];
    }
    return cities;
  }

  // ------------------------------------------------------------ direct EMSC
  let ws: WebSocket | null = null;
  let retries = 0;
  let pollTimer: number | undefined;

  function setStatus(s: 'connecting' | 'live' | 'offline'): void {
    els.status.dataset.status = s;
    els.statusText.textContent = t(`live.status.${s}`);
  }

  function startPolling(): void {
    if (pollTimer) return;
    pollTimer = window.setInterval(async () => {
      if (await loadFile('24h')) render();
    }, POLL_MS);
  }

  function stopPolling(): void {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }

  async function onMessage(ev: MessageEvent): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const p = msg?.data?.properties;
    if (!p || (msg.action !== 'create' && msg.action !== 'update')) return;
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!(lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon)) return;
    if (p.evtype && !['ke', 'se'].includes(p.evtype)) return;
    const list = await getCities().catch(() => [] as City[]);
    const depth = typeof p.depth === 'number' ? p.depth : null;
    const id = `emsc:${p.unid ?? msg.data.id}`;
    const q: Quake = {
      id,
      time: new Date(p.time).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      lat,
      lon,
      mag: typeof p.mag === 'number' ? p.mag : null,
      magType: p.magtype,
      depth,
      depthClass: depthClass(depth),
      agency: p.auth,
      source: 'EMSC',
      region: p.flynn_region,
      url: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(p.unid ?? msg.data.id)}`,
      emscId: p.source_id ? String(p.source_id) : undefined,
      near: nearestCity(list, lat, lon, NEAR_MIN_POP),
      nearMajor: nearestCity(list, lat, lon, NEAR_MAJOR_MIN_POP),
      canaries: inCanaries(lat, lon),
    };
    if (msg.action === 'create' && !state.quakes.has(id)) state.newIds.add(id);
    upsert(q);
    render();
  }

  function connect(): void {
    if (!('WebSocket' in window)) {
      setStatus('offline');
      startPolling();
      return;
    }
    setStatus('connecting');
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      retries = 0;
      setStatus('live');
      stopPolling();
    };
    ws.onmessage = onMessage;
    ws.onclose = () => scheduleReconnect();
    ws.onerror = () => ws?.close();
  }

  function scheduleReconnect(): void {
    ws = null;
    retries += 1;
    if (retries >= 3) {
      setStatus('offline');
      startPolling();
    }
    const delay = Math.min(60_000, 2_000 * 2 ** Math.min(retries, 5));
    window.setTimeout(connect, delay);
  }

  // ------------------------------------------------------------ carte (chargement différé)
  async function loadMap(): Promise<void> {
    if (map || els.mapEl.dataset.loading) return;
    els.mapEl.dataset.loading = '1';
    if (els.mapBtn) {
      els.mapBtn.disabled = true;
      els.mapBtn.textContent = t('live.map.loading');
    }
    try {
      const { createQuakeMap, MOROCCO_BOUNDS } = await import('./quake-map');
      map = await createQuakeMap(els.mapEl, {
        lang,
        t,
        label: t('live.map.label'),
        bounds: MOROCCO_BOUNDS,
        colorMode: 'mag',
        popup: (id) => {
          const q = state.quakes.get(id);
          return q ? popupHtml(q, lang, t) : '';
        },
        onSelect: (id) => openItem(id, false),
      });
      els.mapBtn?.remove();
      const items = current();
      map.setData(items, [...state.quakes.values()].filter(keep).sort((a, b) => b.time.localeCompare(a.time))[0]?.id);
      if (state.selected) map.select(state.selected);
    } catch (err) {
      console.error('[SismoAtlas] carte indisponible', err);
      delete els.mapEl.dataset.loading;
      if (els.mapBtn) {
        els.mapBtn.disabled = false;
        els.mapBtn.textContent = t('live.map.load');
      }
    }
  }

  function setupMapLoading(): void {
    const conn = (navigator as any).connection;
    const saveData = conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '');
    els.mapBtn?.addEventListener('click', loadMap);
    if (saveData || !('IntersectionObserver' in window)) return; // l'utilisateur choisit d'afficher la carte
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
          idle(() => loadMap());
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(els.mapEl);
  }

  // ------------------------------------------------------------ interactions
  els.tabs.forEach((btn) =>
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab as Tab;
      els.tabs.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      render();
    }),
  );
  // Flèches gauche/droite entre les onglets (inversées en arabe)
  root.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const i = els.tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const forward = (ev.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
    const next = els.tabs[(i + (forward ? 1 : -1) + els.tabs.length) % els.tabs.length];
    next.focus();
    next.click();
  });
  els.toggle.addEventListener('click', () => {
    state.showAll = !state.showAll;
    els.toggle.setAttribute('aria-pressed', String(state.showAll));
    els.toggle.textContent = state.showAll ? t('live.filter.showMin', { min: formatMag(minMag, lang) }) : t('live.filter.showAll');
    render();
  });
  els.list.addEventListener(
    'toggle',
    (e) => {
      const details = e.target as HTMLDetailsElement;
      const id = details.closest<HTMLElement>('li[data-id]')?.dataset.id;
      if (details.open && id) {
        state.selected = id;
        map?.select(id);
      }
    },
    true,
  );

  // ------------------------------------------------------------ démarrage
  setupMapLoading();
  loadFile('30d').then((ok) => {
    if (ok) render();
    else setStatus('offline');
    connect();
  });
  window.setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}
