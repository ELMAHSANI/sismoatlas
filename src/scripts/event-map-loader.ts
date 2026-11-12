/**
 * Déclencheur léger des cartes de fiches : la bibliothèque de carte (≈ 1 Mo) n'est importée
 * que lorsqu'une carte approche de l'écran.
 */
export function initEventMaps(): void {
  const els = [...document.querySelectorAll<HTMLElement>('[data-event-map]')];
  if (!els.length) return;
  const load = (el: HTMLElement) =>
    import('./event-map')
      .then(({ renderEventMap }) => renderEventMap(el))
      .catch((err) => console.error('[SismoAtlas] carte de la fiche indisponible', err));
  if (!('IntersectionObserver' in window)) {
    els.forEach(load);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        load(e.target as HTMLElement);
      }
    },
    { rootMargin: '300px' },
  );
  els.forEach((el) => io.observe(el));
}
