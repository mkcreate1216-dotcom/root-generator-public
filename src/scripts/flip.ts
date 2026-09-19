/**
 * FLIP (First, Last, Invert, Play) アニメーションをスポットの並び替えに適用
 */
export function animateSpotReorder(
  dayIndices: number | number[],
  mutateFn: () => void,
  renderFn: () => void
): void {
  const indices = Array.isArray(dayIndices) ? [...new Set(dayIndices)] : [dayIndices];
  const firstRects = new Map<string, DOMRect>();

  indices.forEach((idx) => {
    const section = document.getElementById(`day-section-${idx}`);
    if (section) {
      section.querySelectorAll<HTMLElement>('[data-spot-card="true"]').forEach((card) => {
        const val = card.dataset.spotValue;
        if (val) {
          firstRects.set(`${idx}-${val}`, card.getBoundingClientRect());
        }
      });
    }
  });

  mutateFn();
  renderFn();

  indices.forEach((idx) => {
    const newSection = document.getElementById(`day-section-${idx}`);
    if (!newSection) return;
    newSection.querySelectorAll<HTMLElement>('[data-spot-card="true"]').forEach((card) => {
      const val = card.dataset.spotValue;
      if (!val) return;
      const firstRect = firstRects.get(`${idx}-${val}`);
      if (!firstRect) return;
      const lastRect = card.getBoundingClientRect();
      const deltaY = firstRect.top - lastRect.top;
      if (!deltaY) return;

      card.style.transition = 'none';
      card.style.transform = `translateY(${deltaY}px)`;
      requestAnimationFrame(() => {
        card.style.transition = 'transform 300ms ease';
        card.style.transform = '';
      });
    });
  });
}

