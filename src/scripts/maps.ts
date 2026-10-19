import type { MapType } from './types';

/**
 * 単一地点のマップ検索URLを生成
 */
export function getSpotSearchUrl(location: string, mapType: MapType): string {
  const trimmed = (location || '').trim();
  if (!trimmed) return '';
  const query = encodeURIComponent(trimmed);
  if (mapType === 'apple') {
    return `https://maps.apple.com/?q=${query}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * 単一地点のマップ検索を新規タブまたは遷移で開く
 */
export function openSpotSearch(location: string, mapType: MapType): void {
  const url = getSpotSearchUrl(location, mapType);
  if (!url) return;
  const mapWindow = window.open(url, '_blank');
  if (mapWindow) {
    mapWindow.opener = null;
  } else {
    window.location.assign(url);
  }
}

/**
 * 2地点間のルート案内URLを生成
 */
export function getRouteUrl(origin: string, destination: string, mapType: MapType): string {
  const from = encodeURIComponent(origin.trim());
  const to = encodeURIComponent(destination.trim());
  if (mapType === 'apple') {
    return `https://maps.apple.com/?saddr=${from}&daddr=${to}`;
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${from}&destination=${to}`;
}

/**
 * 2地点間のルート案内を新規タブまたは遷移で開く
 */
export function openRoute(origin: string, destination: string, mapType: MapType): void {
  const url = getRouteUrl(origin, destination, mapType);
  const mapWindow = window.open(url, '_blank');
  if (mapWindow) {
    mapWindow.opener = null;
  } else {
    window.location.assign(url);
  }
}

/**
 * 複数地点を経由地（waypoints）を含めて1つのURLにまとめる
 */
export function getDayRouteUrl(locations: string[], mapType: MapType): string {
  const validLocations = (locations || []).map((loc) => (loc || '').trim()).filter(Boolean);
  if (validLocations.length < 2) return '';
  const origin = encodeURIComponent(validLocations[0]);
  const destination = encodeURIComponent(validLocations[validLocations.length - 1]);
  const waypoints = validLocations.slice(1, -1);

  if (mapType === 'apple') {
    if (waypoints.length > 0) {
      const waypointsParams = waypoints.map((wp) => `waypoint=${encodeURIComponent(wp)}`).join('&');
      return `https://maps.apple.com/directions?mode=driving&source=${origin}&${waypointsParams}&destination=${destination}`;
    }
    return `https://maps.apple.com/?saddr=${origin}&daddr=${destination}`;
  }

  const waypointsParam = waypoints.map(encodeURIComponent).join('%7C');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam ? `&waypoints=${waypointsParam}` : ''}`;
}

