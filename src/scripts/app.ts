import {
  createIcons,
  Map as MapIcon,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Check,
  ArrowUp,
  ArrowDown,
  Route,
  ExternalLink,
  Share2,
  Pencil,
  Clock,
  FileText,
  MapPin,
  CloudUpload,
  RefreshCw,
  Save,
} from 'lucide';
import type { AppState, Day, MapType } from './types';
import {
  TripStore,
  MAP_TYPE_STORAGE_KEY,
  MAX_TRIPS,
  createDay,
  createTripEntry,
  getStoredMapType,
} from './storage';
import { getDayRouteUrl, openRoute } from './maps';
import { copyShareItinerary, extractDataFromUrl, parseShareUrlData, getDayItems, showToast } from './share';
import { animateSpotReorder } from './flip';
import { collabManager } from './collab';

function refreshIcons(_root?: HTMLElement): void {
  createIcons({
    icons: {
      Map: MapIcon,
      ChevronDown,
      ChevronUp,
      Plus,
      X,
      Check,
      ArrowUp,
      ArrowDown,
      Route,
      ExternalLink,
      Share2,
      Pencil,
      Clock,
      FileText,
      MapPin,
      CloudUpload,
      RefreshCw,
      Save,
    },
  });
}

// アプリケーション状態
const state: AppState = {
  days: [],
  activeDayIndex: 0,
  mapType: getStoredMapType(),
  openRouteMenuIndex: null,
  accommodationUpdateScope: 'all',
  departure: '',
  departureMemo: '',
  arrival: '',
  arrivalMemo: '',
  autoArrival: true,
  tripName: '',
  addLocationType: 'spot',
  addAccommodationScope: 'all',
};

const tripStore = new TripStore();
const collapsedDays = new Set<number>();
let draggedSpot: { dayIndex: number; index: number } | null = null;
let isScrollingToTab = false;
let scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isTripMenuOpen = false;
let accommodationDebounceId: ReturnType<typeof setTimeout> | null = null;
let pendingAccommodationSync: { dayIndex: number; value: string } | null = null;
let isTripConfirmed = false;
let isTransitioningToApp = false;
const dayUndoStack: Array<{ index: number; day: Day }> = [];

// DOM要素参照
const dayTabsEl = document.getElementById('day-tabs') as HTMLDivElement;
const timelineEl = document.getElementById('timeline') as HTMLDivElement;
const tripNameInputEl = document.getElementById('trip-name-input') as HTMLInputElement | null;
const tripComboboxContainerEl = document.getElementById('trip-combobox-container');
const tripComboboxToggleEl = document.getElementById('trip-combobox-toggle');
const tripComboboxMenuEl = document.getElementById('trip-combobox-menu') as HTMLUListElement | null;
const tripConfirmContainerEl = document.getElementById('trip-confirm-container') as HTMLDivElement | null;
const tripConfirmBtnEl = document.getElementById('trip-confirm-btn') as HTMLButtonElement | null;
const tripSwitcherEl = document.getElementById('trip-switcher') as HTMLSelectElement | null;
const tripNewBtnEl = document.getElementById('trip-new-btn');
const tripDeleteBtnEl = document.getElementById('trip-delete-btn') as HTMLButtonElement | null;
const newSpotInputEl = document.getElementById('new-spot-input') as HTMLInputElement;
const addSpotFormEl = document.getElementById('add-spot-form') as HTMLFormElement;
const addTypeDepartureEl = document.getElementById('add-type-departure') as HTMLInputElement | null;
const addTypeAccommodationEl = document.getElementById('add-type-accommodation') as HTMLInputElement | null;
const addTypeNoteEl = document.getElementById('add-type-note') as HTMLSpanElement | null;
const addTypeDefaultHintEl = document.getElementById('add-type-default-hint') as HTMLSpanElement | null;
const addAccommodationScopeEl = document.getElementById('add-accommodation-scope') as HTMLDivElement;
const addAccommodationScopeAllEl = document.getElementById('add-accommodation-scope-all') as HTMLButtonElement;
const addAccommodationScopeTodayEl = document.getElementById('add-accommodation-scope-today') as HTMLButtonElement;
const itinerarySectionEl = document.getElementById('itinerary-section') as HTMLDivElement | null;
const headerMapSelectorEl = document.getElementById('header-map-selector-container') as HTMLDivElement | null;
const mainCardEl = document.getElementById('main-card') as HTMLDivElement | null;
const appHeaderContainerEl = document.getElementById('app-header-container') as HTMLDivElement | null;
const lpHeroSectionEl = document.getElementById('lp-hero-section') as HTMLDivElement | null;
const lpFeaturesSectionEl = document.getElementById('lp-features-section') as HTMLDivElement | null;
const lpSamplesSectionEl = document.getElementById('lp-samples-section') as HTMLDivElement | null;
const lpSlotWrapperEl = document.getElementById('lp-slot-wrapper') as HTMLDivElement | null;
const endpointSectionEl = document.getElementById('endpoint-section') as HTMLDivElement;
const departureFieldEl = document.getElementById('departure-field') as HTMLDivElement;
const departureInputEl = document.getElementById('departure-input') as HTMLInputElement;
const accommodationSectionEl = document.getElementById('accommodation-section') as HTMLDivElement;
const accommodationInputEl = document.getElementById('accommodation-input') as HTMLInputElement;
const accommodationScopeAllEl = document.getElementById('accommodation-scope-all') as HTMLButtonElement;
const accommodationScopeNextDayEl = document.getElementById('accommodation-scope-next-day') as HTMLButtonElement;

function ensureValidState(): void {
  if (!Array.isArray(state.days) || state.days.length === 0) {
    state.days = [createDay(1)];
  }
  if (
    typeof state.activeDayIndex !== 'number' ||
    state.activeDayIndex < 0 ||
    state.activeDayIndex >= state.days.length
  ) {
    state.activeDayIndex = 0;
  }
}

function saveState(markAsUnsaved = true): void {
  tripStore.save(state);
  if (markAsUnsaved) {
    collabManager.markUnsaved();
  }
}

function syncAutoStarts(): void {
  for (let i = 1; i < state.days.length; i++) {
    const previousAccommodation = (state.days[i - 1].accommodation || '').trim();
    const day = state.days[i];
    if (day.autoAccommodation) {
      day.accommodation = previousAccommodation;
    }
    if (day.autoStart) {
      if (previousAccommodation) {
        if (day.autoStartSlot) {
          if (day.spots.length === 0) {
            day.spots.unshift({ name: previousAccommodation, memo: '' });
            day.autoStartSlot = true;
            day.autoStartValue = previousAccommodation;
          } else {
            const currentFirst = (day.spots[0]?.name || '').trim();
            const managedValue = (day.autoStartValue || '').trim();
            if (managedValue && currentFirst !== managedValue) {
              day.autoStart = false;
              day.autoStartSlot = false;
              day.autoStartValue = '';
            } else if (!managedValue && currentFirst) {
              day.autoStart = false;
              day.autoStartSlot = false;
              day.autoStartValue = '';
            } else {
              day.spots[0] = { name: previousAccommodation, memo: day.spots[0]?.memo || '' };
              day.autoStartValue = previousAccommodation;
            }
          }
        } else {
          day.spots.unshift({ name: previousAccommodation, memo: '' });
          day.autoStartSlot = true;
          day.autoStartValue = previousAccommodation;
        }
      } else {
        const managedValue = (day.autoStartValue || '').trim();
        if (
          day.autoStartSlot &&
          day.spots.length > 0 &&
          ((day.spots[0]?.name || '').trim() === managedValue || !managedValue)
        ) {
          day.spots.shift();
        }
        day.autoStartSlot = false;
        day.autoStartValue = '';
      }
    }
  }
}

function updateStickyOffsets(): void {
  if (!isTripConfirmed) {
    document.documentElement.style.setProperty('--trip-header-height', '0px');
    document.documentElement.style.setProperty('--sticky-form-height', '0px');
    document.documentElement.style.setProperty('--total-sticky-height', '0px');
    return;
  }

  const panelHeight = lpSlotWrapperEl ? Math.round(lpSlotWrapperEl.getBoundingClientRect().height) : 115;
  document.documentElement.style.setProperty('--trip-header-height', `${panelHeight}px`);
  document.documentElement.style.setProperty('--sticky-form-height', `${panelHeight}px`);
  document.documentElement.style.setProperty('--total-sticky-height', `${panelHeight}px`);
}

function scrollToDay(index: number): void {
  const section = document.getElementById(`day-section-${index}`);
  if (!section) return;
  updateStickyOffsets();
  const totalOffset = lpSlotWrapperEl ? Math.round(lpSlotWrapperEl.getBoundingClientRect().height) : 115;
  const sectionTop = section.getBoundingClientRect().top + window.scrollY;
  const targetScrollY = Math.max(0, sectionTop - totalOffset - 8);
  window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
}

function moveSpot(dayIndex: number, index: number, direction: number): void {
  const day = state.days[dayIndex];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= day.spots.length) return;
  animateSpotReorder(
    dayIndex,
    () => {
      [day.spots[index], day.spots[targetIndex]] = [day.spots[targetIndex], day.spots[index]];
      if (dayIndex > 0 && (index === 0 || targetIndex === 0)) {
        day.autoStart = false;
        day.autoStartSlot = false;
        day.autoStartValue = '';
      }
      state.openRouteMenuIndex = null;
      saveState();
    },
    render
  );
}

function moveSpotTo(fromDayIndex: number, fromIndex: number, toDayIndex: number, toIndex: number): void {
  const fromDay = state.days[fromDayIndex];
  const toDay = state.days[toDayIndex];
  if (!fromDay || !toDay) return;
  if (fromIndex < 0 || fromIndex >= fromDay.spots.length) return;

  if (fromDayIndex === toDayIndex) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= fromDay.spots.length) return;
    animateSpotReorder(
      fromDayIndex,
      () => {
        const [moved] = fromDay.spots.splice(fromIndex, 1);
        fromDay.spots.splice(toIndex, 0, moved);
        if (fromDayIndex > 0 && (fromIndex === 0 || toIndex === 0)) {
          fromDay.autoStart = false;
          fromDay.autoStartSlot = false;
          fromDay.autoStartValue = '';
        }
        state.openRouteMenuIndex = null;
        saveState();
      },
      render
    );
    return;
  }

  let targetIndex = toIndex;
  if (typeof targetIndex !== 'number' || targetIndex < 0 || targetIndex > toDay.spots.length) {
    targetIndex = toDay.spots.length;
  }

  animateSpotReorder(
    [fromDayIndex, toDayIndex],
    () => {
      const [moved] = fromDay.spots.splice(fromIndex, 1);
      toDay.spots.splice(targetIndex, 0, moved);
      if (fromDayIndex > 0 && fromIndex === 0) {
        fromDay.autoStart = false;
        fromDay.autoStartSlot = false;
        fromDay.autoStartValue = '';
      }
      if (toDayIndex > 0 && targetIndex === 0) {
        toDay.autoStart = false;
        toDay.autoStartSlot = false;
        toDay.autoStartValue = '';
      }
      state.openRouteMenuIndex = null;
      saveState();
    },
    render
  );
}

