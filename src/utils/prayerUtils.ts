import { PrayerTimes, PrayerTimeSlot, ShabbatSchedule, WeeklySchedule, ZmanimAnchor } from '../types';
import { ZmanimResult } from './zmanim';

const ANCHOR_SHORT: Record<string, string> = {
  netz:         'הנץ',
  shkia:        'שקיעה',
  chatzot:      'חצות',
  plagHamincha: 'פלג',
  minchaGedola: 'מנחה גד׳',
  minchaKetana: 'מנחה קט׳',
  tzeit:        'צאת הכוכבים',
};

// The only anchor whose ZmanimAnchor key doesn't match its ZmanimResult field
// name 1:1 (the rest are indexed directly) — tzetHakochavim is already the
// user's configured tzeit (per their preset's tzetMethod/tzetMinutes).
const ZMANIM_FIELD: Partial<Record<ZmanimAnchor, keyof ZmanimResult>> = {
  tzeit: 'tzetHakochavim',
};

/** Formula string for an anchor-relative time, e.g. "שקיעה +30" or "פלג -5ז׳". */
export function formatAnchorFormula(anchor: ZmanimAnchor, offsetMin = 0, proportional = false): string {
  const base = ANCHOR_SHORT[anchor] ?? anchor;
  const minSuffix = proportional ? 'ז׳' : '׳';
  if (offsetMin === 0) return base;
  return offsetMin > 0 ? `${base} +${offsetMin}${minSuffix}` : `${base} ${offsetMin}${minSuffix}`;
}

// Returns the current local time.
// Target users are in Israel so the device clock equals Israel time.
// toLocaleString({ timeZone }) is unreliable in React Native / Hermes.
function israelNow(): Date {
  return new Date();
}

// 1=Sunday, 2=Monday, ..., 6=Friday, 7=Saturday
export function todayDayNumber(): number {
  const day = israelNow().getDay(); // 0=Sun, 6=Sat
  return day === 6 ? 7 : day + 1;
}

/**
 * Resolves a PrayerTimeSlot to a display time string ("HH:MM").
 * - Fixed slots: returns slot.time as-is.
 * - Relative slots (anchor set): computes time from zmanim + offsetMin.
 *   Returns '' if zmanim not yet available.
 */
export function resolveSlotTime(slot: PrayerTimeSlot, zmanim?: ZmanimResult | null): string {
  if (!slot.anchor) return slot.time;
  if (!zmanim) return '';
  const field = ZMANIM_FIELD[slot.anchor] ?? (slot.anchor as unknown as keyof ZmanimResult);
  const base = zmanim[field] as number;
  if (base < 0) return '';
  // Proportional (halachic) minutes: 1 daka zmanit = sha'ah zmanit / 60
  const factor = slot.proportional ? (zmanim.shaahZmanitGra / 60) : 1;
  const totalMin = base + (slot.offsetMin ?? 0) * factor;
  return minutesToDisplay(Math.max(0, Math.round(totalMin)));
}

export function getTodaySchedule(
  weeklySchedule: WeeklySchedule,
  shabbatSchedule?: ShabbatSchedule,
  zmanim?: ZmanimResult | null,
): PrayerTimes | null {
  const dayNum = todayDayNumber();

  if (dayNum === 7) {
    if (!shabbatSchedule) return null;
    const flat = (slots: PrayerTimeSlot[] = []) =>
      slots.map((s) => resolveSlotTime(s, zmanim)).filter(Boolean);
    return {
      shacharit: flat(shabbatSchedule.shacharit),
      mincha: flat(shabbatSchedule.mincha),
      maariv: flat(shabbatSchedule.maariv),
    };
  }

  const filter = (slots: PrayerTimeSlot[] = []) =>
    slots
      .filter((s) => (s.days ?? []).includes(dayNum))
      .map((s) => resolveSlotTime(s, zmanim))
      .filter(Boolean);

  return {
    shacharit: filter(weeklySchedule.shacharit),
    mincha: filter(weeklySchedule.mincha),
    maariv: filter(weeklySchedule.maariv),
  };
}

// Parse "HH:MM" to minutes since midnight. Returns -1 for empty/unresolvable strings.
export function parseTimeToMinutes(t: string): number {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

export function minutesToDisplay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function nowInMinutes(): number {
  const d = israelNow();
  return d.getHours() * 60 + d.getMinutes();
}

// Returns the next upcoming prayer for today
export function getNextPrayer(times: PrayerTimes): {
  type: 'shacharit' | 'mincha' | 'maariv';
  nextTime: string;
  allTimes: string[];
  hasMore: boolean;
} | null {
  const now = nowInMinutes();

  for (const type of ['shacharit', 'mincha', 'maariv'] as const) {
    const allTimes = times[type];
    if (!allTimes || allTimes.length === 0) continue;
    const upcoming = allTimes.filter((t) => parseTimeToMinutes(t) > now);
    if (upcoming.length > 0) {
      return { type, nextTime: upcoming[0], allTimes, hasMore: allTimes.length > 1 };
    }
  }
  return null;
}

export function formatPrayerLabel(type: string): string {
  const labels: Record<string, string> = {
    shacharit: 'שחרית',
    mincha: 'מנחה',
    maariv: 'ערבית',
  };
  return labels[type] ?? type;
}

export function hebrewDayOfWeek(): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[israelNow().getDay()];
}

// 1=Sunday … 7=Saturday, wrapping around after Shabbat
export function tomorrowDayNumber(): number {
  const today = todayDayNumber();
  return today === 7 ? 1 : today + 1;
}

export function tomorrowDayOfWeek(): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[(israelNow().getDay() + 1) % 7];
}

/**
 * Human-readable label for a single slot, shown in the favourite slot picker.
 * Returns resolved "HH:MM" when zmanim are available, or the anchor formula
 * (e.g. "פלג +5׳") when they are not.
 */
export function getSlotLabel(slot: PrayerTimeSlot, zmanim?: ZmanimResult | null): string {
  if (slot.anchor) {
    // Try to resolve to an actual time
    if (zmanim) {
      const resolved = resolveSlotTime(slot, zmanim);
      if (resolved) return resolved;
    }
    // Fall back to formula
    return formatAnchorFormula(slot.anchor, slot.offsetMin ?? 0, slot.proportional);
  }
  return slot.time || '—';
}

// ─── Day formatting ────────────────────────────────────────────────────────────
const DAY_ABBREV: Record<number, string> = {
  1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ש',
};

// Formats a days array:
//   [1,2,3,4,5,6] → "א-ו"   [1,2,3,4,5] → "א-ה"   [2,5] → "ב', ה'"
export function formatDays(days: number[]): string {
  if (!days || days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);
  const isConsecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);

  if (isConsecutive && sorted.length >= 3) {
    return `${DAY_ABBREV[sorted[0]]}-${DAY_ABBREV[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => `${DAY_ABBREV[d]}'`).join(', ');
}
