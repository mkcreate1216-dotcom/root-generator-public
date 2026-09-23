import type { AppState, Day, MapType, Trip } from './types';

export const STORAGE_KEY = 'travel-itinerary-mvp-v1';
export const MAP_TYPE_STORAGE_KEY = 'travel-itinerary-map-type';
export const TRIPS_STORAGE_KEY = 'travel-itinerary-trips-v1';
export const MAX_TRIPS = Infinity;

export function formatTripDate(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  } catch {
    return '';
  }
}

export function sortTripsByCreatedAt(trips: Trip[]): Trip[] {
  return [...trips].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
}

export function getStoredMapType(): MapType {
  try {
    const stored = localStorage.getItem(MAP_TYPE_STORAGE_KEY);
    if (stored === 'apple' || stored === 'google') return stored;
  } catch {}
  return 'google';
}

export function createDay(dayNumber: number, prevAccommodation = ''): Day {
  return {
    name: `Day ${dayNumber}`,
    spots: dayNumber === 1 ? [] : prevAccommodation ? [{ name: prevAccommodation, memo: '' }] : [],
    accommodation: dayNumber === 1 ? '' : prevAccommodation,
    accommodationMemo: '',
    autoAccommodation: dayNumber !== 1,
    autoStart: dayNumber !== 1,
    autoStartSlot: dayNumber !== 1 && !!prevAccommodation,
    autoStartValue: dayNumber !== 1 && !!prevAccommodation ? prevAccommodation : '',
  };
}

