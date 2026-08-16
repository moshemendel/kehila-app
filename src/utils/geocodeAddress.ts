import * as Location from 'expo-location';

/**
 * Address → coordinates for the in-app map picker.
 *
 * Mirrors the admin dashboard's "אתר" button (kehila-admin/src/utils/geocode.ts)
 * in behaviour, but NOT in backend, deliberately:
 *
 *   admin  → Nominatim (OpenStreetMap), because a browser has nothing better
 *   app    → the device's own geocoder via expo-location, which on Android is
 *            Google's — the same data behind Google Maps
 *
 * That difference matters here. Nominatim has no Hebrew entry for מעלה אדומים at
 * all and returned another town's street for "הר הלבונה 18"; the platform
 * geocoder knows Israeli addresses far better, costs nothing, and needs no API
 * key. Reusing the admin's implementation for symmetry would have made the phone
 * worse at the one job it does better.
 *
 * What IS shared is the distance guard below — the failure that actually hurts
 * is not "address not found", it's a confident hit in the wrong town being saved
 * as coordinates and sending people 15 km away.
 */

/** Hits further than this from the city centre are discarded. Matches the admin. */
export const MAX_DISTANCE_KM = 12;

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  /** Distance from the city centre in km, when a centre was supplied. */
  distanceKm: number | null;
}

export interface GeocodeBias {
  /** Appended to the query so a bare street name resolves in the right town. */
  cityName?: string;
  /** City centre — anything far from it is rejected. */
  latitude?: number;
  longitude?: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class GeocodeUnavailable extends Error {}

/**
 * Look up an address, nearest-first, with out-of-range hits dropped.
 *
 * An empty array means "not found" — a normal outcome for a street that isn't
 * mapped yet, which the caller should answer by inviting a map tap rather than
 * treating as an error. A thrown GeocodeUnavailable means the lookup itself
 * couldn't run (no geocoding service on the device, offline).
 */
export async function geocodeAddress(
  address: string,
  bias: GeocodeBias = {},
): Promise<GeocodeHit[]> {
  const q = [address.trim(), bias.cityName].filter(Boolean).join(', ');
  if (!q) return [];

  let raw: Location.LocationGeocodedLocation[];
  try {
    raw = await Location.geocodeAsync(q);
  } catch (e) {
    throw new GeocodeUnavailable(String(e));
  }

  const hasCentre = Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude);

  return raw
    .map((r) => ({
      latitude: r.latitude,
      longitude: r.longitude,
      distanceKm: hasCentre
        ? haversineKm(bias.latitude as number, bias.longitude as number, r.latitude, r.longitude)
        : null,
    }))
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    // Without a centre there is nothing to measure against, so everything passes.
    .filter((r) => r.distanceKm == null || r.distanceKm <= MAX_DISTANCE_KM)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}
