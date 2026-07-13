import AsyncStorage from '@react-native-async-storage/async-storage';

function getDeclRad(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const doy   = Math.round((date.getTime() - start.getTime()) / 86_400_000);
  const g     = (2 * Math.PI / 365) * (doy - 1);
  return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
       - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
}

function sunriseAzimuth(latDeg: number, declRad: number): number {
  const D   = Math.PI / 180;
  const lat = latDeg * D;
  const cosAz = (Math.sin(declRad) + Math.sin(-0.833 * D) * Math.sin(lat))
              / (Math.cos(0.833  * D) * Math.cos(lat));
  return Math.acos(Math.max(-1, Math.min(1, cosAz))) / D;
}

function destPoint(lat: number, lon: number, azDeg: number, km: number): [number, number] {
  const D = Math.PI / 180, R = 6371;
  const la = lat * D, lo = lon * D, b = azDeg * D, d = km / R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [la2 / D, lo2 / D];
}

async function fetchTerrainAngle(lat: number, lon: number, myElev: number, date: Date): Promise<number> {
  const az  = sunriseAzimuth(lat, getDeclRad(date));
  const pts = Array.from({ length: 80 }, (_, i) => destPoint(lat, lon, az, i + 1));
  const res = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[0].toFixed(6)).join(',')}&longitude=${pts.map(p => p[1].toFixed(6)).join(',')}`
  );
  if (!res.ok) return 0;
  const elevs: (number | null)[] = ((await res.json()) as { elevation: (number | null)[] }).elevation ?? [];
  let maxAngle = 0;
  elevs.forEach((elev, i) => {
    if (elev != null) maxAngle = Math.max(maxAngle, Math.atan2(elev - myElev, (i + 1) * 1000) * (180 / Math.PI));
  });
  return Math.round(maxAngle * 1000) / 1000;
}

/**
 * Returns the daily mountain angle (degrees) for the given city/location and date.
 * Result is cached in AsyncStorage for the day — one network call per city per day.
 * Returns 0 on network failure (falls back to astronomical netz).
 */
export async function getDailyMountainAngle(
  cacheKey: string,
  lat: number,
  lon: number,
  elevation: number,
  date: Date,
): Promise<number> {
  const dateStr  = date.toISOString().slice(0, 10);
  const storageKey = `ma:${cacheKey}:${dateStr}`;
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached !== null) return parseFloat(cached);
  } catch { /* ignore */ }

  try {
    const angle = await fetchTerrainAngle(lat, lon, elevation, date);
    AsyncStorage.setItem(storageKey, String(angle)).catch(() => {});
    return angle;
  } catch {
    return 0;
  }
}
