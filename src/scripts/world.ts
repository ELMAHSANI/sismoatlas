/**
 * Section « Grands séismes dans le monde » côté navigateur :
 * onglets 7 j / 30 j / 1 an, temps relatif, heure du Maroc, carte du monde chargée en différé.
 */
import { afterLoad, localTime, makeT, relativeTime, type Lang, type T } from '../lib/quake';
import { fromWorldFeature, worldItemHtml, worldPopupHtml, type WorldQuake } from '../lib/world';
import type { QuakeMap } from './quake-map';
import { fetchLiveData } from '../lib/data-url';

type Tab = '7d' | '30d' | '1y';
const WINDOW_MS: Record<Tab, number> = { '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, '1y': 365 * 86_400_000 };

export function initWorld(): void {
  const found = document.querySelector<HTMLElement>('[data-world]');
  if (!found) return;
  const root: HTMLElement = found;
  const lang = root.dataset.lang as Lang;
  const t: T = makeT(JSON.parse(document.getElementById('world-i18n')?.textContent ?? '{}'));
  const reports: Record<string, string> = JSON.parse(document.getElementById('world-reports')?.textContent ?? '{}');
  const list = root.querySelector<HTMLOListElement>('#world-list')!;
  const count = root.querySelector<HTMLElement>('[data-world-count]')!;
  const updated = root.querySelector<HTMLElement>('[data-world-updated]');
  const mapEl = root.querySelector<HTMLElement>('#world-map')!;
  const mapBtn = root.querySelector<HTMLButtonElement>('[data-map-load]');
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];

  let quakes: WorldQuake[] = [];
  let tab: Tab = '7d';
  let selected: string | null = null;
  let map: QuakeMap | null = null;
  const byId = new Map<string, WorldQuake>();

  const current = () => {
    const since = Date.now() - WINDOW_MS[tab];
    return quakes.filter((q) => new Date(q.time).getTime() >= since);
  };

  function render(): void {
    const items = current();
    list.innerHTML = items.length
      ? items.map((q) => worldItemHtml(q, lang, t, true)).join('')
      : `<li class="placeholder">${t('world.list.empty')}</li>`;
    count.textContent = t('world.count', { n: items.length });
    if (selected) list.querySelector(`li[data-id="${CSS.escape(selected)}"]`)?.setAttribute('aria-current', 'true');
    map?.setData(
      items.map((q) => ({ id: q.id, lat: q.lat, lon: q.lon, mag: q.mag, alert: q.alert, tsunami: q.tsunami })),
      items[0]?.id,
    );
  }

  function select(id: string, fly: boolean): void {
    selected = id;
    list.querySelectorAll('li[aria-current]').forEach((li) => li.removeAttribute('aria-current'));
    const li = list.querySelector<HTMLLIElement>(`li[data-id="${CSS.escape(id)}"]`);
    li?.setAttribute('aria-current', 'true');
    if (!fly) li?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (fly) map?.select(id);
  }

  async function load(): Promise<void> {
    try {
      const res = await fetchLiveData('world/1y.geojson');
      if (!res.ok) return;
      const fc = await res.json();
      quakes = fc.features.map(fromWorldFeature).sort((a: WorldQuake, b: WorldQuake) => b.time.localeCompare(a.time));
      byId.clear();
      for (const q of quakes) {
        if (reports[q.id]) q.report = reports[q.id];
        byId.set(q.id, q);
      }
      if (fc.metadata?.generated && updated) updated.textContent = t('world.updated', { time: localTime(fc.metadata.generated, lang) });
      render();
    } catch {
      /* on garde le rendu serveur */
    }
  }

  async function loadMap(): Promise<void> {
    if (map || mapEl.dataset.loading) return;
    mapEl.dataset.loading = '1';
    if (mapBtn) {
      mapBtn.disabled = true;
      mapBtn.textContent = t('live.map.loading');
    }
    try {
      const { createQuakeMap, WORLD_BOUNDS } = await import('./quake-map');
      map = await createQuakeMap(mapEl, {
        lang,
        t,
        label: t('world.map.label'),
        bounds: WORLD_BOUNDS,
        colorMode: 'pager',
        maxZoom: 8,
        selectZoom: 4,
        popup: (id) => {
          const q = byId.get(id);
          return q ? worldPopupHtml(q, lang, t) : '';
        },
        onSelect: (id) => select(id, false),
      });
      mapBtn?.remove();
      render();
    } catch (err) {
      console.error('[SismoAtlas] carte du monde indisponible', err);
      delete mapEl.dataset.loading;
      if (mapBtn) {
        mapBtn.disabled = false;
        mapBtn.textContent = t('live.map.load');
      }
    }
  }

  // Carte : chargée après le chargement de la page, quand elle est visible (sur demande en mode économie de données)
  const conn = (navigator as any).connection;
  const saveData = conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '');
  mapBtn?.addEventListener('click', loadMap);
  if (!saveData && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
          idle(() => loadMap(), { timeout: 3000 });
        }
      },
      { threshold: 0.3 },
    );
    afterLoad(() => io.observe(mapEl));
  }

  tabs.forEach((btn) =>
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab as Tab;
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      render();
    }),
  );
  root.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const i = tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const forward = (ev.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
    const next = tabs[(i + (forward ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    next.click();
  });
  // Clic sur un séisme de la liste (hors liens) : centrer la carte
  list.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) return;
    const id = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]')?.dataset.id;
    if (id) select(id, true);
  });

  load();
  window.setInterval(() => {
    root.querySelectorAll<HTMLElement>('[data-rel]').forEach((el) => (el.textContent = relativeTime(el.dataset.rel!, lang)));
  }, 60_000);
}
