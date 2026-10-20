import LZString from 'lz-string';
import type { AppState, Day, DayItem, MapType, Trip } from './types';
import { getRouteUrl } from './maps';
import { sanitizeTrip } from './storage';

let currentToastEl: HTMLElement | null = null;
let toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, onAction?: () => void, actionText = '元に戻す'): void {
  if (currentToastEl) {
    currentToastEl.remove();
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
  }

  const toast = document.createElement('div');
  toast.className =
    'fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-2xl clay-btn-dark px-5 py-3 text-sm text-white transition-all select-none';

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (typeof onAction === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className =
      'shrink-0 font-bold text-sky-400 underline decoration-sky-400/60 underline-offset-2 transition hover:text-sky-300 cursor-pointer';
    actionBtn.textContent = actionText;
    actionBtn.addEventListener('click', () => {
      toast.remove();
      if (toastTimeoutId) clearTimeout(toastTimeoutId);
      onAction();
    });
    toast.appendChild(actionBtn);
  }

  document.body.appendChild(toast);
  currentToastEl = toast;
  toastTimeoutId = setTimeout(
    () => {
      toast.remove();
      if (currentToastEl === toast) currentToastEl = null;
    },
    onAction ? 6000 : 2500
  );
}

export function getDayItems(day: Day, dayIndex: number, state: AppState): DayItem[] {
  const isFirstDay = dayIndex === 0;
  const isLastDay = dayIndex === state.days.length - 1;
  const departure = isFirstDay ? state.departure.trim() : '';
  const departureMemo = isFirstDay ? (state.departureMemo || '').trim() : '';
  const showDeparture = isFirstDay && Boolean(departure || state.hasDeparture);
  const arrival = isLastDay ? state.arrival.trim() : '';
  const arrivalMemo = isLastDay ? (state.arrivalMemo || '').trim() : '';
  const showArrival = isLastDay && Boolean(arrival || state.hasArrival);
  const accommodation = day.accommodation.trim();
  const accommodationMemo = (day.accommodationMemo || '').trim();
  const showAccommodation = Boolean(accommodation || day.hasAccommodation);
  const items: DayItem[] = [];

  if (showDeparture) {
    items.push({ type: 'endpoint', value: departure, memo: departureMemo, label: '出発地点' });
  }
  day.spots.forEach((spot, index) => {
    const spotName = typeof spot === 'string' ? spot : spot.name;
    const spotMemo = typeof spot === 'string' ? '' : spot.memo || '';
    items.push({ type: 'spot', value: spotName, memo: spotMemo, spotIndex: index });
  });
  if (showAccommodation) {
    items.push({ type: 'accommodation', value: accommodation, memo: accommodationMemo });
  }
  if (showArrival) {
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
    const shareUrl =
      state.shareId && typeof window !== 'undefined'
        ? `${window.location.origin}/p/${state.shareId}`
        : createShareUrl(state);
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
    showToast('旅程テキストをコピーしました！');

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

function sanitizeFileName(rawTitle: string): string {
  const trimmed = (rawTitle || '').trim() || 'たびろーむ旅程';
  return trimmed.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

/**
 * 旅程をテキストファイル（.txt）としてダウンロード保存
 */
export function downloadItineraryText(state: AppState): void {
  try {
    const text = generateItineraryText(state);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(state.tripName)}_旅程.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('テキストファイルを保存しました！');
  } catch (err) {
    console.error('Failed to download itinerary text:', err);
    showToast('テキストの保存に失敗しました');
  }
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const result: string[] = [];
  const paragraphs = (text || '').split('\n');
  for (const para of paragraphs) {
    if (!para) {
      result.push('');
      continue;
    }
    let line = '';
    for (const ch of para) {
      const testLine = line + ch;
      if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
        result.push(line);
        line = ch;
      } else {
        line = testLine;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * 旅程をしおり画像（.png）として生成・ダウンロード保存
 */
export async function downloadItineraryImage(state: AppState): Promise<void> {
  try {
    const scale = 2;
    const width = 720;
    const outerPad = 32;
    const cardPad = 28;
    const contentWidth = width - (outerPad + cardPad) * 2;

    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) throw new Error('Canvas 2D context unavailable');

    const fontStack = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
    const title = state.tripName.trim() || '無題の旅程';

    mCtx.font = `bold 26px ${fontStack}`;
    const titleLines = wrapCanvasText(mCtx, title, contentWidth);

    interface RenderedItem {
      badge: string;
      badgeBg: string;
      badgeColor: string;
      nameLines: string[];
      memoLines: string[];
      cardHeight: number;
    }

    interface RenderedDay {
      dayName: string;
      items: RenderedItem[];
      sectionHeight: number;
    }

    const renderedDays: RenderedDay[] = [];

    state.days.forEach((day, dayIndex) => {
      const rawItems = getDayItems(day, dayIndex, state);
      const renderedItems: RenderedItem[] = [];
      let spotCounter = 0;

      rawItems.forEach((item) => {
        let badge = '';
        let badgeBg = '#e2e8f0';
        let badgeColor = '#334155';

        if (item.type === 'endpoint') {
          badge = item.label;
          badgeBg = '#0f172a';
          badgeColor = '#ffffff';
        } else if (item.type === 'accommodation') {
          badge = '宿泊地';
          badgeBg = '#fef3c7';
          badgeColor = '#92400e';
        } else {
          spotCounter++;
          badge = `スポット ${spotCounter}`;
          badgeBg = '#f1f5f9';
          badgeColor = '#475569';
        }

        mCtx.font = `bold 17px ${fontStack}`;
        const nameLines = wrapCanvasText(mCtx, item.value || '(名称未設定)', contentWidth - 36);

        let memoLines: string[] = [];
        if (item.memo && item.memo.trim()) {
          mCtx.font = `13px ${fontStack}`;
          memoLines = wrapCanvasText(mCtx, item.memo.trim(), contentWidth - 36);
        }

        const cardHeight =
          16 + // 上パディング
          22 + // バッジ行
          6 +
          nameLines.length * 24 +
          (memoLines.length > 0 ? 8 + memoLines.length * 19 : 0) +
          16; // 下パディング

        renderedItems.push({
          badge,
          badgeBg,
          badgeColor,
          nameLines,
          memoLines,
          cardHeight,
        });
      });

      const itemsHeight =
        renderedItems.length === 0
          ? 52
          : renderedItems.reduce((sum, it, idx) => sum + it.cardHeight + (idx < renderedItems.length - 1 ? 22 : 0), 0);

      const sectionHeight = 40 + itemsHeight + 24;
      renderedDays.push({
        dayName: day.name || `Day ${dayIndex + 1}`,
        items: renderedItems,
        sectionHeight,
      });
    });

    const headerHeight = 40 + titleLines.length * 34 + 28;
    const bodyHeight = renderedDays.reduce((sum, d) => sum + d.sectionHeight, 0);
    const footerHeight = 44;
    const totalHeight = outerPad * 2 + cardPad * 2 + headerHeight + bodyHeight + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.scale(scale, scale);

    // 背景
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, totalHeight);

    // 外枠カード
    const cardX = outerPad;
    const cardY = outerPad;
    const cardW = width - outerPad * 2;
    const cardH = totalHeight - outerPad * 2;
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    let cursorY = cardY + cardPad;
    const leftX = cardX + cardPad;

    // ブランドピル & 日数バッジ
    ctx.fillStyle = '#0f172a';
    drawRoundedRect(ctx, leftX, cursorY, 116, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 12px ${fontStack}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('たびろーむ しおり', leftX + 12, cursorY + 13);

    const dateStr = new Date().toLocaleDateString('ja-JP');
    ctx.fillStyle = '#64748b';
    ctx.font = `12px ${fontStack}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${state.days.length}日間 • ${dateStr} 出力`, leftX + contentWidth, cursorY + 13);
    ctx.textAlign = 'left';

    cursorY += 38;

    // タイトル
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 26px ${fontStack}`;
    ctx.textBaseline = 'top';
    for (const line of titleLines) {
      ctx.fillText(line, leftX, cursorY);
      cursorY += 34;
    }

    cursorY += 12;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, cursorY);
    ctx.lineTo(leftX + contentWidth, cursorY);
    ctx.stroke();
    cursorY += 16;

    // 各日程
    for (const day of renderedDays) {
      // Day見出し
      ctx.fillStyle = '#1e293b';
      drawRoundedRect(ctx, leftX, cursorY, 78, 28, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 14px ${fontStack}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(day.dayName, leftX + 39, cursorY + 14);
      ctx.textAlign = 'left';

      cursorY += 40;

      if (day.items.length === 0) {
        ctx.fillStyle = '#f8fafc';
        drawRoundedRect(ctx, leftX, cursorY, contentWidth, 44, 14);
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = `13px ${fontStack}`;
        ctx.textBaseline = 'middle';
        ctx.fillText('スポット未登録', leftX + 18, cursorY + 22);
        cursorY += 52;
      } else {
        day.items.forEach((item, idx) => {
          ctx.fillStyle = item.badge === '宿泊地' ? '#fffbeb' : '#f8fafc';
          drawRoundedRect(ctx, leftX, cursorY, contentWidth, item.cardHeight, 16);
          ctx.fill();
          ctx.strokeStyle = item.badge === '宿泊地' ? '#fde68a' : '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.stroke();

          let innerY = cursorY + 14;
          const innerX = leftX + 18;

          // バッジ
          ctx.font = `bold 11px ${fontStack}`;
          const badgeWidth = Math.ceil(ctx.measureText(item.badge).width) + 16;
          ctx.fillStyle = item.badgeBg;
          drawRoundedRect(ctx, innerX, innerY, badgeWidth, 20, 6);
          ctx.fill();
          ctx.fillStyle = item.badgeColor;
          ctx.textBaseline = 'middle';
          ctx.fillText(item.badge, innerX + 8, innerY + 10);

          innerY += 28;

          // スポット名
          ctx.fillStyle = '#0f172a';
          ctx.font = `bold 17px ${fontStack}`;
          ctx.textBaseline = 'top';
          for (const nLine of item.nameLines) {
            ctx.fillText(nLine, innerX, innerY);
            innerY += 24;
          }

          // メモ
          if (item.memoLines.length > 0) {
            innerY += 6;
            ctx.fillStyle = '#475569';
            ctx.font = `13px ${fontStack}`;
            for (const mLine of item.memoLines) {
              ctx.fillText(mLine, innerX, innerY);
              innerY += 19;
            }
          }

          cursorY += item.cardHeight;

          // 矢印コネクタ
          if (idx < day.items.length - 1) {
            const centerX = leftX + 32;
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX, cursorY + 3);
            ctx.lineTo(centerX, cursorY + 19);
            ctx.stroke();
            cursorY += 22;
          }
        });
      }

      cursorY += 24;
    }

    // フッター
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, cursorY);
    ctx.lineTo(leftX + contentWidth, cursorY);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = `12px ${fontStack}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('たびろーむ (TabiRome) - 道草を楽しむ、気ままな旅へ。', leftX, cursorY + 24);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to create PNG blob');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(state.tripName)}_旅程.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('しおり画像を保存しました！');
  } catch (err) {
    console.error('Failed to generate itinerary image:', err);
    showToast('画像の保存に失敗しました');
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


