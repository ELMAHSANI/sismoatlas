/**
 * Adresse des données en direct (public/data/live, public/data/world).
 *
 * Par défaut, le site lit la copie incluse dans le déploiement (/data/…), figée à la dernière construction.
 * En production, PUBLIC_LIVE_DATA_URL pointe vers l'hébergement mis à jour toutes les 15 minutes par
 * .github/workflows/data-live.yml (GitHub Pages, gratuit), ce qui évite de reconstruire le site à chaque mise à jour.
 * Si cette adresse ne répond pas, on se rabat sur la copie locale.
 */
const REMOTE = ((import.meta.env.PUBLIC_LIVE_DATA_URL as string | undefined) ?? '').replace(/\/+$/, '');

export async function fetchLiveData(path: string): Promise<Response> {
  const clean = path.replace(/^\/+/, '');
  if (REMOTE) {
    try {
      const res = await fetch(`${REMOTE}/${clean}`, { cache: 'no-cache' });
      if (res.ok) return res;
    } catch {
      /* hébergement distant indisponible : copie locale */
    }
  }
  return fetch(`/data/${clean}`, { cache: 'no-cache' });
}
