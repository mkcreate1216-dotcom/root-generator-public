import LZString from 'lz-string';
import type { AppState, Day, DayItem, MapType, Trip } from './types';
import { getRouteUrl } from './maps';
import { sanitizeTrip } from './storage';

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

  try {
    const shareUrl = createShareUrl(state);
    if (shareUrl) {
      lines.push('▼ Webでしおりを開く');
      lines.push(shareUrl);
    }
  } catch (err) {
    console.warn('Failed to append share URL to itinerary text:', err);
  }

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

export interface SharePayload {
  tripName: string;
  days: Day[];
  departure: string;
  departureMemo?: string;
  arrival: string;
  arrivalMemo?: string;
  autoArrival: boolean;
  mapType: MapType;
}

export function createShareUrl(state: AppState): string {
  const payload: SharePayload = {
    tripName: state.tripName || '',
    days: state.days,
    departure: state.departure || '',
    departureMemo: state.departureMemo || '',
    arrival: state.arrival || '',
    arrivalMemo: state.arrivalMemo || '',
    autoArrival: state.autoArrival,
    mapType: state.mapType,
  };
  const jsonStr = JSON.stringify(payload);
  const compressed = LZString.compressToEncodedURIComponent(jsonStr);
  const url = new URL(window.location.href);
  url.searchParams.set('data', compressed);
  url.hash = '';
  return url.toString();
}

export function extractDataFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const dataFromQuery = urlParams.get('data');
    if (dataFromQuery) return dataFromQuery;

    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      if (hash.startsWith('data=')) {
        return hash.slice(5);
      }
      const hashParams = new URLSearchParams(hash);
      const dataFromHash = hashParams.get('data');
      if (dataFromHash) return dataFromHash;
    }
  } catch (e) {
    console.warn('URL parsing error:', e);
  }
  return null;
}

export function parseShareUrlData(encodedData: string): Trip | null {
  try {
    if (!encodedData || typeof encodedData !== 'string') return null;
    let jsonStr = LZString.decompressFromEncodedURIComponent(encodedData);
    if (!jsonStr) {
      // フォールバック: 通常のBase64デコードを試みる
      try {
        jsonStr = decodeURIComponent(escape(atob(encodedData)));
      } catch {}
    }
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitizeTrip(parsed);
  } catch (err) {
    console.warn('Failed to parse share URL data:', err);
    return null;
  }
}

export async function copyShareUrl(triggerBtn: HTMLElement | null, state: AppState): Promise<void> {
  try {
    const url = createShareUrl(state);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('URLをコピーしました！');

    if (triggerBtn) {
      triggerBtn.classList.add('!text-emerald-600', '!border-emerald-600');
      setTimeout(() => {
        triggerBtn.classList.remove('!text-emerald-600', '!border-emerald-600');
      }, 1500);
    }
  } catch (err) {
    console.error('Failed to copy share URL:', err);
    showToast('URLのコピーに失敗しました');
  }
}