function toggleTripMenu(force?: boolean): void {
  isTripMenuOpen = typeof force === 'boolean' ? force : !isTripMenuOpen;
  if (tripComboboxMenuEl) {
    tripComboboxMenuEl.classList.toggle('hidden', !isTripMenuOpen);
  }
  if (tripComboboxToggleEl) {
    tripComboboxToggleEl.setAttribute('aria-expanded', String(isTripMenuOpen));
  }
  if (isTripMenuOpen) {
    renderTripComboboxMenu();
  }
}

function syncCollabStateWithActiveTrip(): void {
  if (state.shareId) {
    collabManager.initFromPlan({
      id: state.shareId,
      title: state.tripName,
      data: state,
      version: 1,
      createdAt: '',
      updatedAt: '',
    });
    collabManager.fetchLatest();
    if (typeof window !== 'undefined' && window.location.pathname !== `/p/${state.shareId}`) {
      window.history.pushState(null, '', `/p/${state.shareId}`);
    }
  } else {
    collabManager.reset();
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  }
}

function createNewTrip(): void {
  if (tripStore.trips.length >= MAX_TRIPS) {
    alert(`旅行は最大${MAX_TRIPS}件までしか作成できません。`);
    return;
  }
  saveState();
  const newTrip = createTripEntry('');
  tripStore.trips.push(newTrip);
  tripStore.activeTripId = newTrip.id;
  tripStore.applyActiveTripToState(state);
  syncCollabStateWithActiveTrip();
  isTripConfirmed = false;
  isTransitioningToApp = false;
  saveState();
  render();
  if (tripNameInputEl) {
    tripNameInputEl.focus();
    tripNameInputEl.select();
  }
}

function deleteTrip(tripId: string): void {
  if (tripStore.trips.length <= 1) {
    alert('最後の1件の旅行は削除できません。');
    return;
  }
  const index = tripStore.trips.findIndex((t) => t.id === tripId);
  if (index === -1) return;
  const targetTrip = tripStore.trips[index];
  const displayName =
    targetTrip.tripName && targetTrip.tripName.trim() ? targetTrip.tripName : `旅行${index + 1}（名称未設定）`;
  if (!confirm(`「${displayName}」を削除しますか？この操作は取り消せません。`)) {
    return;
  }
  tripStore.trips.splice(index, 1);
  if (tripId === tripStore.activeTripId) {
    tripStore.activeTripId = tripStore.trips[Math.max(0, index - 1)].id;
    tripStore.applyActiveTripToState(state);
    syncCollabStateWithActiveTrip();
    isTripConfirmed = Boolean(state.tripName && state.tripName.trim().length > 0);
  }
  saveState();
  render();
}

function renderTripComboboxMenu(): void {
  if (!tripComboboxMenuEl) return;
  tripComboboxMenuEl.innerHTML = '';
  tripStore.trips.forEach((trip, index) => {
    const item = document.createElement('li');
    const isSelected = trip.id === tripStore.activeTripId;
    item.className = `flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-75 hover:bg-slate-100 ${
      isSelected ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-700'
    }`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(isSelected));

    const labelArea = document.createElement('div');
    labelArea.className = 'flex min-w-0 flex-1 items-center gap-2';

    if (isSelected) {
      const check = document.createElement('i');
      check.setAttribute('data-lucide', 'check');
      check.className = 'h-4 w-4 shrink-0 text-slate-900';
      labelArea.appendChild(check);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'h-4 w-4 shrink-0';
      labelArea.appendChild(spacer);
    }

    const displayName =
      trip.tripName && trip.tripName.trim() ? trip.tripName : `旅行${index + 1}（名称未設定）`;
    const label = document.createElement('span');
    label.className = 'truncate';
    label.textContent = displayName;
    labelArea.appendChild(label);

    item.appendChild(labelArea);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('aria-label', `${displayName}を削除`);
    const singleTrip = tripStore.trips.length <= 1;
    if (singleTrip) {
      deleteBtn.disabled = true;
      deleteBtn.className = 'rounded-md p-1 text-slate-200 cursor-not-allowed shrink-0';
      deleteBtn.title = '最後の1件の旅行は削除できません';
    } else {
      deleteBtn.className =
        'rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors duration-75 shrink-0';
      deleteBtn.title = `${displayName}を削除`;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTrip(trip.id);
      });
    }
    deleteBtn.innerHTML = '<i data-lucide="x" class="h-3.5 w-3.5"></i>';
    item.appendChild(deleteBtn);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (trip.id !== tripStore.activeTripId) {
        saveState();
        tripStore.activeTripId = trip.id;
        tripStore.applyActiveTripToState(state);
        syncCollabStateWithActiveTrip();
        isTripConfirmed = Boolean(state.tripName && state.tripName.trim().length > 0);
        saveState(false);
        render();
      } else if (state.tripName && state.tripName.trim().length > 0) {
        isTripConfirmed = true;
        updateItineraryVisibility();
      }
      toggleTripMenu(false);
    });

    tripComboboxMenuEl.appendChild(item);
  });

  const separator = document.createElement('li');
  separator.className = 'my-1 border-t border-slate-100';
  separator.setAttribute('role', 'separator');
  tripComboboxMenuEl.appendChild(separator);

  const addActionItem = document.createElement('li');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  const isMaxTrips = tripStore.trips.length >= MAX_TRIPS;
  addBtn.className = `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-75 ${
    isMaxTrips
      ? 'cursor-not-allowed text-slate-400'
      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
  }`;
  addBtn.innerHTML = '<i data-lucide="plus" class="h-4 w-4 shrink-0"></i><span>新しい旅程を作成</span>';
  if (isMaxTrips) {
    addBtn.disabled = true;
    addBtn.title = `旅行は最大${MAX_TRIPS}件まで作成できます`;
  } else {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      createNewTrip();
      toggleTripMenu(false);
    });
  }
  addActionItem.appendChild(addBtn);
  tripComboboxMenuEl.appendChild(addActionItem);

  refreshIcons(tripComboboxMenuEl);
}

function renderTripSwitcher(): void {
  if (tripSwitcherEl) {
    tripSwitcherEl.innerHTML = '';
    tripStore.trips.forEach((trip, index) => {
      const option = document.createElement('option');
      option.value = trip.id;
      option.textContent =
        trip.tripName && trip.tripName.trim() ? trip.tripName : `旅行${index + 1}（名称未設定）`;
      tripSwitcherEl.appendChild(option);
    });
    tripSwitcherEl.value = tripStore.activeTripId;
  }
  if (tripDeleteBtnEl) {
    const singleTrip = tripStore.trips.length <= 1;
    tripDeleteBtnEl.disabled = singleTrip;
    tripDeleteBtnEl.classList.toggle('opacity-50', singleTrip);
    tripDeleteBtnEl.classList.toggle('cursor-not-allowed', singleTrip);
  }
  if (isTripMenuOpen) {
    renderTripComboboxMenu();
  }
}

function updateMapTypeUI(): void {
  const isApple = state.mapType === 'apple';
  const currentMapName = isApple ? 'Apple' : 'Google';

  const radios = document.querySelectorAll<HTMLInputElement>('input[name="map-type-radio"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === state.mapType;
  });

  document.querySelectorAll<HTMLElement>('.map-type-label').forEach((label) => {
    const isSelected = label.dataset.mapType === state.mapType;
    if (isSelected) {
      label.className =
        'map-type-label flex cursor-pointer items-center rounded px-2 py-1 text-xs font-medium transition-all select-none bg-slate-900 text-white shadow-xs';
    } else {
      label.className =
        'map-type-label flex cursor-pointer items-center rounded px-2 py-1 text-xs font-medium transition-all select-none text-slate-600 hover:text-slate-900 hover:bg-slate-200/60';
    }
  });

  document.querySelectorAll<HTMLElement>('[data-route-btn]').forEach((btn) => {
    btn.setAttribute('data-tooltip', `${currentMapName}でルートを開く`);
    btn.setAttribute('data-tooltip-pos', 'bottom');
    btn.removeAttribute('title');
  });

  state.days.forEach((day, index) => {
    const section = document.getElementById(`day-section-${index}`);
    if (section) {
      const heading = section.querySelector<HTMLAnchorElement>('summary a');
      if (heading) {
        const items = getDayItems(day, index, state);
        heading.href = getDayRouteUrl(
          items.map((item) => item.value),
          state.mapType
        );
        heading.setAttribute('data-tooltip', `${currentMapName}でこの日のルートを開く`);
        heading.setAttribute('data-tooltip-pos', 'bottom');
        heading.removeAttribute('title');
      }
    }
  });
}

function setMapType(type: MapType, silent = false): void {
  if (type !== 'google' && type !== 'apple') return;
  state.mapType = type;
  try {
    localStorage.setItem(MAP_TYPE_STORAGE_KEY, type);
  } catch (e) {}
  saveState();
  updateMapTypeUI();
  if (!silent) {
    showToast(type === 'apple' ? 'Apple Mapに切り替えました' : 'Google Mapsに切り替えました');
  }
}

function setTagStyle(button: HTMLButtonElement, selected: boolean): void {
  button.setAttribute('aria-pressed', String(selected));
  button.style.backgroundColor = selected ? '#18181b' : '#ffffff';
  button.style.borderColor = selected ? '#18181b' : '#d4d4d8';
  button.style.color = selected ? '#ffffff' : '#3f3f46';
}

function renderAddSpotOptions(): void {
  if (addTypeDepartureEl) {
    addTypeDepartureEl.checked = state.addLocationType === 'departure';
  }
  if (addTypeAccommodationEl) {
    addTypeAccommodationEl.checked = state.addLocationType === 'accommodation';
  }

  const isAccommodation = state.addLocationType === 'accommodation';
  const isDeparture = state.addLocationType === 'departure';

  // 宿泊地オプション: 同じ行内に inline-flex で表示
  if (addAccommodationScopeEl) {
    addAccommodationScopeEl.classList.toggle('hidden', !isAccommodation);
    addAccommodationScopeEl.classList.toggle('inline-flex', isAccommodation);
  }

  // 発着地点オプション: 同じ行内に表示
  const note = isDeparture ? '後から上書きできます。' : '';
  if (addTypeNoteEl) {
    addTypeNoteEl.textContent = note;
    addTypeNoteEl.classList.toggle('hidden', !note);
  }

  // 未選択時のみ「（未選択時はスポット）」を表示
  if (addTypeDefaultHintEl) {
    addTypeDefaultHintEl.classList.toggle('hidden', isAccommodation || isDeparture);
  }

  setTagStyle(addAccommodationScopeAllEl, state.addAccommodationScope === 'all');
  setTagStyle(addAccommodationScopeTodayEl, state.addAccommodationScope === 'today');
  newSpotInputEl.placeholder =
    isDeparture
      ? '例: 東京駅'
      : isAccommodation
        ? '例: 京都駅周辺'
        : '例: 浅草寺';
  updateStickyOffsets();
}

function addSpot(): void {
  const value = newSpotInputEl.value.trim();
  if (!value) return;
  const day = state.days[state.activeDayIndex];
  if (state.addLocationType === 'departure') {
    state.departure = value;
    state.arrival = value;
    state.autoArrival = true;
  } else if (state.addLocationType === 'accommodation') {
    const nextDay = state.days[state.activeDayIndex + 1];
    day.accommodation = value;
    day.autoAccommodation = false;
    if (state.addAccommodationScope === 'all') {
      for (let i = state.activeDayIndex + 1; i < state.days.length; i++) {
        state.days[i].autoAccommodation = true;
      }
    } else if (nextDay) {
      nextDay.accommodation = value;
      nextDay.autoAccommodation = false;
    }
    syncAutoStarts();
  } else {
    day.spots.push({ name: value, memo: '' });
  }
  newSpotInputEl.value = '';
  state.addLocationType = 'spot';
  saveState();
  render();
}

