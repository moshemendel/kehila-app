import { City, Area, Synagogue } from '../types';
import { calcZmanim, PRESET_RAV_OVADIA, withPresetDefaults, ZmanimResult, ZmanimSettings } from './zmanim';

/**
 * Which zmanim method applies to what — the layering this feature exists for:
 *
 *   • A resident's own view (the zmanim screen, the home widgets) follows their
 *     choice, and the city's method until they make one.
 *   • Anything a listing hangs on a zman — a synagogue's "30 min before sunset",
 *     a mikveh's hours — follows that listing's authority: the synagogue's own
 *     method if its gabbai set one, otherwise the city's. Never the resident's,
 *     so a minyan means the same moment to everyone who reads it.
 *   • The council's fixed clock times (mincha at 17:40) are not zmanim at all and
 *     never come through here.
 *
 * The city's method is the floor: אור החיים, what the app has always used.
 */

export function cityZmanimSettings(city?: Pick<City, 'zmanimSettings'> | null): ZmanimSettings {
  return withPresetDefaults(city?.zmanimSettings ?? PRESET_RAV_OVADIA);
}

export function synagogueZmanimSettings(
  synagogue: Pick<Synagogue, 'zmanimSettings'> | null | undefined,
  city: Pick<City, 'zmanimSettings'> | null | undefined,
): ZmanimSettings {
  return synagogue?.zmanimSettings ? withPresetDefaults(synagogue.zmanimSettings) : cityZmanimSettings(city);
}

/**
 * A resident's own method with the city's candle-lighting custom. Minutes before
 * sunset are the city's minhag (Ramla 20, Jerusalem 40), not part of any posek's
 * method, so choosing a different method must not change them.
 */
export function withCityCandles(personal: ZmanimSettings, city: ZmanimSettings): ZmanimSettings {
  return { ...personal, candleLightingMin: city.candleLightingMin, candleLightingAltMin: city.candleLightingAltMin };
}

/** The point zmanim run on: a record's own area, else the tenant's default area, else the city. */
export function zmanimPoint(
  city: City | null,
  areas: Area[],
  areaId?: string,
): { latitude: number; longitude: number; timezone: string } | null {
  if (!city) return null;
  const area = (areaId ? areas.find((a) => a.id === areaId) : undefined)
    ?? areas.find((a) => a.isDefault)
    ?? null;
  return {
    latitude:  area?.latitude  ?? city.latitude,
    longitude: area?.longitude ?? city.longitude,
    timezone:  city.timezone || 'Asia/Jerusalem',
  };
}

// A list of synagogues asks for one result per row, but most share a method —
// the whole city's, in the common case — and every row shares a day. Keyed by
// everything calcZmanim reads, so a hundred shuls cost as many computations as
// there are distinct methods.
const cache = new Map<string, ZmanimResult>();
const CACHE_MAX = 200;

export function cachedZmanim(
  date: Date,
  point: { latitude: number; longitude: number; timezone: string },
  settings: ZmanimSettings,
): ZmanimResult {
  const day = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const key = `${day}|${point.latitude}|${point.longitude}|${point.timezone}|${JSON.stringify(settings)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = calcZmanim(date, point.latitude, point.longitude, settings, point.timezone, 0, 0);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, r);
  return r;
}
