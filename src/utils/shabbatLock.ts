/**
 * Determines whether the app should be "closed" right now because it is
 * Shabbat or Yom Tov (Israel schedule).
 *
 * Window: from שקיעה (sunset) on the erev, until צאת הכוכבים (tzeit) at the end
 * of the last consecutive assur-bemelacha day. Yom Tov detection uses
 * kosher-zmanim's JewishCalendar.isAssurBemelacha(), which is true for both
 * Shabbat and a Yom Tov where melacha is forbidden.
 *
 * Note: assumes the device is in (or near) the city's timezone — true for local
 * users. Zmanim themselves are always computed for the city's coordinates/tz.
 */

import { JewishCalendar, HebrewDateFormatter } from 'kosher-zmanim';
import { calcZmanim, minToStr, ZmanimSettings } from './zmanim';
import { City } from '../types';

const fmt = new HebrewDateFormatter();
fmt.setHebrewFormat(true);

export interface ShabbatLockState {
  locked: boolean;
  kind?: 'shabbat' | 'yomtov';
  title?: string;      // e.g. "שבת שלום" or "סוכות · חג שמח"
  parasha?: string;    // for Shabbat
  reopenAt?: string;   // "HH:MM" — tzeit of the last consecutive assur day
}

function jcal(date: Date): JewishCalendar {
  const c = new JewishCalendar(date);
  c.setInIsrael(true);
  return c;
}

function isAssur(date: Date): boolean {
  try {
    return jcal(date).isAssurBemelacha();
  } catch {
    return false;
  }
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}

/** now's minutes-from-midnight in the given IANA timezone. */
function nowMinutesInTz(now: Date, tz: string): number {
  try {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const h = Number(p.find((x) => x.type === 'hour')?.value ?? '0');
    const m = Number(p.find((x) => x.type === 'minute')?.value ?? '0');
    return (h % 24) * 60 + m;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

export function getShabbatLock(
  city: City | null,
  settings: ZmanimSettings,
  now: Date = new Date(),
): ShabbatLockState {
  if (!city) return { locked: false };

  const tz = city.timezone || 'Asia/Jerusalem';
  const z  = calcZmanim(now, city.latitude, city.longitude, settings, tz, city.elevation ?? 0);
  if (z.shkia < 0 || z.tzetHakochavim < 0) return { locked: false };

  const nowMin    = nowMinutesInTz(now, tz);
  const lockStart = z.shkia;          // lock from sunset
  const tzeit     = z.tzetHakochavim; // reopen at tzeit

  const todayAssur    = isAssur(now);
  const tomorrow      = addDays(now, 1);
  const tomorrowAssur = isAssur(tomorrow);

  // Determine whether we're locked, and which civil date is the active
  // forbidden day (used for the title + reopen calculation).
  let locked = false;
  let activeDate: Date | null = null;

  if (nowMin < lockStart) {
    // Daytime, before sunset — locked only if today is Shabbat/YT and we
    // haven't yet reached its tzeit (i.e. it's the day itself).
    if (todayAssur && nowMin < tzeit) { locked = true; activeDate = now; }
  } else if (nowMin < tzeit) {
    // Between sunset and tzeit
    if (todayAssur)         { locked = true; activeDate = now; }
    else if (tomorrowAssur) { locked = true; activeDate = tomorrow; } // erev → lock from sunset
  } else {
    // After tzeit — the next Jewish day is in effect
    if (tomorrowAssur)      { locked = true; activeDate = tomorrow; }
  }

  if (!locked || !activeDate) return { locked: false, reopenAt: minToStr(tzeit) };

  // Reopen at tzeit of the LAST consecutive assur day (handles 2-day Yom Tov,
  // Yom Tov adjacent to Shabbat, etc.).
  let last = activeDate;
  while (isAssur(addDays(last, 1))) last = addDays(last, 1);
  const zLast    = calcZmanim(last, city.latitude, city.longitude, settings, tz, city.elevation ?? 0);
  const reopenAt = minToStr(zLast.tzetHakochavim);

  // Title / parasha
  const isShabbatDay = activeDate.getDay() === 6; // JS: Saturday = 6
  if (isShabbatDay) {
    let parasha = '';
    try { parasha = fmt.formatParsha(jcal(activeDate)) || ''; } catch {}
    return { locked: true, kind: 'shabbat', title: 'שבת שלום', parasha, reopenAt };
  }

  let title = 'חג שמח';
  try {
    const yt = fmt.formatYomTov(jcal(activeDate));
    if (yt) title = `${yt} · חג שמח`;
  } catch {}
  return { locked: true, kind: 'yomtov', title, reopenAt };
}