let isAnimatingDayTabs = false;

function addDay(): void {
  if (isAnimatingDayTabs) return;
  isAnimatingDayTabs = true;
  isScrollingToTab = true;

  const newDayIndex = state.days.length;
  const prevAccommodation = (state.days[state.days.length - 1].accommodation || '').trim();
  state.days.push(createDay(newDayIndex + 1, prevAccommodation));
  state.activeDayIndex = newDayIndex;
  saveState();
  render();

  // ＋ボタンと既存DayTagの間に隙間ができ、そこに右から追加されたDaysTagがスライドアニメーションで表示
  const newTagBtn = dayTabsEl?.querySelector<HTMLElement>(`[data-day-index="${newDayIndex}"]`);
  if (newTagBtn) {
    newTagBtn.classList.add('day-tag-inserting');
    setTimeout(() => {
      newTagBtn.classList.remove('day-tag-inserting');
    }, 550);
  }

  // スポットカード側はアニメーションさせず、新日程へ自然にスクロール
  scrollToDay(newDayIndex);

  setTimeout(() => {
    isAnimatingDayTabs = false;
    isScrollingToTab = false;
  }, 600);
}

function undoDeleteDay(): boolean {
  if (dayUndoStack.length === 0) return false;
  const item = dayUndoStack.pop();
  if (!item || !item.day) return false;

  state.days.splice(item.index, 0, item.day);
  state.days.forEach((day, index) => {
    day.name = `Day ${index + 1}`;
  });
  state.activeDayIndex = Math.min(item.index, state.days.length - 1);
  state.openRouteMenuIndex = null;
  syncAutoStarts();
  saveState();
  render();
  scrollToDay(state.activeDayIndex);
  showToast(`「${item.day.name}」を元に戻しました`);
  return true;
}

function executeDeleteDay(targetIndex: number): void {
  const targetDay = state.days[targetIndex];
  const targetName = targetDay?.name || `Day ${targetIndex + 1}`;

  dayUndoStack.push({
    index: targetIndex,
    day: JSON.parse(JSON.stringify(targetDay)),
  });

  state.days.splice(targetIndex, 1);
  state.days.forEach((day, index) => {
    day.name = `Day ${index + 1}`;
    if (
      index === 0 &&
      day.autoStartSlot &&
      (day.spots[0]?.name || '').trim() === (day.autoStartValue || '').trim()
    ) {
      day.spots.shift();
      day.autoStart = false;
      day.autoStartSlot = false;
      day.autoStartValue = '';
    }
    if (index === 0) {
      day.autoAccommodation = false;
    }
  });
  state.activeDayIndex = Math.min(targetIndex, state.days.length - 1);
  state.openRouteMenuIndex = null;
  syncAutoStarts();
  saveState();
  render();
  scrollToDay(state.activeDayIndex);
  showToast(`「${targetName}」を削除しました（Ctrl+Zで戻せます）`, () => {
    undoDeleteDay();
  });
}

function deleteActiveDay(): void {
  if (isAnimatingDayTabs) return;
  if (state.days.length <= 1) {
    alert('日程は最低1日必要です。');
    return;
  }

  const targetIndex = state.activeDayIndex;
  const targetTagBtn = dayTabsEl?.querySelector<HTMLElement>(`[data-day-index="${targetIndex}"]`);

  if (!targetTagBtn) {
    executeDeleteDay(targetIndex);
    return;
  }

  isAnimatingDayTabs = true;
  isScrollingToTab = true;

  // 削除時は逆再生（右へスライドアウトし隙間が閉じる）
  targetTagBtn.classList.add('day-tag-removing');

  setTimeout(() => {
    executeDeleteDay(targetIndex);
    isAnimatingDayTabs = false;
    setTimeout(() => {
      isScrollingToTab = false;
    }, 200);
  }, 480);
}

function renderTabs(): void {
  dayTabsEl.innerHTML = '';
  state.days.forEach((day, index) => {
    const button = document.createElement('button');
    const active = index === state.activeDayIndex;
    button.className = `w-14 sm:w-16 shrink-0 rounded-lg border px-1 py-1.5 sm:px-1.5 sm:py-2 text-center text-xs sm:text-sm font-medium whitespace-nowrap shadow-xs transition-all duration-75 cursor-pointer ${
      active
        ? 'text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 hover:scale-105 hover:shadow-xs'
    }`;
    if (active) {
      button.style.backgroundColor = '#18181b';
      button.style.borderColor = '#18181b';
      button.style.color = '#ffffff';
    }
    button.textContent = day.name;
    button.dataset.dayIndex = String(index);
    button.addEventListener('click', () => {
      state.activeDayIndex = index;
      state.openRouteMenuIndex = null;
      saveState();

      isScrollingToTab = true;
      if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
      scrollTimeoutId = setTimeout(() => {
        isScrollingToTab = false;
      }, 800);

      scrollToDay(index);
      renderAddSpotOptions();
      renderTabs();
    });
    button.addEventListener('dragover', (e) => {
      if (!draggedSpot) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      button.classList.add('ring-2', 'ring-slate-900', 'scale-105');
    });
    button.addEventListener('dragleave', (e) => {
      if (button.contains(e.relatedTarget as Node)) return;
      button.classList.remove('ring-2', 'ring-slate-900', 'scale-105');
    });
    button.addEventListener('drop', (e) => {
      if (!draggedSpot) return;
      e.preventDefault();
      button.classList.remove('ring-2', 'ring-slate-900', 'scale-105');
      const fromDayIndex = draggedSpot.dayIndex;
      const fromIndex = draggedSpot.index;
      moveSpotTo(fromDayIndex, fromIndex, index, state.days[index].spots.length);
      state.activeDayIndex = index;
      scrollToDay(index);
    });
    dayTabsEl.appendChild(button);
  });

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className =
    'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-full bg-slate-900 p-0 text-base sm:text-lg font-semibold leading-none text-white shadow-xs transition-all duration-75 hover:scale-105 hover:bg-slate-800 hover:shadow-md active:scale-90 cursor-pointer';
  const addIcon = document.createElement('span');
  addIcon.textContent = '+';
  addIcon.style.transform = 'translateY(-1px)';
  addButton.appendChild(addIcon);
  addButton.setAttribute('aria-label', '日程追加');
  addButton.addEventListener('click', addDay);
  dayTabsEl.appendChild(addButton);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className =
    'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-full bg-slate-200 p-0 text-base sm:text-lg font-semibold leading-none text-slate-700 transition-all duration-75 hover:scale-105 hover:bg-slate-300 hover:text-slate-900 hover:shadow-md active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-slate-200 disabled:hover:text-slate-700 disabled:hover:shadow-none cursor-pointer';
  const deleteIcon = document.createElement('span');
  deleteIcon.textContent = '−';
  deleteIcon.style.transform = 'translateY(-1px)';
  deleteButton.appendChild(deleteIcon);
  const activeDayName = state.days[state.activeDayIndex]?.name || `Day ${state.activeDayIndex + 1}`;
  deleteButton.setAttribute('aria-label', `選択中の日程（${activeDayName}）を削除`);
  deleteButton.disabled = state.days.length <= 1;
  deleteButton.addEventListener('click', deleteActiveDay);
  dayTabsEl.appendChild(deleteButton);

  const divider = document.createElement('div');
  divider.className = 'w-6 sm:w-8 border-t border-slate-300 my-0.5 shrink-0 self-center';
  divider.setAttribute('role', 'separator');
  dayTabsEl.appendChild(divider);


  const collabState = collabManager.getState();

  if (collabState.planId) {
    // 1. 共有URLコピーボタン
    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.id = 'share-btn';
    shareButton.className =
      'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-full border border-slate-300 bg-white p-0 text-slate-700 shadow-xs transition-all duration-75 hover:scale-105 hover:border-slate-900 hover:bg-slate-900 hover:text-white hover:shadow-md active:scale-90 cursor-pointer';
    const shareTooltip = '共有URLをコピー';
    shareButton.setAttribute('aria-label', shareTooltip);
    shareButton.setAttribute('data-tooltip', shareTooltip);
    shareButton.setAttribute('data-tooltip-pos', 'left');
    shareButton.innerHTML = '<i data-lucide="share-2" class="h-3.5 w-3.5 sm:h-4 sm:w-4"></i>';
    shareButton.addEventListener('click', async () => {
      const url = await collabManager.createShareLink(state.tripName, state, shareButton);
      if (url) {
        saveState(false);
      }
      renderTabs();
    });
    dayTabsEl.appendChild(shareButton);

    // 2. 最新化リロードボタン（更新）
    const reloadButton = document.createElement('button');
    reloadButton.type = 'button';
    reloadButton.id = 'collab-reload-btn';
    reloadButton.className =
      'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-full border border-slate-300 bg-white p-0 text-slate-700 shadow-xs transition-all duration-75 hover:scale-105 hover:border-slate-900 hover:bg-slate-900 hover:text-white hover:shadow-md active:scale-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
    reloadButton.setAttribute('aria-label', '最新の旅程を再読込');
    reloadButton.setAttribute('data-tooltip', '最新の旅程を再読込');
    reloadButton.setAttribute('data-tooltip-pos', 'left');
    reloadButton.innerHTML = '<i data-lucide="refresh-cw" class="h-3.5 w-3.5 sm:h-4 sm:w-4"></i>';
    reloadButton.addEventListener('click', async () => {
      reloadButton.classList.add('animate-spin');
      reloadButton.disabled = true;
      try {
        const latest = await collabManager.fetchLatest();
        if (latest && latest.data) {
          let planData = latest.data;
          if (typeof planData === 'string') {
            try {
              planData = JSON.parse(planData);
            } catch (e) {
              console.error('Failed to parse plan data:', e);
            }
          }
          if (planData && typeof planData === 'object') {
            Object.assign(state, planData);
            if (latest.title) state.tripName = latest.title;
            state.shareId = latest.id;
            ensureValidState();
            syncAutoStarts();
            saveState(false);
            render();
            showToast('最新データを反映しました！');
            return;
          }
        }
      } catch (err) {
        console.error('Reload failed:', err);
      } finally {
        reloadButton.classList.remove('animate-spin');
        reloadButton.disabled = false;
        renderTabs();
      }
    });
    dayTabsEl.appendChild(reloadButton);

    // 3. 変更を保存ボタン（保存）
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.id = 'collab-save-btn';
    const isUnsaved = collabState.hasUnsavedChanges;
    saveButton.className = `relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-full border p-0 shadow-xs transition-all duration-75 hover:scale-105 hover:shadow-md active:scale-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
      isUnsaved
        ? 'border-amber-500 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:border-amber-600'
        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-900 hover:bg-slate-900 hover:text-white'
    }`;
    const saveTooltip = isUnsaved ? '変更を保存（未保存の変更あり）' : '変更を保存済み';
    saveButton.setAttribute('aria-label', saveTooltip);
    saveButton.setAttribute('data-tooltip', saveTooltip);
    saveButton.setAttribute('data-tooltip-pos', 'left');
    saveButton.innerHTML = `<i data-lucide="save" class="h-3.5 w-3.5 sm:h-4 sm:w-4 ${isUnsaved ? 'text-amber-600' : ''}"></i>`;
    if (isUnsaved) {
      const dot = document.createElement('span');
      dot.className = 'absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white';
      saveButton.appendChild(dot);
    }
    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      try {
        await collabManager.savePlan(state.tripName, state, {
          onConflict: () => {
            showToast(
              '⚠️ 他の人が更新しました。最新版を読み直してください',
              async () => {
                const latest = await collabManager.fetchLatest();
                if (latest && latest.data) {
                  let planData = latest.data;
                  if (typeof planData === 'string') {
                    try {
                      planData = JSON.parse(planData);
                    } catch {}
                  }
                  if (planData && typeof planData === 'object') {
                    Object.assign(state, planData);
                    if (latest.title) state.tripName = latest.title;
                    state.shareId = latest.id;
                    ensureValidState();
                    syncAutoStarts();
                    saveState(false);
                    render();
                    showToast('最新データを反映しました！');
                  }
                }
              },
              '最新版を読込'
            );
          },
        });
      } finally {
        saveButton.disabled = false;
        renderTabs();
      }
    });
    dayTabsEl.appendChild(saveButton);
  } else {
    // 未共有時: 共有リンク発行ボタンのみ表示
    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.id = 'share-btn';
    shareButton.className =
      'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-full border border-slate-300 bg-white p-0 text-slate-700 shadow-xs transition-all duration-75 hover:scale-105 hover:border-slate-900 hover:bg-slate-900 hover:text-white hover:shadow-md active:scale-90 cursor-pointer';
    const shareTooltip = '共有リンクを発行';
    shareButton.setAttribute('aria-label', shareTooltip);
    shareButton.setAttribute('data-tooltip', shareTooltip);
    shareButton.setAttribute('data-tooltip-pos', 'left');
    shareButton.innerHTML = '<i data-lucide="share-2" class="h-3.5 w-3.5 sm:h-4 sm:w-4"></i>';
    shareButton.addEventListener('click', async () => {
      const url = await collabManager.createShareLink(state.tripName, state, shareButton);
      if (url) {
        saveState(false);
      }
      renderTabs();
    });
    dayTabsEl.appendChild(shareButton);
  }

  refreshIcons(dayTabsEl);
}

