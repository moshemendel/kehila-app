import { DayKey, HoursBlock } from '../types';

// ─── Slot generation ──────────────────────────────────────────────────────────

/** Generate HH:MM slot strings between start..end with the given duration.
 *  Last slot satisfies: slotStart + duration <= end
 *  e.g. start=18:00, end=23:00, duration=20 → last slot 22:40 (22:40+20=23:00) */
export function generateSlots(start: string, end: string, durationMin: number): string[] {
  const toMin = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toStr = (min: number): string => {
    const h = String(Math.floor(min / 60)).padStart(2, '0');
    const m = String(min % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  if (!start || !end || durationMin <= 0) return [];
  const s = toMin(start);
  const e = toMin(end);
  if (isNaN(s) || isNaN(e) || s >= e) return [];

  const result: string[] = [];
  for (let t = s; t + durationMin <= e; t += durationMin) {
    result.push(toStr(t));
  }
  return result;
}

/** Add whole minutes to an "HH:MM" string, e.g. addMinutesToTime("22:40", 20) → "23:00" */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total  = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** All bookable base-slot times for a date, derived from whichever hour blocks
 *  apply to that day of the week (a day can be covered by more than one block). */
export function slotsForDate(hoursSchedule: HoursBlock[] | undefined, dateStr: string, durationMin: number): string[] {
  const day    = dayKeyFromDate(dateStr);
  const blocks = (hoursSchedule ?? []).filter((b) => b.days.includes(day));
  const all    = blocks.flatMap((b) => generateSlots(b.start, b.end, durationMin));
  return Array.from(new Set(all)).sort();
}

/** Per-base-slot occupancy count: expands each appointment's span by its
 *  slotsCount and tallies how many appointments currently claim each slot. */
export function computeOccupancy(
  appts: { time: string; slotsCount?: number }[],
  durationMin: number,
): Map<string, number> {
  const m = new Map<string, number>();
  appts.forEach((a) => {
    const n = a.slotsCount ?? 1;
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? a.time : addMinutesToTime(a.time, i * durationMin);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
  });
  return m;
}

// ─── Date helpers (always parse as LOCAL time to avoid UTC-shift issues) ─────

export function todayString(): string {
  const now = new Date();
  return localDateString(now);
}

export function localDateString(date: Date): string {
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Parse YYYY-MM-DD as local date (avoids UTC midnight off-by-one) */
export function parseLocalDate(dateStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

// ─── Day-of-week ──────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** Human display text for a day's hours, e.g. "18:00–22:00", "18:00–20:00, 21:00–23:00", or "סגור". */
export function hoursTextForDay(hoursSchedule: HoursBlock[] | undefined, day: DayKey): string {
  const blocks = (hoursSchedule ?? []).filter((b) => b.days.includes(day));
  if (!blocks.length) return 'סגור';
  return blocks.map((b) => `${b.start}–${b.end}`).join(', ');
}

export function dayKeyFromDate(dateStr: string): DayKey {
  return DAY_KEYS[parseLocalDate(dateStr).getDay()];
}

// ─── Hebrew display helpers ───────────────────────────────────────────────────

const DAYS_LONG  = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_SHORT = ["א'",    "ב'",  "ג'",    "ד'",    "ה'",    "ו'",   "ש'"];
const MONTHS_HE  = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];
const MONTHS_SHORT = [
  'ינו','פבר','מרץ','אפר','מאי','יוני',
  'יול','אוג','ספט','אוק','נוב','דצמ',
];

/** "יום שלישי, 9 ביוני 2026" */
export function formatDateHeLong(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `יום ${DAYS_LONG[d.getDay()]}, ${d.getDate()} ב${MONTHS_HE[d.getMonth()]} ${d.getFullYear()}`;
}

/** "09.06 (ג')" */
export function formatDateHeShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${mo} (${DAYS_SHORT[d.getDay()]})`;
}

/** Returns short day letter "א'" etc. */
export function dayLetterFromDate(dateStr: string): string {
  return DAYS_SHORT[parseLocalDate(dateStr).getDay()];
}

/** Returns short month "יוני" etc. */
export function monthShortFromDate(dateStr: string): string {
  return MONTHS_SHORT[parseLocalDate(dateStr).getMonth()];
}

// ─── Slot-past logic ──────────────────────────────────────────────────────────

/** True if the slot is in the past (already elapsed). */
export function isSlotInPast(dateStr: string, timeStr: string): boolean {
  const today = todayString();
  if (dateStr < today) return true;
  if (dateStr > today) return false;
  // Same day — compare current clock
  const now     = new Date();
  const [h, m]  = timeStr.split(':').map(Number);
  const nowMin  = now.getHours() * 60 + now.getMinutes();
  const slotMin = h * 60 + m;
  return slotMin <= nowMin;
}
