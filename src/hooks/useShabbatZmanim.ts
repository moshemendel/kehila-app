import { useMemo } from 'react';
import { useCity } from './useCity';
import { useAreas } from './useAreas';
import { useZmanimSettings } from '../context/ZmanimSettingsContext';
import { Synagogue } from '../types';
import { synagogueZmanimSettings, zmanimPoint } from '../utils/zmanimProfile';
import { useAppForegroundTick } from './useAppForegroundTick';
import { calcZmanim, ZmanimResult } from '../utils/zmanim';

/**
 * Zmanim for the coming Friday and the Shabbat that follows it.
 *
 * A Shabbat schedule is full of times that are not clock times: kabbalat
 * Shabbat half an hour before sunset, mincha relative to plag, maariv after
 * tzeit. Resolving those against *today's* zmanim answers the wrong question —
 * on a Tuesday in September it puts kabbalat Shabbat several minutes off, and
 * across a season the gap is far larger. The times a congregation reads off
 * this screen are the ones they turn up for.
 *
 * Friday and Shabbat are computed separately because they are different days:
 * erev-Shabbat prayers belong to Friday's sunset, and everything from shacharit
 * onward to Shabbat's own.
 *
 * On Shabbat itself this looks backwards, to the Friday that just passed, so
 * the schedule on screen stays the one currently in effect rather than jumping
 * to next week partway through.
 */
export interface ShabbatZmanim {
  friday:  ZmanimResult | null;
  shabbat: ZmanimResult | null;
}

export function useShabbatZmanim(cityId: string, synagogue?: Synagogue | null): ShabbatZmanim {
  const { city } = useCity(cityId);
  const { areas } = useAreas(cityId);
  const { settings: personal } = useZmanimSettings();
  // For a synagogue's own board: its gabbai's method, else the city's. Without
  // a synagogue it is the resident's own view, as before.
  const settings = synagogue ? synagogueZmanimSettings(synagogue, city) : personal;
  // Same reason useTodayZmanim takes this: without it `new Date()` is evaluated
  // once at mount and the answer is stale after a background/resume next day.
  const foregroundTick = useAppForegroundTick();

  return useMemo(() => {
    if (!city) return { friday: null, shabbat: null };

    const today = new Date();
    const dow   = today.getDay(); // 0=Sun … 5=Fri, 6=Sat

    const fridayDate = new Date(today);
    if (dow === 6) fridayDate.setDate(today.getDate() - 1);        // Shabbat now — yesterday
    else if (dow !== 5) fridayDate.setDate(today.getDate() + ((5 - dow + 7) % 7));

    const shabbatDate = new Date(fridayDate);
    shabbatDate.setDate(fridayDate.getDate() + 1);

    const point = (synagogue ? zmanimPoint(city, areas, synagogue.areaId) : null)
      ?? { latitude: city.latitude, longitude: city.longitude, timezone: city.timezone || 'Asia/Jerusalem' };
    const calc = (d: Date) =>
      calcZmanim(
        d,
        point.latitude,
        point.longitude,
        settings,
        point.timezone,
        0, // elevation always sea-level per Rav Ovadia, matching useTodayZmanim
        0,
      );

    return { friday: calc(fridayDate), shabbat: calc(shabbatDate) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, areas, synagogue?.areaId, settings, foregroundTick]);
}