function animateDayTabsStagger(): void {
  if (!dayTabsEl) return;
  const children = Array.from(dayTabsEl.children) as HTMLElement[];
  if (children.length === 0) return;

  children.forEach((child, i) => {
    child.style.animationDelay = `${i * 320}ms`;
    if ((child as HTMLButtonElement).disabled) {
      child.style.setProperty('--tag-target-opacity', '0.4');
    }
    child.classList.add('day-tag-entering');
  });

  const totalDuration = children.length * 320 + 500;
  setTimeout(() => {
    children.forEach((child) => {
      child.style.animationDelay = '';
      child.style.removeProperty('--tag-target-opacity');
      child.classList.remove('day-tag-entering');
    });
  }, totalDuration);
}

function parseMemo(memo: string): {
  firstLine: string;
  restLines: string[];
  hasRest: boolean;
} {
  const normalized = (memo || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const firstLine = lines[0] || '';
  const restLines = lines.slice(1);
  const hasRest = restLines.some((l) => l.trim().length > 0);
  return { firstLine, restLines, hasRest };
}

function createMemoComponent(options: {
  memo: string;
  onSave: (newMemo: string) => void;
}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mt-1.5 w-full';

  let currentMemo = options.memo || '';
  let isEditing = false;
  let isExpanded = false;

  const renderContent = () => {
    wrap.innerHTML = '';

    if (isEditing) {
      const editBox = document.createElement('div');
      editBox.className =
        'rounded-lg border border-slate-300 bg-white p-2 shadow-xs transition-all focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-200';

      const textarea = document.createElement('textarea');
      textarea.value = currentMemo;
      textarea.placeholder = '1行目: 時間や短い見出し（例: 10:00〜）\n2行目以降: 住所、持ち物、詳細メモなど';
      textarea.rows = Math.max(3, currentMemo.split('\n').length);
      textarea.className =
        'w-full resize-y bg-transparent text-xs text-slate-800 outline-none leading-relaxed placeholder:text-slate-400';

      const actionRow = document.createElement('div');
      actionRow.className = 'mt-1.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5';

      const hintText = document.createElement('span');
      hintText.className = 'text-[10px] text-slate-400 select-none';
      hintText.textContent = '1行目は一覧で常時表示されます';

      const finishBtn = document.createElement('button');
      finishBtn.type = 'button';
      finishBtn.className =
        'rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition-colors duration-75 hover:bg-slate-800 cursor-pointer select-none';
      finishBtn.textContent = '完了';

      let isFinished = false;
      const finishEditing = () => {
        if (isFinished) return;
        isFinished = true;
        const val = textarea.value;
        currentMemo = val;
        isEditing = false;
        options.onSave(val);
        renderContent();
      };

      finishBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        finishEditing();
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
          e.preventDefault();
          finishEditing();
        }
      });

      textarea.addEventListener('blur', (e) => {
        if (e.relatedTarget === finishBtn) return;
        finishEditing();
      });

      actionRow.append(hintText, finishBtn);
      editBox.append(textarea, actionRow);
      wrap.appendChild(editBox);

      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      }, 10);
      return;
    }

    // プレビューモード（表示モード）
    const parsed = parseMemo(currentMemo);

    if (!parsed.firstLine.trim() && !parsed.hasRest) {
      // メモが未設定の場合
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className =
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors duration-75 hover:bg-slate-100 hover:text-slate-700 cursor-pointer select-none';
      addBtn.innerHTML = '<i data-lucide="file-text" class="h-3 w-3"></i><span>+ メモを追加</span>';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isEditing = true;
        renderContent();
      });
      wrap.appendChild(addBtn);
      refreshIcons(wrap);
      return;
    }

    // メモが存在する場合
    const previewBox = document.createElement('div');
    previewBox.className =
      'group rounded-lg border border-slate-200/80 bg-slate-50/80 p-2 text-xs transition-colors duration-75 hover:border-slate-300 hover:bg-slate-50';

    // 1行目表示行
    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-center justify-between gap-2';

    const firstLineContent = document.createElement('div');
    firstLineContent.className =
      'flex min-w-0 flex-1 items-center gap-1.5 cursor-pointer select-none';
    firstLineContent.title = 'クリックしてメモを編集';
    firstLineContent.addEventListener('click', (e) => {
      e.stopPropagation();
      isEditing = true;
      renderContent();
    });

    const clockIcon = document.createElement('i');
    clockIcon.setAttribute('data-lucide', 'clock');
    clockIcon.className = 'h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors';

    const firstLineSpan = document.createElement('span');
    firstLineSpan.className = 'truncate font-medium text-slate-800';
    firstLineSpan.textContent = parsed.firstLine || '(メモ)';

    firstLineContent.append(clockIcon, firstLineSpan);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'flex shrink-0 items-center gap-1';

    // 2行目以降がある場合のみアコーディオン展開ボタンを表示（要件3, 4）
    if (parsed.hasRest) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className =
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition-colors duration-75 hover:bg-slate-200/70 hover:text-slate-800 cursor-pointer select-none';
      toggleBtn.innerHTML = isExpanded
        ? '<span>閉じる</span><i data-lucide="chevron-up" class="h-3 w-3"></i>'
        : '<span>詳細</span><i data-lucide="chevron-down" class="h-3 w-3"></i>';
      toggleBtn.setAttribute('aria-expanded', String(isExpanded));
      toggleBtn.setAttribute('data-tooltip', isExpanded ? 'メモを折りたたむ' : 'メモの全容を表示');
      toggleBtn.setAttribute('data-tooltip-pos', 'top');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isExpanded = !isExpanded;
        renderContent();
      });
      btnGroup.appendChild(toggleBtn);
    }

    // 編集ボタン（鉛筆アイコン）
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'rounded p-1 text-slate-400 opacity-60 transition-all duration-75 hover:bg-slate-200/70 hover:text-slate-700 hover:opacity-100 group-hover:opacity-100 cursor-pointer';
    editBtn.title = 'メモを編集';
    editBtn.innerHTML = '<i data-lucide="pencil" class="h-3 w-3"></i>';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isEditing = true;
      renderContent();
    });
    btnGroup.appendChild(editBtn);

    headerRow.append(firstLineContent, btnGroup);
    previewBox.appendChild(headerRow);

    // 展開時の2行目以降（全行）の表示
    if (parsed.hasRest && isExpanded) {
      const restBox = document.createElement('div');
      restBox.className =
        'mt-2 border-t border-slate-200/80 pt-1.5 whitespace-pre-wrap leading-relaxed text-slate-600 text-[11px] cursor-pointer selection:bg-slate-200';
      restBox.title = 'クリックしてメモを編集';
      restBox.textContent = parsed.restLines.join('\n');
      restBox.addEventListener('click', (e) => {
        e.stopPropagation();
        isEditing = true;
        renderContent();
      });
      previewBox.appendChild(restBox);
    }

    wrap.appendChild(previewBox);
    refreshIcons(wrap);
  };

  renderContent();
  return wrap;
}

