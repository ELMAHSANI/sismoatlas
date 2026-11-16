/*
 * SismoAtlas — service worker (PWA).
 * Objectif unique : le guide de sécurité reste consultable sans internet (CLAUDE.md §5).
 * - À l'installation : met en cache le guide dans les 3 langues + ses feuilles de style, scripts et polices.
 * - Pages : réseau d'abord ; sans réseau, version en cache, sinon le guide dans la langue de l'URL.
 * - Fichiers /_astro/ (empreinte dans le nom, immuables) : cache d'abord.
 * - Données en direct (/data/…) et sites externes : jamais mis en cache ici (toujours à jour).
 */
const CACHE = 'sismoatlas-guide-v2';
const GUIDES = ['/fr/safety-guide/', '/ar/safety-guide/', '/en/safety-guide/'];
const USEFUL_FONT = /-(latin|latin-ext|arabic)-wght/;
const EXTRA = ['/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

/** Met en cache une page du guide et les fichiers /_astro/ qu'elle utilise (CSS → polices comprises). */
async function cacheGuide(cache, url, response) {
  const html = await response.clone().text();
  await cache.put(url, response);
  const assets = new Set(html.match(/\/_astro\/[^"'()\s>]+/g) || []);
  for (const css of [...assets].filter((a) => a.endsWith('.css'))) {
    try {
      const res = await fetch(css);
      if (!res.ok) continue;
      const text = await res.clone().text();
      await cache.put(css, res);
      // Polices : seulement les jeux de caractères utiles au guide (latin, arabe), pas le cyrillique, le grec…
      for (const m of text.match(/\/_astro\/[^"'()\s]+\.woff2/g) || []) if (USEFUL_FONT.test(m)) assets.add(m);
    } catch (e) {
      /* hors ligne pendant l'installation : réessayé à la prochaine visite */
    }
  }
  await Promise.all(
    [...assets].filter((a) => !a.endsWith('.css')).map((a) => cache.add(a).catch(() => {})),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(EXTRA.map((u) => cache.add(u).catch(() => {})));
      for (const url of GUIDES) {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok) await cacheGuide(cache, url, res);
        } catch (e) {
          /* ignoré */
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/data/')) return;

  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Garde le guide à jour (avec ses nouveaux fichiers) à chaque visite en ligne
          if (res.ok && GUIDES.includes(url.pathname)) {
            const cache = await caches.open(CACHE);
            event.waitUntil(cacheGuide(cache, url.pathname, res.clone()));
          }
          return res;
        } catch (e) {
          const cached = await caches.match(url.pathname);
          if (cached) return cached;
          const lang = ['fr', 'ar', 'en'].find((l) => url.pathname.startsWith(`/${l}/`)) || 'fr';
          return (await caches.match(`/${lang}/safety-guide/`)) || Response.error();
        }
      })(),
    );
  }
});
