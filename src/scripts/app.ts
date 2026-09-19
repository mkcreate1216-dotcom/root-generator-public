import {
  createIcons,
  Map as MapIcon,
  ChevronDown,
  Plus,
  X,
  Check,
  ArrowUp,
  ArrowDown,
  Route,
  ExternalLink,
  Share2,
} from 'lucide';
import type { AppState, Day, MapType } from './types';
import {
  TripStore,
  MAP_TYPE_STORAGE_KEY,
  MAX_TRIPS,
  createDay,
  getStoredMapType,
} from './storage';
import { getDayRouteUrl, openRoute } from './maps';
import { copyShareItinerary, getDayItems, showToast } from './share';
import { animateSpotReorder } from './flip';

function refreshIcons(_root?: HTMLElement): void {
  createIcons({
    icons: {
      Map: MapIcon,
      ChevronDown,
      Plus,
      X,
      Check,
      ArrowUp,
      ArrowDown,
      Route,
      ExternalLink,
      Share2,
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
  arrival: '',
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
const dayUndoStack: Array<{ index: number; day: Day }> = [];

// DOM要素参照
const dayTabsEl = document.getElementById('day-tabs') as HTMLDivElement;
const timelineEl = document.getElementById('timeline') as HTMLDivElement;
const tripNameInputEl = document.getElementById('trip-name-input') as HTMLInputElement | null;
const tripComboboxContainerEl = document.getElementById('trip-combobox-container');
const tripComboboxToggleEl = document.getElementById('trip-combobox-toggle');
const tripComboboxMenuEl = document.getElementById('trip-combobox-menu') as HTMLUListElement | null;
const tripSwitcherEl = document.getElementById('trip-switcher') as HTMLSelectElement | null;
const tripNewBtnEl = document.getElementById('trip-new-btn');
const tripDeleteBtnEl = document.getElementById('trip-delete-btn') as HTMLButtonElement | null;
const newSpotInputEl = document.getElementById('new-spot-input') as HTMLInputElement;
const addSpotFormEl = document.getElementById('add-spot-form') as HTMLFormElement;
const addLocationTypeSelectEl = document.getElementById('add-location-type-select') as HTMLSelectElement;
const addTypeNoteEl = document.getElementById('add-type-note') as HTMLParagraphElement;
const addAccommodationScopeEl = document.getElementById('add-accommodation-scope') as HTMLDivElement;
const addAccommodationScopeAllEl = document.getElementById('add-accommodation-scope-all') as HTMLButtonElement;
const addAccommodationScopeTodayEl = document.getElementById('add-accommodation-scope-today') as HTMLButtonElement;
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

function saveState(): void {
  tripStore.save(state);
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
            day.spots.unshift(previousAccommodation);
            day.autoStartSlot = true;
            day.autoStartValue = previousAccommodation;
          } else {
            const currentFirst = (day.spots[0] || '').trim();
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
              day.spots[0] = previousAccommodation;
              day.autoStartValue = previousAccommodation;
            }
          }
        } else {
          day.spots.unshift(previousAccommodation);
          day.autoStartSlot = true;
          day.autoStartValue = previousAccommodation;
        }
      } else {
        const managedValue = (day.autoStartValue || '').trim();
        if (
          day.autoStartSlot &&
          day.spots.length > 0 &&
          ((day.spots[0] || '').trim() === managedValue || !managedValue)
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
  if (addSpotFormEl) {
    const height = Math.round(addSpotFormEl.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--sticky-form-height', `${height}px`);
  }
}

function scrollToDay(index: number): void {
  const section = document.getElementById(`day-section-${index}`);
  if (!section) return;
  updateStickyOffsets();
  const formHeight = addSpotFormEl ? Math.round(addSpotFormEl.getBoundingClientRect().height) : 135;
  const sectionTop = section.getBoundingClientRect().top + window.scrollY;
  const targetScrollY = Math.max(0, sectionTop - formHeight + 2);
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

function createNewTrip(): void {
  if (tripStore.trips.length >= MAX_TRIPS) {
    alert(`旅行は最大${MAX_TRIPS}件までしか作成できません。`);
    return;
  }
  saveState();
  const newTrip = {
    id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tripName: `旅行${tripStore.trips.length + 1}`,
    days: [createDay(1)],
    activeDayIndex: 0,
    departure: '',
    arrival: '',
    autoArrival: true,
    mapType: getStoredMapType(),
  };
  tripStore.trips.push(newTrip);
  tripStore.activeTripId = newTrip.id;
  tripStore.applyActiveTripToState(state);
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
  const displayName = targetTrip.tripName && targetTrip.tripName.trim() ? targetTrip.tripName : `旅行${index + 1}`;
  if (!confirm(`「${displayName}」を削除しますか？この操作は取り消せません。`)) {
    return;
  }
  tripStore.trips.splice(index, 1);
  if (tripId === tripStore.activeTripId) {
    tripStore.activeTripId = tripStore.trips[Math.max(0, index - 1)].id;
    tripStore.applyActiveTripToState(state);
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
    item.className = `flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors duration-75 hover:bg-slate-100 ${
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

    const label = document.createElement('span');
    label.className = 'truncate';
    label.textContent = trip.tripName && trip.tripName.trim() ? trip.tripName : `旅行${index + 1}`;
    labelArea.appendChild(label);

    item.appendChild(labelArea);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    const displayName = trip.tripName && trip.tripName.trim() ? trip.tripName : `旅行${index + 1}`;
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
        saveState();
        render();
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
  addBtn.className = `flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors duration-75 ${
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
      option.textContent = trip.tripName && trip.tripName.trim() ? trip.tripName : `旅行${index + 1}`;
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
  if (addLocationTypeSelectEl) {
    addLocationTypeSelectEl.value = state.addLocationType;
  }
  addAccommodationScopeEl.classList.toggle('hidden', state.addLocationType !== 'accommodation');
  const note = state.addLocationType === 'departure' ? '到着地点は後から上書きできます。' : '';
  addTypeNoteEl.textContent = note;
  addTypeNoteEl.classList.toggle('hidden', !note);
  setTagStyle(addAccommodationScopeAllEl, state.addAccommodationScope === 'all');
  setTagStyle(addAccommodationScopeTodayEl, state.addAccommodationScope === 'today');
  newSpotInputEl.placeholder =
    state.addLocationType === 'departure'
      ? '例: 東京駅'
      : state.addLocationType === 'accommodation'
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
    day.spots.push(value);
  }
  newSpotInputEl.value = '';
  state.addLocationType = 'spot';
  saveState();
  render();
}

function addDay(): void {
  const prevAccommodation = (state.days[state.days.length - 1].accommodation || '').trim();
  state.days.push(createDay(state.days.length + 1, prevAccommodation));
  state.activeDayIndex = state.days.length - 1;
  saveState();
  render();
  document.getElementById(`day-section-${state.activeDayIndex}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
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

function deleteActiveDay(): void {
  if (state.days.length <= 1) {
    alert('日程は最低1日必要です。');
    return;
  }

  const targetIndex = state.activeDayIndex;
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
      (day.spots[0] || '').trim() === (day.autoStartValue || '').trim()
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

  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.id = 'share-btn';
  shareButton.className =
    'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-full border border-slate-300 bg-white p-0 text-slate-700 shadow-xs transition-all duration-75 hover:scale-105 hover:border-slate-900 hover:bg-slate-900 hover:text-white hover:shadow-md active:scale-90 cursor-pointer';
  shareButton.setAttribute('aria-label', 'LINE共有用に旅程をコピー');
  shareButton.setAttribute('data-tooltip', 'LINE共有用に旅程をコピー');
  shareButton.setAttribute('data-tooltip-pos', 'left');
  shareButton.innerHTML = '<i data-lucide="share-2" class="h-3.5 w-3.5 sm:h-4 sm:w-4"></i>';
  shareButton.addEventListener('click', () => {
    copyShareItinerary(shareButton, state);
  });
  dayTabsEl.appendChild(shareButton);

  refreshIcons(dayTabsEl);
}

function createSpotCard(
  spotValue: string,
  index: number,
  markerIndex = index,
  dayIndex = state.activeDayIndex
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
    day.spots[index] = (e.target as HTMLInputElement).value;
    if (dayIndex > 0 && index === 0 && day.autoStartSlot) {
      const previousAccommodation = (state.days[dayIndex - 1].accommodation || '').trim();
      const currentValue = (e.target as HTMLInputElement).value.trim();
      const shouldKeepAuto = currentValue === previousAccommodation;
      day.autoStart = shouldKeepAuto;
      day.autoStartSlot = shouldKeepAuto && !!previousAccommodation;
      day.autoStartValue = shouldKeepAuto ? previousAccommodation : '';
    }
    saveState();
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
  content.append(input, controls);
  row.append(handle, marker, content);
  card.appendChild(row);
  return card;
}

function createAccommodationCard(
  accommodation: string,
  index: number,
  dayIndex = state.activeDayIndex
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
      day.autoAccommodation = false;
      syncAutoStarts();
    }
    state.openRouteMenuIndex = null;
    saveState();
    render();
  });

  controls.append(badge, hint, removeBtn);
  content.append(input, controls);
  row.append(spacer, marker, content);
  card.appendChild(row);
  return card;
}

function createEndpointCard(
  location: string,
  index: number,
  label: '出発地点' | '到着地点',
  dayIndex = state.activeDayIndex
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
        state.autoArrival = false;
      }
      state.departure = '';
      if (departureInputEl) departureInputEl.value = '';
    } else if (label === '到着地点') {
      state.arrival = '';
      state.autoArrival = false;
    }
    state.openRouteMenuIndex = null;
    saveState();
    render();
  });

  controls.append(badge, hint, removeBtn);
  content.append(input, controls);
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
  const details = document.createElement('details');
  details.id = `day-section-${dayIndex}`;
  details.dataset.dayIndex = String(dayIndex);
  details.className = 'border-t border-slate-200 py-2 first:border-t-0 first:pt-0';
  details.style.scrollMarginTop = 'var(--sticky-form-height, 135px)';
  details.open = !collapsedDays.has(dayIndex);

  const summary = document.createElement('summary');
  summary.className =
    'sticky z-20 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/95 px-3 py-2.5 backdrop-blur-sm shadow-xs transition-colors duration-75 hover:bg-slate-50';
  summary.style.top = 'var(--sticky-form-height, 135px)';
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
  body.className = 'pt-2';

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
      body.appendChild(createSpotCard(item.value, item.spotIndex, index, dayIndex));
    } else if (item.type === 'accommodation') {
      body.appendChild(createAccommodationCard(item.value, index, dayIndex));
    } else {
      body.appendChild(createEndpointCard(item.value, index, item.label, dayIndex));
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

  const formRect = addSpotFormEl ? addSpotFormEl.getBoundingClientRect() : null;
  const targetY = formRect ? Math.round(formRect.bottom + 16) : 140;
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

function render(): void {
  ensureValidState();
  syncAutoStarts();
  if (state.autoArrival) {
    state.arrival = state.departure;
  }
  if (tripNameInputEl) {
    tripNameInputEl.value = state.tripName;
  }
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
      if (tripSwitcherEl) {
        const activeOption = tripSwitcherEl.querySelector(`option[value="${tripStore.activeTripId}"]`);
        if (activeOption) {
          const index = tripStore.trips.findIndex((t) => t.id === tripStore.activeTripId);
          activeOption.textContent = state.tripName.trim() ? state.tripName : `旅行${index + 1}`;
        }
      }
      if (isTripMenuOpen) {
        renderTripComboboxMenu();
      }
    });
    tripNameInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleTripMenu(false);
      }
    });
  }

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
      saveState();
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

  if (addLocationTypeSelectEl) {
    addLocationTypeSelectEl.addEventListener('change', (e) => {
      state.addLocationType = (e.target as HTMLSelectElement).value as any;
      renderAddSpotOptions();
    });
  }

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

  window.addEventListener('scroll', updateActiveDayFromScroll, { passive: true });
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
  tripStore.applyActiveTripToState(state);
  ensureValidState();
  syncAutoStarts();
  saveState();
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