function createSpotCard(
  spotValue: string,
  index: number,
  markerIndex = index,
  dayIndex = state.activeDayIndex,
  spotMemo = ''
): HTMLElement {
  const card = document.createElement('div');
  card.className =
    'relative rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs transition-colors duration-75 hover:border-slate-300 hover:shadow-sm sm:p-4';
  card.dataset.spotCard = 'true';
  card.dataset.spotValue = spotValue;
  card.draggable = true;

  card.addEventListener('dragstart', (e) => {
    draggedSpot = { dayIndex, index };
    card.classList.add('opacity-50');
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', String(index));
  });
  card.addEventListener('dragend', () => {
    draggedSpot = null;
    card.classList.remove('opacity-50');
  });
  card.addEventListener('dragover', (e) => {
    if (!draggedSpot) return;
    if (draggedSpot.dayIndex === dayIndex && draggedSpot.index === index) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    card.classList.add('border-slate-800', 'bg-slate-100');
  });
  card.addEventListener('dragleave', (e) => {
    if (card.contains(e.relatedTarget as Node)) return;
    card.classList.remove('border-slate-800', 'bg-slate-100');
  });
  card.addEventListener('drop', (e) => {
    if (!draggedSpot) return;
    if (draggedSpot.dayIndex === dayIndex && draggedSpot.index === index) return;
    e.preventDefault();
    card.classList.remove('border-slate-800', 'bg-slate-100');
    const fromDayIndex = draggedSpot.dayIndex;
    const fromIndex = draggedSpot.index;
    moveSpotTo(fromDayIndex, fromIndex, dayIndex, index);
  });

  const row = document.createElement('div');
  row.className = 'flex items-start gap-3';

  const handle = document.createElement('div');
  handle.className =
    'mt-2 flex h-6 w-5 shrink-0 cursor-grab select-none items-center justify-center text-slate-400 active:cursor-grabbing';
  handle.textContent = '⠿';
  handle.setAttribute('aria-hidden', 'true');
  handle.setAttribute('data-tooltip', 'ドラッグして並び替え');
  handle.setAttribute('data-tooltip-pos', 'top');

  const marker = document.createElement('div');
  marker.className =
    'mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white';
  marker.textContent = String(markerIndex + 1);

  const content = document.createElement('div');
  content.className = 'w-full';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = spotValue;
  input.placeholder = 'スポット名';
  input.className =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors duration-75 focus:border-slate-900 focus:ring-2 focus:ring-slate-200';
  input.addEventListener('input', (e) => {
    const day = state.days[dayIndex];
    if (day && day.spots[index]) {
      day.spots[index].name = (e.target as HTMLInputElement).value;
      if (dayIndex > 0 && index === 0 && day.autoStartSlot) {
        const previousAccommodation = (state.days[dayIndex - 1].accommodation || '').trim();
        const currentValue = (e.target as HTMLInputElement).value.trim();
        const shouldKeepAuto = currentValue === previousAccommodation;
        day.autoStart = shouldKeepAuto;
        day.autoStartSlot = shouldKeepAuto && !!previousAccommodation;
        day.autoStartValue = shouldKeepAuto ? previousAccommodation : '';
      }
      saveState();
    }
  });

  const memoComponent = createMemoComponent({
    memo: spotMemo,
    onSave: (newMemo) => {
      const day = state.days[dayIndex];
      if (day && day.spots[index]) {
        day.spots[index].memo = newMemo;
        saveState();
      }
    },
  });

  const controls = document.createElement('div');
  controls.className = 'mt-2 flex items-center justify-between gap-2';

  const moveGroup = document.createElement('div');
  moveGroup.className = 'flex items-center gap-1';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className =
    'rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 transition-colors duration-75 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer';
  upBtn.innerHTML = '<i data-lucide="arrow-up" class="h-3.5 w-3.5"></i>';
  upBtn.setAttribute('aria-label', '上に移動');
  upBtn.setAttribute('data-tooltip', '上に移動');
  upBtn.setAttribute('data-tooltip-pos', 'top');
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => moveSpot(dayIndex, index, -1));

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className =
    'rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 transition-colors duration-75 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer';
  downBtn.innerHTML = '<i data-lucide="arrow-down" class="h-3.5 w-3.5"></i>';
  downBtn.setAttribute('aria-label', '下に移動');
  downBtn.setAttribute('data-tooltip', '下に移動');
  downBtn.setAttribute('data-tooltip-pos', 'top');
  downBtn.disabled = index === state.days[dayIndex].spots.length - 1;
  downBtn.addEventListener('click', () => moveSpot(dayIndex, index, 1));

  moveGroup.append(upBtn, downBtn);

  const hint = document.createElement('span');
  hint.className = 'flex-1 text-xs text-slate-500';
  hint.textContent =
    dayIndex > 0 && index === 0 && state.days[dayIndex].autoStart ? '前日の宿泊地を反映中' : '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition-colors duration-75 hover:bg-slate-300 hover:text-slate-900 cursor-pointer';
  removeBtn.textContent = '削除';
  removeBtn.setAttribute('aria-label', 'スポットを削除');
  removeBtn.setAttribute('data-tooltip', 'スポットを削除');
  removeBtn.setAttribute('data-tooltip-pos', 'top');
  removeBtn.addEventListener('click', () => {
    const day = state.days[dayIndex];
    day.spots.splice(index, 1);
    if (index === 0 && dayIndex > 0) {
      day.autoStart = false;
      day.autoStartSlot = false;
      day.autoStartValue = '';
    }
    state.openRouteMenuIndex = null;
    saveState();
    render();
  });

  controls.append(moveGroup, hint, removeBtn);
  content.append(input, memoComponent, controls);
  row.append(handle, marker, content);
  card.appendChild(row);
  return card;
}

function createAccommodationCard(
  accommodation: string,
  index: number,
  dayIndex = state.activeDayIndex,
  accommodationMemo = ''
): HTMLElement {
  const card = document.createElement('div');
  card.className =
    'relative rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs transition-colors duration-75 hover:border-slate-300 hover:shadow-sm sm:p-4';
  card.dataset.spotCard = 'true';

  card.addEventListener('dragover', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    card.classList.add('border-slate-800', 'bg-slate-100');
  });
  card.addEventListener('dragleave', (e) => {
    if (card.contains(e.relatedTarget as Node)) return;
    card.classList.remove('border-slate-800', 'bg-slate-100');
  });
  card.addEventListener('drop', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    card.classList.remove('border-slate-800', 'bg-slate-100');
    const fromDayIndex = draggedSpot.dayIndex;
    const fromIndex = draggedSpot.index;
    moveSpotTo(fromDayIndex, fromIndex, dayIndex, state.days[dayIndex].spots.length);
  });

  const row = document.createElement('div');
  row.className = 'flex items-start gap-3';

  const spacer = document.createElement('div');
  spacer.className =
    'mt-2 flex h-6 w-5 shrink-0 items-center justify-center text-slate-300 select-none text-xs';
  spacer.setAttribute('aria-hidden', 'true');

  const marker = document.createElement('div');
  marker.className =
    'mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white';
  marker.textContent = String(index + 1);

  const content = document.createElement('div');
  content.className = 'w-full';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = accommodation;
  input.placeholder = '宿泊地を入力';
  input.className =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors duration-75 focus:border-slate-900 focus:ring-2 focus:ring-slate-200';
  input.addEventListener('input', (e) => {
    const day = state.days[dayIndex];
    if (day) {
      day.accommodation = (e.target as HTMLInputElement).value;
      day.autoAccommodation = false;
      syncAutoStarts();
      saveState();
    }
  });
  input.addEventListener('blur', () => {
    render();
  });

  const memoComponent = createMemoComponent({
    memo: accommodationMemo,
    onSave: (newMemo) => {
      const day = state.days[dayIndex];
      if (day) {
        day.accommodationMemo = newMemo;
        saveState();
      }
    },
  });

  const controls = document.createElement('div');
  controls.className = 'mt-2 flex items-center justify-between gap-2';

  const badge = document.createElement('span');
  badge.className = 'rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600';
  badge.textContent = '宿泊地';

  const hint = document.createElement('span');
  hint.className = 'flex-1 text-xs text-slate-500';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition-colors duration-75 hover:bg-slate-300 hover:text-slate-900 cursor-pointer';
  removeBtn.textContent = '削除';
  removeBtn.setAttribute('aria-label', '宿泊地を削除');
  removeBtn.setAttribute('data-tooltip', '宿泊地を削除');
  removeBtn.setAttribute('data-tooltip-pos', 'top');
  removeBtn.addEventListener('click', () => {
    const day = state.days[dayIndex];
    if (day) {
      day.accommodation = '';
      day.accommodationMemo = '';
      day.autoAccommodation = false;
      syncAutoStarts();
    }
    state.openRouteMenuIndex = null;
    saveState();
    render();
  });

  controls.append(badge, hint, removeBtn);
  content.append(input, memoComponent, controls);
  row.append(spacer, marker, content);
  card.appendChild(row);
  return card;
}

function createEndpointCard(
  location: string,
  index: number,
  label: '出発地点' | '到着地点',
  dayIndex = state.activeDayIndex,
  endpointMemo = ''
): HTMLElement {
  const card = document.createElement('div');
  card.className =
    'relative rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs transition-colors duration-75 hover:border-slate-300 hover:shadow-sm sm:p-4';
  card.dataset.spotCard = 'true';

  card.addEventListener('dragover', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    card.classList.add('border-slate-800', 'bg-slate-100');
  });
  card.addEventListener('dragleave', (e) => {
    if (card.contains(e.relatedTarget as Node)) return;
    card.classList.remove('border-slate-800', 'bg-slate-100');
  });
  card.addEventListener('drop', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    card.classList.remove('border-slate-800', 'bg-slate-100');
    const fromDayIndex = draggedSpot.dayIndex;
    const fromIndex = draggedSpot.index;
    const targetIndex = label === '出発地点' ? 0 : state.days[dayIndex].spots.length;
    moveSpotTo(fromDayIndex, fromIndex, dayIndex, targetIndex);
  });

  const row = document.createElement('div');
  row.className = 'flex items-start gap-3';

  const spacer = document.createElement('div');
  spacer.className =
    'mt-2 flex h-6 w-5 shrink-0 items-center justify-center text-slate-300 select-none text-xs';
  spacer.setAttribute('aria-hidden', 'true');

  const marker = document.createElement('div');
  marker.className =
    'mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white';
  marker.textContent = String(index + 1);

  const content = document.createElement('div');
  content.className = 'w-full';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = location;
  input.placeholder = `${label}を入力`;
  input.className =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors duration-75 focus:border-slate-900 focus:ring-2 focus:ring-slate-200';
  input.addEventListener('input', (e) => {
    if (label === '出発地点') {
      state.departure = (e.target as HTMLInputElement).value;
      if (departureInputEl) departureInputEl.value = state.departure;
    } else if (label === '到着地点') {
      state.arrival = (e.target as HTMLInputElement).value;
      state.autoArrival = false;
    }
    saveState();
  });
  input.addEventListener('blur', () => {
    render();
  });

  const memoComponent = createMemoComponent({
    memo: endpointMemo,
    onSave: (newMemo) => {
      if (label === '出発地点') {
        state.departureMemo = newMemo;
      } else if (label === '到着地点') {
        state.arrivalMemo = newMemo;
      }
      saveState();
    },
  });

  const controls = document.createElement('div');
  controls.className = 'mt-2 flex items-center justify-between gap-2';

  const badge = document.createElement('span');
  badge.className = 'rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600';
  badge.textContent = label;

  const hint = document.createElement('span');
  hint.className = 'flex-1 text-xs text-slate-500';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition-colors duration-75 hover:bg-slate-300 hover:text-slate-900 cursor-pointer';
  removeBtn.textContent = '削除';
  removeBtn.setAttribute('aria-label', `${label}を削除`);
  removeBtn.setAttribute('data-tooltip', `${label}を削除`);
  removeBtn.setAttribute('data-tooltip-pos', 'top');
  removeBtn.addEventListener('click', () => {
    if (label === '出発地点') {
      if (state.autoArrival) {
        state.arrival = state.departure;
        state.arrivalMemo = state.departureMemo || '';
        state.autoArrival = false;
      }
      state.departure = '';
      state.departureMemo = '';
      if (departureInputEl) departureInputEl.value = '';
    } else if (label === '到着地点') {
      state.arrival = '';
      state.arrivalMemo = '';
      state.autoArrival = false;
    }
    state.openRouteMenuIndex = null;
    saveState();
    render();
  });

  controls.append(badge, hint, removeBtn);
  content.append(input, memoComponent, controls);
  row.append(spacer, marker, content);
  card.appendChild(row);
  return card;
}

