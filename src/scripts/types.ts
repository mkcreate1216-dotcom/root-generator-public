export type MapType = 'google' | 'apple';

export type LocationType = 'spot' | 'departure' | 'accommodation';

export type AccommodationScope = 'all' | 'today' | 'next-day';

export interface Spot {
  name: string;
  memo: string;
}

export interface Day {
  name: string;
  spots: Spot[];
  accommodation: string;
  accommodationMemo?: string;
  autoAccommodation: boolean;
  autoStart: boolean;
  autoStartSlot: boolean;
  autoStartValue: string;
}

export interface Trip {
  id: string;
  shareId?: string;
  tripName: string;
  createdAt?: string;
  updatedAt?: string;
  isShared?: boolean;
  days: Day[];
  activeDayIndex: number;
  departure: string;
  departureMemo?: string;
  arrival: string;
  arrivalMemo?: string;
  autoArrival: boolean;
  mapType: MapType;
}

export interface AppState {
  shareId?: string;
  days: Day[];
  activeDayIndex: number;
  mapType: MapType;
  openRouteMenuIndex: number | null;
  accommodationUpdateScope: AccommodationScope;
  departure: string;
  departureMemo?: string;
  arrival: string;
  arrivalMemo?: string;
  autoArrival: boolean;
  tripName: string;
  addLocationType: LocationType;
  addAccommodationScope: 'all' | 'today';
}

export type DayItem =
  | { type: 'endpoint'; value: string; memo?: string; label: '出発地点' | '到着地点' }
  | { type: 'spot'; value: string; memo: string; spotIndex: number }
  | { type: 'accommodation'; value: string; memo?: string };


