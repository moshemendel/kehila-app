import { useMemo } from 'react';
import { useCity } from './useCity';
import { useZmanimSettings } from '../context/ZmanimSettingsContext';
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

export function useShabbatZmanim(cityId: string): ShabbatZmanim {
  const { city } = useCity(cityId);
  const { settings } = useZmanimSettings();
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

    const calc = (d: Date) =>
      calcZmanim(
        d,
        city.latitude,
        city.longitude,
        settings,
        city.timezone || 'Asia/Jerusalem',
        0, // elevation always sea-level per Rav Ovadia, matching useTodayZmanim
        0,
      );

    return { friday: calc(fridayDate), shabbat: calc(shabbatDate) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, settings, foregroundTick]);
}