function createRouteConnector(
  from: string,
  to: string,
  _routeIndex: number,
  _dayIndex = state.activeDayIndex
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'relative z-0 flex flex-col items-center py-3';

  const line = document.createElement('div');
  line.className =
    'pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-slate-200';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('data-route-btn', 'true');
  const mapLabel = state.mapType === 'apple' ? 'Apple' : 'Google';
  btn.className =
    'relative z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition-all duration-75 hover:scale-105 hover:border-slate-900 hover:bg-slate-900 hover:text-white hover:shadow-md cursor-pointer active:scale-95 select-none';
  btn.innerHTML = '<i data-lucide="route" class="h-3.5 w-3.5"></i>ルート';
  btn.setAttribute('data-tooltip', `${mapLabel}でルートを開く`);
  btn.setAttribute('data-tooltip-pos', 'bottom');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!from.trim() || !to.trim()) {
      showToast('前後の地点名を入力してください。');
      return;
    }
    openRoute(from, to, state.mapType || 'google');
  });

  wrap.append(line, btn);
  return wrap;
}

function createDayTimeline(day: Day, dayIndex: number): HTMLElement {
  const isLastDay = dayIndex === state.days.length - 1;
  const details = document.createElement('details');
  details.id = `day-section-${dayIndex}`;
  details.dataset.dayIndex = String(dayIndex);
  details.className = `border-t border-slate-200 py-2 first:border-t-0 first:pt-0 ${
    isLastDay ? 'min-h-[calc(100vh-var(--total-sticky-height,150px)-2rem)]' : ''
  }`;
  details.style.scrollMarginTop = 'calc(var(--total-sticky-height, 150px) + 8px)';
  details.open = !collapsedDays.has(dayIndex);

  const summary = document.createElement('summary');
  summary.className =
    'sticky z-20 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/95 px-3 py-2.5 backdrop-blur-sm shadow-xs transition-colors duration-75 hover:bg-slate-50';
  summary.style.top = 'calc(var(--total-sticky-height, 150px) + 8px)';
  summary.style.listStyle = 'none';

  const chevronWrap = document.createElement('div');
  chevronWrap.className = 'flex shrink-0 items-center gap-1.5 text-slate-400 py-1';

  const chevron = document.createElement('i');
  chevron.setAttribute('data-lucide', 'chevron-down');
  chevron.className = 'h-4 w-4 shrink-0 text-slate-400 day-chevron';
  chevronWrap.appendChild(chevron);

  const items = getDayItems(day, dayIndex, state);

  const routeSummary = document.createElement('div');
  routeSummary.className = `min-w-0 flex-1 overflow-hidden ${details.open ? 'hidden' : ''}`;

  const routeLocations = items.map((item) => (item.value || '').trim()).filter(Boolean);
  if (routeLocations.length > 0) {
    const routeText = document.createElement('span');
    routeText.className = 'block truncate text-xs font-normal text-slate-500';
    routeText.textContent = routeLocations.join(' → ');
    routeText.title = routeLocations.join(' → ');
    routeSummary.appendChild(routeText);
  }

  const heading = document.createElement(items.length < 2 ? 'h2' : 'a');
  heading.className =
    items.length < 2
      ? 'shrink-0 text-lg font-bold text-slate-800'
      : 'shrink-0 text-lg font-bold text-slate-900 transition-colors duration-75 hover:text-slate-600 hover:underline inline-flex items-center gap-1.5 cursor-pointer';
  heading.textContent = day.name;

  if (items.length >= 2) {
    const mapLabel = state.mapType === 'apple' ? 'Apple' : 'Google';
    (heading as HTMLAnchorElement).href = getDayRouteUrl(
      items.map((item) => item.value),
      state.mapType
    );
    (heading as HTMLAnchorElement).target = '_blank';
    (heading as HTMLAnchorElement).rel = 'noopener noreferrer';
    heading.setAttribute('data-tooltip', `${mapLabel}でこの日のルートを開く`);
    heading.setAttribute('data-tooltip-pos', 'bottom');
    heading.addEventListener('click', (e) => e.stopPropagation());

    const extIcon = document.createElement('i');
    extIcon.setAttribute('data-lucide', 'external-link');
    extIcon.className = 'h-4 w-4 text-slate-400 shrink-0';
    heading.appendChild(extIcon);
  }

  details.addEventListener('toggle', () => {
    if (details.open) {
      collapsedDays.delete(dayIndex);
    } else {
      collapsedDays.add(dayIndex);
    }
    routeSummary.classList.toggle('hidden', details.open);
  });

  details.addEventListener('click', () => {
    if (state.activeDayIndex !== dayIndex) {
      state.activeDayIndex = dayIndex;
      saveState();
      renderAddSpotOptions();
      renderTabs();
    }
  });

  summary.append(chevronWrap, routeSummary, heading);
  summary.addEventListener('dragover', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    summary.classList.add('ring-2', 'ring-slate-900');
  });
  summary.addEventListener('dragleave', (e) => {
    if (summary.contains(e.relatedTarget as Node)) return;
    summary.classList.remove('ring-2', 'ring-slate-900');
  });
  summary.addEventListener('drop', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    summary.classList.remove('ring-2', 'ring-slate-900');
    details.open = true;
    collapsedDays.delete(dayIndex);
    const fromDayIndex = draggedSpot.dayIndex;
    const fromIndex = draggedSpot.index;
    moveSpotTo(fromDayIndex, fromIndex, dayIndex, state.days[dayIndex].spots.length);
  });
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = `pt-2 ${isLastDay ? 'pb-20' : ''}`;

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className =
      'rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 transition-colors duration-75';
    empty.textContent =
      'まだスポットがありません。上の入力から追加するか、スポットをここにドラッグ＆ドロップしてください。';
    empty.addEventListener('dragover', (e) => {
      if (!draggedSpot) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      empty.classList.add('border-slate-800', 'bg-slate-100');
    });
    empty.addEventListener('dragleave', (e) => {
      if (empty.contains(e.relatedTarget as Node)) return;
      empty.classList.remove('border-slate-800', 'bg-slate-100');
    });
    empty.addEventListener('drop', (e) => {
      if (!draggedSpot) return;
      e.preventDefault();
      empty.classList.remove('border-slate-800', 'bg-slate-100');
      const fromDayIndex = draggedSpot.dayIndex;
      const fromIndex = draggedSpot.index;
      moveSpotTo(fromDayIndex, fromIndex, dayIndex, 0);
    });
    body.appendChild(empty);
    details.appendChild(body);
    return details;
  }

  items.forEach((item, index) => {
    if (item.type === 'spot') {
      body.appendChild(createSpotCard(item.value, item.spotIndex, index, dayIndex, item.memo));
    } else if (item.type === 'accommodation') {
      body.appendChild(createAccommodationCard(item.value, index, dayIndex, item.memo));
    } else {
      body.appendChild(createEndpointCard(item.value, index, item.label, dayIndex, item.memo));
    }
    if (index < items.length - 1) {
      body.appendChild(createRouteConnector(item.value, items[index + 1].value, index, dayIndex));
    }
  });

  const dropZone = document.createElement('div');
  dropZone.className =
    'h-8 rounded-xl border border-dashed border-transparent transition-colors duration-75 mt-2 flex items-center justify-center text-xs text-slate-400';
  dropZone.dataset.dropZone = 'true';
  dropZone.addEventListener('dragover', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dropZone.classList.remove('border-transparent');
    dropZone.classList.add('border-slate-400', 'bg-slate-100', 'text-slate-600');
    dropZone.textContent = 'この日の末尾に追加';
  });
  dropZone.addEventListener('dragleave', (e) => {
    if (dropZone.contains(e.relatedTarget as Node)) return;
    dropZone.classList.remove('border-slate-400', 'bg-slate-100', 'text-slate-600');
    dropZone.classList.add('border-transparent');
    dropZone.textContent = '';
  });
  dropZone.addEventListener('drop', (e) => {
    if (!draggedSpot) return;
    e.preventDefault();
    dropZone.classList.remove('border-slate-400', 'bg-slate-100', 'text-slate-600');
    dropZone.classList.add('border-transparent');
    dropZone.textContent = '';
    const fromDayIndex = draggedSpot.dayIndex;
    const fromIndex = draggedSpot.index;
    moveSpotTo(fromDayIndex, fromIndex, dayIndex, state.days[dayIndex].spots.length);
  });
  body.appendChild(dropZone);

  details.appendChild(body);
  return details;
}

function renderTimeline(): void {
  timelineEl.innerHTML = '';
  state.days.forEach((day, index) => {
    timelineEl.appendChild(createDayTimeline(day, index));
  });
}

function renderEndpoints(): void {
  if (endpointSectionEl) endpointSectionEl.classList.add('hidden');
  if (departureFieldEl) departureFieldEl.classList.add('hidden');
  if (departureInputEl) departureInputEl.value = state.departure;
  if (accommodationSectionEl) accommodationSectionEl.classList.add('hidden');
}

function renderAccommodation(): void {
  if (!accommodationInputEl) return;
  const day = state.days[state.activeDayIndex];
  accommodationInputEl.value = day ? day.accommodation : '';
  const allDays = state.accommodationUpdateScope === 'all';
  accommodationScopeAllEl.setAttribute('aria-pressed', String(allDays));
  accommodationScopeNextDayEl.setAttribute('aria-pressed', String(!allDays));
  accommodationScopeAllEl.style.backgroundColor = allDays ? '#18181b' : '#ffffff';
  accommodationScopeAllEl.style.borderColor = allDays ? '#18181b' : '#d4d4d8';
  accommodationScopeAllEl.style.color = allDays ? '#ffffff' : '#3f3f46';
  accommodationScopeNextDayEl.style.backgroundColor = allDays ? '#ffffff' : '#18181b';
  accommodationScopeNextDayEl.style.borderColor = allDays ? '#d4d4d8' : '#18181b';
  accommodationScopeNextDayEl.style.color = allDays ? '#3f3f46' : '#ffffff';
}

function updateActiveDayFromScroll(): void {
  if (isScrollingToTab) return;
  const sections = [...document.querySelectorAll<HTMLElement>('[data-day-index]')];
  if (sections.length === 0) return;

  const panelRect = lpSlotWrapperEl ? lpSlotWrapperEl.getBoundingClientRect() : null;
  const targetY = panelRect ? Math.round(panelRect.bottom + 16) : 140;
  let currentSection: HTMLElement | null = null;

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= targetY && rect.bottom > targetY) {
      currentSection = section;
      break;
    }
  }

  if (!currentSection) {
    currentSection = sections.reduce((closest, section) => {
      const rect = section.getBoundingClientRect();
      const closestRect = closest.getBoundingClientRect();
      return Math.abs(rect.top - targetY) < Math.abs(closestRect.top - targetY) ? section : closest;
    });
  }

  const dayIndex = Number(currentSection.dataset.dayIndex);
  if (dayIndex !== state.activeDayIndex) {
    state.activeDayIndex = dayIndex;
    renderAddSpotOptions();
    renderTabs();
  }
}

