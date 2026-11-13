/**
 * Données des fiches « séismes majeurs », produites par pipeline/build_events.py
 * dans public/data/events/<slug>.json. Lecture au moment de la construction du site.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Plane {
  strike: number;
  dip: number;
  rake: number;
}
export interface Mechanism {
  kind: 'moment-tensor' | 'focal-mechanism';
  source: string;
  method?: string | null;
  magnitude?: number | null;
  depth?: number | null;
  planes: Plane[];
}
export interface UsgsShock {
  /** Agence d'origine des paramètres : USGS par défaut, EMSC pour certains rapports du robot. */
  source?: 'USGS' | 'EMSC';
  id: string;
  usgsId: string;
  time: string;
  lat: number;
  lon: number;
  depth: number | null;
  mag: number | null;
  magType: string | null;
  place: string | null;
  alert: string | null;
  url: string;
  mechanisms: Mechanism[];
}
export interface PelaezShock {
  id: string;
  date: string;
  time: string | null;
  lat: number;
  lon: number;
  depth: number | null;
  mw: number;
  mwMethod?: string | null;
  imax: number | null;
  intensityScale: string | null;
  agency: string;
  location: string;
}
export interface Aftershocks {
  window: { days: number; radiusKm: number };
  sources: Record<string, number | string>;
  count: number;
  maxMag: number | null;
  perDay: number[];
  points: [number, number, number | null, number | null, number][];
}
export interface Shock {
  key: string;
  usgs?: UsgsShock;
  pelaez?: PelaezShock | null;
  aftershocks?: Aftershocks;
}
export interface EventData {
  slug: string;
  generated: string;
  shocks: Shock[];
}

const cache = new Map<string, EventData | null>();

export function loadEvent(slug: string): EventData | null {
  if (!cache.has(slug)) {
    try {
      const file = path.join(process.cwd(), 'public', 'data', 'events', `${slug}.json`);
      cache.set(slug, JSON.parse(fs.readFileSync(file, 'utf-8')));
    } catch {
      cache.set(slug, null);
    }
  }
  return cache.get(slug) ?? null;
}

export function getShock(slug: string, key?: string): Shock | undefined {
  const ev = loadEvent(slug);
  if (!ev) return undefined;
  return key ? ev.shocks.find((s) => s.key === key) : ev.shocks[0];
}
