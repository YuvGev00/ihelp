/**
 * Haversine great-circle distance — the app's entire "geo stack".
 * Computed in application code on purpose: no PostGIS, no external geocoding,
 * sufficient at city scale (architecture §3, §8.1).
 */

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** "0.4 ק"מ" under 1km shows one decimal; whole km above. */
export function formatDistance(km: number): string {
  if (km < 1) return `${km.toFixed(1)} ק"מ`;
  return `${Math.round(km)} ק"מ`;
}