function updateItineraryVisibility(): void {
  const showItinerary = isTripConfirmed;

  // LP要素の表示・非表示
  const lpElements = [lpHeroSectionEl, lpFeaturesSectionEl, lpSamplesSectionEl, tripConfirmContainerEl].filter(
    Boolean
  ) as HTMLElement[];

  lpElements.forEach((el) => {
    el.classList.toggle('hidden', showItinerary);
    if (!showItinerary) {
      el.classList.remove('lp-leaving');
    }
  });

  if (appHeaderContainerEl) {
    appHeaderContainerEl.classList.toggle('hidden', !showItinerary);
  }

  // メインカードのレイアウト（LP時は人間工学的中央、アプリ時は通常カード）
  if (mainCardEl) {
    if (showItinerary) {
      mainCardEl.className =
        'rounded-2xl border border-slate-200 bg-white shadow-sm block p-0 transition-all duration-300';
    } else {
      mainCardEl.className =
        'rounded-3xl border border-slate-200/80 bg-white shadow-xs min-h-[82vh] flex flex-col items-center justify-center p-5 pb-20 sm:p-10 sm:pb-28 transition-all duration-300';
    }
  }

  // 一体型スマートパネルのスタイル調整（アプリ時はstickyかつ左寄せ）
  if (lpSlotWrapperEl) {
    if (showItinerary) {
      lpSlotWrapperEl.className = 'w-full p-3.5 sm:px-6 sm:py-4 is-sticky transition-all duration-300';
    } else {
      lpSlotWrapperEl.className = 'w-full max-w-xl mx-auto my-1 transition-all duration-300';
      lpSlotWrapperEl.classList.remove('scrolled');
    }
  }

  // 旅行名コンテナ（アプリ表示時は左寄せ app-mode クラスを付与）
  if (tripComboboxContainerEl) {
    tripComboboxContainerEl.classList.toggle('app-mode', showItinerary);
  }

  // 一体型パネル内のスポット追加フォームの表示・非表示
  if (addSpotFormEl) {
    addSpotFormEl.classList.toggle('hidden', !showItinerary);
  }

  // 日程セクションと固定日程タブ・マップセレクター
  if (itinerarySectionEl) {
    itinerarySectionEl.classList.toggle('hidden', !showItinerary);
  }
  if (dayTabsEl) {
    dayTabsEl.classList.toggle('hidden', !showItinerary);
    dayTabsEl.classList.toggle('flex', showItinerary);
    if (!showItinerary) {
      dayTabsEl.style.opacity = '';
      dayTabsEl.style.pointerEvents = '';
    }
  }
  if (headerMapSelectorEl) {
    headerMapSelectorEl.classList.toggle('hidden', !showItinerary);
    headerMapSelectorEl.classList.toggle('flex', showItinerary);
  }

  updateStickyOffsets();
}

function render(): void {
  ensureValidState();
  syncAutoStarts();
  if (state.autoArrival) {
    state.arrival = state.departure;
  }
  if (tripNameInputEl) {
    tripNameInputEl.value = state.tripName;
  }
  updateItineraryVisibility();
  updateStickyOffsets();
  renderTripSwitcher();
  renderTabs();
  renderAddSpotOptions();
  renderTimeline();
  renderEndpoints();
  renderAccommodation();
  updateMapTypeUI();
  refreshIcons();
}

function flushAccommodationSync(
  shouldRender = true,
  sourceDayIndex?: number,
  sourceValue?: string
): void {
  const hasExplicitSource = sourceDayIndex !== undefined && sourceValue !== undefined;
  if (!hasExplicitSource && pendingAccommodationSync) {
    sourceDayIndex = pendingAccommodationSync.dayIndex;
    sourceValue = pendingAccommodationSync.value;
  }
  if (sourceDayIndex === undefined) sourceDayIndex = state.activeDayIndex;
  if (sourceValue === undefined) sourceValue = accommodationInputEl.value;
  if (accommodationDebounceId) {
    clearTimeout(accommodationDebounceId);
    accommodationDebounceId = null;
  }
  pendingAccommodationSync = null;
  if (state.days[sourceDayIndex]) {
    state.days[sourceDayIndex].accommodation = sourceValue;
  }
  syncAutoStarts();
  saveState();
  if (shouldRender) {
    render();
  }
}

function scheduleAccommodationSync(dayIndex: number, accommodationValue: string): void {
  if (accommodationDebounceId) {
    clearTimeout(accommodationDebounceId);
  }
  pendingAccommodationSync = { dayIndex, value: accommodationValue };
  accommodationDebounceId = setTimeout(() => {
    if (pendingAccommodationSync && state.days[pendingAccommodationSync.dayIndex]) {
      state.days[pendingAccommodationSync.dayIndex].accommodation = pendingAccommodationSync.value;
    }
    accommodationDebounceId = null;
    pendingAccommodationSync = null;
    syncAutoStarts();
    saveState();
    if (state.activeDayIndex === dayIndex) {
      render();
    }
  }, 180);
}

// ツールチップ制御
let activeTooltipTarget: HTMLElement | null = null;

function getOrCreateTooltip(): HTMLElement {
  let el = document.getElementById('app-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-tooltip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span id="app-tooltip-text"></span><div id="app-tooltip-arrow"></div>';
    document.body.appendChild(el);
  }
  return el;
}

function showGlobalTooltip(target: HTMLElement): void {
  if (!target) return;
  const text = target.getAttribute('data-tooltip');
  if (!text) {
    hideGlobalTooltip();
    return;
  }

  const el = getOrCreateTooltip();
  const textEl = el.querySelector('#app-tooltip-text') as HTMLSpanElement;
  const arrowEl = el.querySelector('#app-tooltip-arrow') as HTMLDivElement;

  textEl.textContent = text;
  const pos = target.getAttribute('data-tooltip-pos') || 'bottom';
  const rect = target.getBoundingClientRect();

  el.style.left = '-9999px';
  el.style.top = '-9999px';

  const tipWidth = el.offsetWidth;
  const tipHeight = el.offsetHeight;

  let left = 0;
  let top = 0;

  arrowEl.style.top = '';
  arrowEl.style.bottom = '';
  arrowEl.style.left = '';
  arrowEl.style.right = '';
  arrowEl.style.transform = '';
  arrowEl.style.borderTopColor = 'transparent';
  arrowEl.style.borderBottomColor = 'transparent';
  arrowEl.style.borderLeftColor = 'transparent';
  arrowEl.style.borderRightColor = 'transparent';

  if (pos === 'left') {
    left = rect.left - tipWidth - 8;
    top = rect.top + (rect.height - tipHeight) / 2;
    arrowEl.style.right = '-8px';
    arrowEl.style.top = '50%';
    arrowEl.style.transform = 'translateY(-50%)';
    arrowEl.style.borderLeftColor = '#e2e8f0';
  } else if (pos === 'top') {
    left = rect.left + (rect.width - tipWidth) / 2;
    top = rect.top - tipHeight - 8;
    arrowEl.style.bottom = '-8px';
    arrowEl.style.left = '50%';
    arrowEl.style.transform = 'translateX(-50%)';
    arrowEl.style.borderTopColor = '#e2e8f0';
  } else {
    left = rect.left + (rect.width - tipWidth) / 2;
    top = rect.bottom + 8;
    arrowEl.style.top = '-8px';
    arrowEl.style.left = '50%';
    arrowEl.style.transform = 'translateX(-50%)';
    arrowEl.style.borderBottomColor = '#e2e8f0';
  }

  const pad = 8;
  left = Math.max(pad, Math.min(window.innerWidth - tipWidth - pad, left));
  top = Math.max(pad, Math.min(window.innerHeight - tipHeight - pad, top));

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.classList.add('is-visible');
}

function hideGlobalTooltip(): void {
  const el = document.getElementById('app-tooltip');
  if (el) {
    el.classList.remove('is-visible');
  }
  activeTooltipTarget = null;
}

function transitionToApp(onComplete: () => void): void {
  const lpElements = [lpHeroSectionEl, lpFeaturesSectionEl, lpSamplesSectionEl, tripConfirmContainerEl].filter(
    Boolean
  ) as HTMLElement[];

  // Phase 1: LP要素のみをフェードアウト（親レイアウトは変えず、その場でスッと消す）
  lpElements.forEach((el) => el.classList.add('lp-leaving'));

  // 320ms後にLP要素が消えたタイミングでPhase 2（DOM切り替え＆FLIPアニメーション）
  setTimeout(() => {
    // 遷移前の旅行名バー（lpSlotWrapperEl）の絶対座標を記録
    const firstRect = lpSlotWrapperEl ? lpSlotWrapperEl.getBoundingClientRect() : null;
    const initialCardHeight = mainCardEl ? mainCardEl.offsetHeight : null;

    // カードの急激な高さ潰れを防ぐため一時的に現在の高さをminHeightに設定
    if (mainCardEl && initialCardHeight) {
      mainCardEl.style.minHeight = `${initialCardHeight}px`;
    }

    // DOM状態をアプリモードへ更新
    onComplete();

    // DaysTag（日程タグ）は一番最後に表示するため、一旦非表示にしておく
    if (dayTabsEl) {
      dayTabsEl.style.opacity = '0';
      dayTabsEl.style.pointerEvents = 'none';
    }

    // 遷移後の旅行名バーの絶対座標を記録
    const lastRect = lpSlotWrapperEl ? lpSlotWrapperEl.getBoundingClientRect() : null;

    // FLIP: Y方向の移動差分を計算して滑らかにスライド
    if (lpSlotWrapperEl && firstRect && lastRect) {
      const deltaY = firstRect.top - lastRect.top;
      if (Math.abs(deltaY) > 1) {
        lpSlotWrapperEl.style.transition = 'none';
        lpSlotWrapperEl.style.transform = `translateY(${deltaY}px)`;

        // reflow を強制して初期transformを確実にブラウザに認識させる
        void lpSlotWrapperEl.offsetHeight;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (lpSlotWrapperEl) {
              lpSlotWrapperEl.style.transition = 'transform 1100ms cubic-bezier(0.45, 0.05, 0.2, 1)';
              lpSlotWrapperEl.style.transform = '';
            }
          });
        });
      }
    }

    // Phase 3: アプリ要素の入場アニメーション
    if (appHeaderContainerEl) {
      appHeaderContainerEl.classList.add('header-entering');
    }
    if (itinerarySectionEl) {
      itinerarySectionEl.classList.add('app-entering');
    }
    if (addSpotFormEl) {
      addSpotFormEl.classList.add('form-entering');
    }

    // Phase 4: 画面の遷移が完全に終わり、一呼吸おいたタイミング（1300ms後）で日程タグ（DaysTag）をゆっくり順次出現
    setTimeout(() => {
      if (dayTabsEl) {
        dayTabsEl.style.opacity = '';
        dayTabsEl.style.pointerEvents = '';
        animateDayTabsStagger();
      }
    }, 1300);

    // アニメーション完了後のクリーンアップ (3400ms)
    setTimeout(() => {
      if (lpSlotWrapperEl) {
        lpSlotWrapperEl.style.transition = '';
        lpSlotWrapperEl.style.transform = '';
      }
      if (mainCardEl) {
        mainCardEl.style.minHeight = '';
      }
      if (dayTabsEl) {
        dayTabsEl.style.opacity = '';
        dayTabsEl.style.pointerEvents = '';
      }
      appHeaderContainerEl?.classList.remove('header-entering');
      itinerarySectionEl?.classList.remove('app-entering');
      addSpotFormEl?.classList.remove('form-entering');
      lpElements.forEach((el) => el.classList.remove('lp-leaving'));
      isTransitioningToApp = false;
      updateStickyOffsets();
    }, 3400);
  }, 320);
}

