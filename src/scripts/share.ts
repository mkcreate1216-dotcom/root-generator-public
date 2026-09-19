import type { AppState, Day, DayItem, MapType } from './types';
import { getRouteUrl } from './maps';

let currentToastEl: HTMLElement | null = null;
let toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, onUndo?: () => void): void {
  if (currentToastEl) {
    currentToastEl.remove();
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
  }

  const toast = document.createElement('div');
  toast.className =
    'fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl backdrop-blur-sm transition-all';

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (typeof onUndo === 'function') {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className =
      'shrink-0 font-bold text-sky-400 underline decoration-sky-400/60 underline-offset-2 transition hover:text-sky-300';
    undoBtn.textContent = '元に戻す';
    undoBtn.addEventListener('click', () => {
      toast.remove();
      if (toastTimeoutId) clearTimeout(toastTimeoutId);
      onUndo();
    });
    toast.appendChild(undoBtn);
  }

  document.body.appendChild(toast);
  currentToastEl = toast;
  toastTimeoutId = setTimeout(
    () => {
      toast.remove();
      if (currentToastEl === toast) currentToastEl = null;
    },
    onUndo ? 6000 : 2500
  );
}

export function getDayItems(day: Day, dayIndex: number, state: AppState): DayItem[] {
  const isFirstDay = dayIndex === 0;
  const isLastDay = dayIndex === state.days.length - 1;
  const departure = isFirstDay ? state.departure.trim() : '';
  const departureMemo = isFirstDay ? (state.departureMemo || '').trim() : '';
  const arrival = isLastDay ? state.arrival.trim() : '';
  const arrivalMemo = isLastDay ? (state.arrivalMemo || '').trim() : '';
  const accommodation = day.accommodation.trim();
  const accommodationMemo = (day.accommodationMemo || '').trim();
  const items: DayItem[] = [];

  if (departure) {
    items.push({ type: 'endpoint', value: departure, memo: departureMemo, label: '出発地点' });
  }
  day.spots.forEach((spot, index) => {
    const spotName = typeof spot === 'string' ? spot : spot.name;
    const spotMemo = typeof spot === 'string' ? '' : spot.memo || '';
    items.push({ type: 'spot', value: spotName, memo: spotMemo, spotIndex: index });
  });
  if (accommodation && !isLastDay) {
    items.push({ type: 'accommodation', value: accommodation, memo: accommodationMemo });
  }
  if (arrival) {
    items.push({ type: 'endpoint', value: arrival, memo: arrivalMemo, label: '到着地点' });
  }
  return items;
}

export function generateItineraryText(state: AppState): string {
  const title = state.tripName.trim() ? state.tripName.trim() : '旅行';
  const lines = [`【${title}】`, ''];
  state.days.forEach((day, dayIndex) => {
    const items = getDayItems(day, dayIndex, state);
    lines.push(`■ ${day.name}`);
    items.forEach((item, index) => {
      if (item.type === 'accommodation') {
        lines.push(`[宿泊地: ${item.value}]`);
      } else {
        const suffix = item.type === 'endpoint' ? (item.label === '出発地点' ? ' (出発)' : ' (到着)') : '';
        lines.push(`・${item.value}${suffix}`);
      }
      if (item.memo && item.memo.trim()) {
        const memoLines = item.memo.trim().split('\n');
        memoLines.forEach((mLine) => {
          lines.push(`  ${mLine.trim()}`);
        });
      }
      const nextItem = items[index + 1];
      if (nextItem) {
        const from = (item.value || '').trim();
        const to = (nextItem.value || '').trim();
        let routeUrl = '';
        if (from && to) {
          routeUrl = getRouteUrl(from, to, state.mapType);
        }
        lines.push(routeUrl ? ` ↓ (ルート: ${routeUrl})` : ' ↓');
      }
    });
    lines.push('');
  });

  return lines.join('\n').trim();
}

export async function copyShareItinerary(triggerBtn: HTMLElement | null, state: AppState): Promise<void> {
  const text = generateItineraryText(state);
  try {
    await navigator.clipboard.writeText(text);
    showToast('コピーしました！');

    if (triggerBtn) {
      const originalHtml = triggerBtn.innerHTML;
      triggerBtn.innerHTML = '<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 inline" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      setTimeout(() => {
        triggerBtn.innerHTML = originalHtml;
      }, 1500);
    }
  } catch {
    showToast('コピーに失敗しました');
  }
}