export function generateTripId(): string {
  return `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTripEntry(tripName = '', isShared = false): Trip {
  const now = new Date().toISOString();
  return {
    id: generateTripId(),
    shareId: undefined,
    tripName: tripName || '',
    createdAt: now,
    updatedAt: now,
    isShared,
    days: [createDay(1)],
    activeDayIndex: 0,
    departure: '',
    departureMemo: '',
    arrival: '',
    arrivalMemo: '',
    autoArrival: true,
    mapType: getStoredMapType(),
  };
}

export function sanitizeTrip(trip: any): Trip {
  const sanitized = trip && typeof trip === 'object' ? trip : {};
  sanitized.id = typeof sanitized.id === 'string' && sanitized.id ? sanitized.id : generateTripId();
  sanitized.shareId = typeof sanitized.shareId === 'string' && sanitized.shareId ? sanitized.shareId : undefined;
  sanitized.tripName = typeof sanitized.tripName === 'string' ? sanitized.tripName : '';
  sanitized.mapType =
    sanitized.mapType === 'apple' ? 'apple' : sanitized.mapType === 'google' ? 'google' : getStoredMapType();
  sanitized.days = Array.isArray(sanitized.days) && sanitized.days.length ? sanitized.days : [createDay(1)];
  for (let i = 0; i < sanitized.days.length; i++) {
    const day = sanitized.days[i] || {};
    day.name = day.name || `Day ${i + 1}`;
    day.spots = Array.isArray(day.spots)
      ? day.spots.map((spot: any) => {
          if (typeof spot === 'string') {
            return { name: spot, memo: '' };
          }
          if (spot && typeof spot === 'object') {
            return {
              name: typeof spot.name === 'string' ? spot.name : '',
              memo: typeof spot.memo === 'string' ? spot.memo : '',
            };
          }
          return { name: '', memo: '' };
        })
      : [];
    day.accommodation = typeof day.accommodation === 'string' ? day.accommodation : '';
    day.accommodationMemo = typeof day.accommodationMemo === 'string' ? day.accommodationMemo : '';
    day.autoAccommodation = typeof day.autoAccommodation === 'boolean' ? day.autoAccommodation : i !== 0;
    day.autoStart = typeof day.autoStart === 'boolean' ? day.autoStart : i !== 0;
    day.autoStartSlot =
      typeof day.autoStartSlot === 'boolean' ? day.autoStartSlot : day.autoStart && day.spots.length > 0;
    day.autoStartValue =
      typeof day.autoStartValue === 'string'
        ? day.autoStartValue
        : day.autoStartSlot
          ? day.spots[0]?.name || ''
          : '';
    sanitized.days[i] = day;
  }
  sanitized.activeDayIndex =
    Number.isInteger(sanitized.activeDayIndex) &&
    sanitized.activeDayIndex >= 0 &&
    sanitized.activeDayIndex < sanitized.days.length
      ? sanitized.activeDayIndex
      : 0;
  sanitized.departure = typeof sanitized.departure === 'string' ? sanitized.departure : '';
  sanitized.departureMemo = typeof sanitized.departureMemo === 'string' ? sanitized.departureMemo : '';
  sanitized.arrival = typeof sanitized.arrival === 'string' ? sanitized.arrival : '';
  sanitized.arrivalMemo = typeof sanitized.arrivalMemo === 'string' ? sanitized.arrivalMemo : '';
  sanitized.autoArrival =
    typeof sanitized.autoArrival === 'boolean'
      ? sanitized.autoArrival
      : !sanitized.arrival || sanitized.arrival === sanitized.departure;

  // 作成日の復元 (既存データは trip.id のタイムスタンプから復元、または現在時刻)
  let createdAt = typeof sanitized.createdAt === 'string' && sanitized.createdAt ? sanitized.createdAt : '';
  if (!createdAt) {
    const match = typeof sanitized.id === 'string' ? sanitized.id.match(/^trip-(\d+)/) : null;
    if (match && match[1]) {
      const ts = Number(match[1]);
      if (!isNaN(ts) && ts > 0) {
        createdAt = new Date(ts).toISOString();
      }
    }
  }
  if (!createdAt) {
    createdAt = new Date().toISOString();
  }
  sanitized.createdAt = createdAt;
  sanitized.updatedAt =
    typeof sanitized.updatedAt === 'string' && sanitized.updatedAt ? sanitized.updatedAt : createdAt;
  sanitized.isShared =
    typeof sanitized.isShared === 'boolean' ? sanitized.isShared : Boolean(sanitized.shareId);

  return sanitized as Trip;
}

export function migrateLegacyTrip(): Trip | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeTrip(JSON.parse(raw));
  } catch {
    return null;
  }
}

export class TripStore {
  trips: Trip[] = [];
  activeTripId: string = '';

  load(): void {
    try {
      const raw = localStorage.getItem(TRIPS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.trips =
          Array.isArray(parsed.trips) && parsed.trips.length
            ? sortTripsByCreatedAt(parsed.trips.map(sanitizeTrip))
            : [];
        if (!this.trips.length) this.trips = [createTripEntry('')];
        this.activeTripId = this.trips.some((t) => t.id === parsed.activeTripId)
          ? parsed.activeTripId
          : this.trips[0].id;
        return;
      }
    } catch {
      this.trips = [];
    }
    const legacy = migrateLegacyTrip();
    this.trips = [legacy || createTripEntry('')];
    this.activeTripId = this.trips[0].id;
  }

  getActiveTrip(): Trip {
    return this.trips.find((t) => t.id === this.activeTripId) || this.trips[0];
  }

  applyActiveTripToState(state: AppState): void {
    const trip = this.getActiveTrip();
    this.activeTripId = trip.id;
    state.shareId = trip.shareId;
    state.days = trip.days;
    state.activeDayIndex = trip.activeDayIndex;
    state.tripName = trip.tripName;
    state.departure = trip.departure;
    state.departureMemo = trip.departureMemo || '';
    state.arrival = trip.arrival;
    state.arrivalMemo = trip.arrivalMemo || '';
    state.autoArrival = trip.autoArrival;
    state.mapType = trip.mapType || getStoredMapType();
    state.openRouteMenuIndex = null;
    state.accommodationUpdateScope = 'all';
    state.addLocationType = 'spot';
    state.addAccommodationScope = 'all';
  }

  persistActiveTripFromState(state: AppState): void {
    const trip = this.getActiveTrip();
    if (!trip) return;
    trip.shareId = state.shareId;
    trip.days = state.days;
    trip.activeDayIndex = state.activeDayIndex;
    trip.tripName = state.tripName;
    trip.departure = state.departure;
    trip.departureMemo = state.departureMemo || '';
    trip.arrival = state.arrival;
    trip.arrivalMemo = state.arrivalMemo || '';
    trip.autoArrival = state.autoArrival;
    trip.mapType = state.mapType;
    trip.updatedAt = new Date().toISOString();
  }

  save(state: AppState): void {
    this.persistActiveTripFromState(state);
    try {
      localStorage.setItem(
        TRIPS_STORAGE_KEY,
        JSON.stringify({ trips: this.trips, activeTripId: this.activeTripId })
      );
    } catch (e) {
      console.warn('Failed to save trips to localStorage:', e);
    }
  }
}