function confirmTrip(): void {
  if (isTransitioningToApp) return;

  const inputVal = (tripNameInputEl?.value || state.tripName || '').trim();
  if (!inputVal) {
    if (tripNameInputEl) {
      tripNameInputEl.focus();
    }
    return;
  }

  state.tripName = inputVal;
  saveState();

  if (tripSwitcherEl) {
    const activeOption = tripSwitcherEl.querySelector(`option[value="${tripStore.activeTripId}"]`);
    if (activeOption) {
      const index = tripStore.trips.findIndex((t) => t.id === tripStore.activeTripId);
      activeOption.textContent = state.tripName;
    }
  }

  // LPからの初回遷移時はアニメーションを適用
  if (!isTripConfirmed) {
    isTransitioningToApp = true;
    transitionToApp(() => {
      isTripConfirmed = true;
      saveState();
      updateItineraryVisibility();
      render();
    });
  } else {
    // すでにアプリモードでの編集時は即時反映
    updateItineraryVisibility();
    render();
  }
}

// イベントリスナー設定
function setupEventListeners(): void {
  addSpotFormEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    addSpot();
  });

  if (tripNameInputEl) {
    tripNameInputEl.addEventListener('input', (e) => {
      state.tripName = (e.target as HTMLInputElement).value;
      saveState();
      // 入力中は updateItineraryVisibility() を呼ばず画面遷移を防ぐ
      if (isTripConfirmed) {
        if (tripSwitcherEl) {
          const activeOption = tripSwitcherEl.querySelector(`option[value="${tripStore.activeTripId}"]`);
          if (activeOption) {
            const index = tripStore.trips.findIndex((t) => t.id === tripStore.activeTripId);
            activeOption.textContent = state.tripName.trim() ? state.tripName : `旅行${index + 1}（名称未設定）`;
          }
        }
      }
      if (isTripMenuOpen) {
        renderTripComboboxMenu();
      }
    });
    tripNameInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleTripMenu(false);
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        confirmTrip();
      }
    });
  }

  tripConfirmBtnEl?.addEventListener('click', () => {
    confirmTrip();
  });

  document.querySelectorAll<HTMLElement>('[data-sample-trip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.sampleTrip;
      if (val && tripNameInputEl) {
        tripNameInputEl.value = val;
        confirmTrip();
      }
    });
  });


  if (tripComboboxToggleEl) {
    tripComboboxToggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTripMenu();
    });
  }

  document.addEventListener('click', (e) => {
    if (!tripComboboxContainerEl) return;
    if (!tripComboboxContainerEl.contains(e.target as Node)) {
      toggleTripMenu(false);
    }
  });

  if (tripSwitcherEl) {
    tripSwitcherEl.addEventListener('change', (e) => {
      saveState();
      tripStore.activeTripId = (e.target as HTMLSelectElement).value;
      tripStore.applyActiveTripToState(state);
      syncCollabStateWithActiveTrip();
      isTripConfirmed = Boolean(state.tripName && state.tripName.trim().length > 0);
      saveState(false);
      render();
    });
  }

  if (tripNewBtnEl) {
    tripNewBtnEl.addEventListener('click', createNewTrip);
  }

  if (tripDeleteBtnEl) {
    tripDeleteBtnEl.addEventListener('click', () => {
      deleteTrip(tripStore.activeTripId);
    });
  }

  addTypeDepartureEl?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    state.addLocationType = checked ? 'departure' : 'spot';
    renderAddSpotOptions();
  });

  addTypeAccommodationEl?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    state.addLocationType = checked ? 'accommodation' : 'spot';
    renderAddSpotOptions();
  });

  addAccommodationScopeAllEl?.addEventListener('click', () => {
    state.addAccommodationScope = 'all';
    renderAddSpotOptions();
  });

  addAccommodationScopeTodayEl?.addEventListener('click', () => {
    state.addAccommodationScope = 'today';
    renderAddSpotOptions();
  });

  accommodationInputEl?.addEventListener('input', (e) => {
    const dayIndex = state.activeDayIndex;
    const day = state.days[dayIndex];
    const nextNextDay = state.days[dayIndex + 2];
    const nextNextAccommodation = nextNextDay ? nextNextDay.accommodation : '';
    day.accommodation = (e.target as HTMLInputElement).value;
    day.autoAccommodation = false;

    if (state.accommodationUpdateScope === 'all') {
      for (let i = dayIndex + 1; i < state.days.length; i++) {
        state.days[i].autoAccommodation = true;
      }
    } else {
      const nextDay = state.days[dayIndex + 1];
      if (nextDay) {
        nextDay.autoAccommodation = true;
      }
      if (nextNextDay) {
        nextNextDay.accommodation = nextNextAccommodation;
        nextNextDay.autoAccommodation = false;
      }
    }
    syncAutoStarts();
    saveState();
    scheduleAccommodationSync(state.activeDayIndex, (e.target as HTMLInputElement).value);
  });

  departureInputEl?.addEventListener('input', (e) => {
    state.departure = (e.target as HTMLInputElement).value;
    state.arrival = (e.target as HTMLInputElement).value;
    state.autoArrival = true;
    saveState();
    renderTimeline();
  });

  accommodationScopeAllEl?.addEventListener('click', () => {
    state.accommodationUpdateScope = 'all';
    renderAccommodation();
  });

  accommodationScopeNextDayEl?.addEventListener('click', () => {
    state.accommodationUpdateScope = 'next-day';
    renderAccommodation();
  });

  accommodationInputEl?.addEventListener('blur', () => {
    flushAccommodationSync(true, state.activeDayIndex, accommodationInputEl.value);
  });

  function handleScroll(): void {
    updateActiveDayFromScroll();
    if (lpSlotWrapperEl && isTripConfirmed) {
      const isScrolled = window.scrollY > 15;
      lpSlotWrapperEl.classList.toggle('scrolled', isScrolled);
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', updateStickyOffsets, { passive: true });
  window.addEventListener('keydown', (e) => {
    const isZ = e.key === 'z' || e.key === 'Z';
    const isUndoKey = (e.ctrlKey || e.metaKey) && isZ && !e.shiftKey;
    if (isUndoKey) {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isEditable =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (!isEditable && dayUndoStack.length > 0) {
        e.preventDefault();
        undoDeleteDay();
      }
    }
  });

  document.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null;
    if (!target || !target.getAttribute('data-tooltip')) {
      if (activeTooltipTarget) hideGlobalTooltip();
      return;
    }
    if (target === activeTooltipTarget) return;
    activeTooltipTarget = target;
    showGlobalTooltip(target);
  });

  document.addEventListener('mouseout', (e) => {
    const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null;
    if (target && target === activeTooltipTarget) {
      const related = e.relatedTarget
        ? ((e.relatedTarget as HTMLElement).closest('[data-tooltip]') as HTMLElement | null)
        : null;
      if (related === activeTooltipTarget) return;
      hideGlobalTooltip();
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (activeTooltipTarget) {
        showGlobalTooltip(activeTooltipTarget);
      }
    },
    { passive: true }
  );

  document.addEventListener('click', () => {
    hideGlobalTooltip();
  });

  document.querySelectorAll<HTMLInputElement>('input[name="map-type-radio"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if ((e.target as HTMLInputElement).checked) {
        setMapType((e.target as HTMLInputElement).value as MapType);
      }
    });
  });
}

// アプリ初期化
export function init(): void {
  tripStore.load();

  // 1. URLパス判定（/p/[planId] アクセス時）
  const initialPlan = typeof window !== 'undefined' ? (window as any).__INITIAL_PLAN__ : null;
  const pathMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/p\/([^/]+)/) : null;
  const urlPlanId = initialPlan ? initialPlan.id : pathMatch && pathMatch[1] ? pathMatch[1] : null;

  if (urlPlanId) {
    // 共有URLから開いた場合: ローカル3件枠に紐付け・同期
    const existingIndex = tripStore.trips.findIndex((t) => t.shareId === urlPlanId);
    if (existingIndex >= 0) {
      tripStore.activeTripId = tripStore.trips[existingIndex].id;
    } else {
      // 3件枠の先頭に新しく登録
      const newTripEntry = createTripEntry(initialPlan?.title || '');
      newTripEntry.shareId = urlPlanId;
      tripStore.trips.unshift(newTripEntry);
      if (tripStore.trips.length > MAX_TRIPS) {
        tripStore.trips = tripStore.trips.slice(0, MAX_TRIPS);
      }
      tripStore.activeTripId = newTripEntry.id;
    }

    if (initialPlan) {
      collabManager.initFromPlan(initialPlan);
      tripStore.applyActiveTripToState(state);
      if (initialPlan.data) {
        Object.assign(state, initialPlan.data);
        if (initialPlan.title) state.tripName = initialPlan.title;
      }
      state.shareId = urlPlanId;
      isTripConfirmed = true;
      showToast(`「${initialPlan.title || '共有プラン'}」を開きました（共同編集可能）`);
    } else {
      // クライアントサイドフェッチ
      tripStore.applyActiveTripToState(state);
      state.shareId = urlPlanId;
      collabManager.initFromPlan({
        id: urlPlanId,
        title: state.tripName,
        data: state,
        version: 1,
        createdAt: '',
        updatedAt: '',
      });
      collabManager.fetchLatest().then((plan) => {
        if (plan) {
          collabManager.initFromPlan(plan);
          if (plan.data) {
            Object.assign(state, plan.data);
            if (plan.title) state.tripName = plan.title;
          }
          state.shareId = urlPlanId;
          isTripConfirmed = true;
          ensureValidState();
          syncAutoStarts();
          saveState(false);
          render();
          showToast(`「${plan.title || '共有プラン'}」を開きました`);
        }
      });
    }
  } else {
    // トップページ（/）または従来のクエリ共有URLアクセス時
    const rawShareData = extractDataFromUrl();
    const sharedTrip = rawShareData ? parseShareUrlData(rawShareData) : null;

    if (sharedTrip) {
      const existingIndex = tripStore.trips.findIndex((t) => t.id === sharedTrip.id);
      if (existingIndex >= 0) {
        tripStore.trips[existingIndex] = sharedTrip;
      } else {
        tripStore.trips.unshift(sharedTrip);
        if (tripStore.trips.length > MAX_TRIPS) {
          tripStore.trips = tripStore.trips.slice(0, MAX_TRIPS);
        }
      }
      tripStore.activeTripId = sharedTrip.id;
      tripStore.applyActiveTripToState(state);
      isTripConfirmed = true;
      showToast('共有された旅行プランを読み込みました！');
    } else {
      tripStore.applyActiveTripToState(state);
      isTripConfirmed = Boolean(state.tripName && state.tripName.trim().length > 0);
    }

    if (state.shareId) {
      collabManager.initFromPlan({
        id: state.shareId,
        title: state.tripName,
        data: state,
        version: 1,
        createdAt: '',
        updatedAt: '',
      });
      collabManager.fetchLatest().then((plan) => {
        if (plan && plan.data) {
          let planData = plan.data;
          if (typeof planData === 'string') {
            try {
              planData = JSON.parse(planData);
            } catch {}
          }
          if (planData && typeof planData === 'object') {
            Object.assign(state, planData);
            if (plan.title) state.tripName = plan.title;
            state.shareId = plan.id;
            ensureValidState();
            syncAutoStarts();
            saveState(false);
            render();
          }
        }
      });
    } else {
      collabManager.reset();
    }
  }

  ensureValidState();
  syncAutoStarts();
  saveState(false);
  setupEventListeners();
  render();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
