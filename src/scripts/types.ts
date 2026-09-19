export type MapType = 'google' | 'apple';

export type LocationType = 'spot' | 'departure' | 'accommodation';

export type AccommodationScope = 'all' | 'today' | 'next-day';

export interface Day {
  name: string;
  spots: string[];
  accommodation: string;
  autoAccommodation: boolean;
  autoStart: boolean;
  autoStartSlot: boolean;
  autoStartValue: string;
}

export interface Trip {
  id: string;
  tripName: string;
  days: Day[];
  activeDayIndex: number;
  departure: string;
  arrival: string;
  autoArrival: boolean;
  mapType: MapType;
}

export interface AppState {
  days: Day[];
  activeDayIndex: number;
  mapType: MapType;
  openRouteMenuIndex: number | null;
  accommodationUpdateScope: AccommodationScope;
  departure: string;
  arrival: string;
  autoArrival: boolean;
  tripName: string;
  addLocationType: LocationType;
  addAccommodationScope: 'all' | 'today';
}

export type DayItem =
  | { type: 'endpoint'; value: string; label: '出発地点' | '到着地点' }
  | { type: 'spot'; value: string; spotIndex: number }
  | { type: 'accommodation'; value: string };

