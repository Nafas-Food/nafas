/**
 * Haversine great-circle distance in kilometres between two lat/lng pairs.
 * Pure JS, no deps. Used by chefs.service.findManyForDiscovery (research R2)
 * to close the IMPLEMENTATION_PLAN $queryRaw exception.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  const clampedA = Math.min(1, Math.max(0, a));
  return 2 * R * Math.asin(Math.sqrt(clampedA));
}
