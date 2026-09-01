import { DayKey, HoursBlock, OpeningHours } from '../types';
import { resolveSlotTime, formatAnchorFormula } from './prayerUtils';
import { ZmanimResult } from './zmanim';

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

/** Resolves a block's start/end (each may be a fixed "HH:MM" or anchor-relative)
 *  to concrete "HH:MM" strings. Returns null if an anchor boundary can't yet be
 *  resolved (zmanim not loaded) — callers should treat that as "no hours". */
export function resolveHoursBlock(block: HoursBlock, zmanim?: ZmanimResult | null): { start: string; end: string } | null {
  const start = block.startAnchor
    ? resolveSlotTime({ time: block.start, anchor: block.startAnchor, offsetMin: block.startOffsetMin, proportional: block.startProportional }, zmanim)
    : block.start;
  const end = block.endAnchor
    ? resolveSlotTime({ time: block.end, anchor: block.endAnchor, offsetMin: block.endOffsetMin, proportional: block.endProportional }, zmanim)
    : block.end;
  if (!start || !end) return null;
  return { start, end };
}

/** Formula fallback text for a block whose anchor boundary hasn't resolved yet,
 *  e.g. "שקיעה -30 – 22:00". */
function formatBlockFormula(block: HoursBlock): string {
  const start = block.startAnchor ? formatAnchorFormula(block.startAnchor, block.startOffsetMin ?? 0, block.startProportional) : block.start;
  const end   = block.endAnchor   ? formatAnchorFormula(block.endAnchor,   block.endOffsetMin ?? 0,   block.endProportional)   : block.end;
  return `${start}–${end}`;
}

/** All bookable base-slot times for a date, derived from whichever hour blocks
 *  apply to that day of the week (a day can be covered by more than one block). */
export function slotsForDate(
  hoursSchedule: HoursBlock[] | undefined, dateStr: string, durationMin: number, zmanim?: ZmanimResult | null,
): string[] {
  const day    = dayKeyFromDate(dateStr);
  const blocks = (hoursSchedule ?? []).filter((b) => b.days.includes(day));
  const all    = blocks.flatMap((b) => {
    const resolved = resolveHoursBlock(b, zmanim);
    return resolved ? generateSlots(resolved.start, resolved.end, durationMin) : [];
  });
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

/** Human display text for a day's hours, e.g. "18:00–22:00", "18:00–20:00, 21:00–23:00", or "סגור".
 *  Anchor-relative boundaries resolve to real times when `zmanim` is supplied;
 *  otherwise (or while zmanim is still loading) they fall back to a formula
 *  like "שקיעה -30 – 22:00". */
export function hoursTextForDay(hoursSchedule: HoursBlock[] | undefined, day: DayKey, zmanim?: ZmanimResult | null): string {
  const blocks = (hoursSchedule ?? []).filter((b) => b.days.includes(day));
  if (!blocks.length) return 'סגור';
  return blocks.map((b) => {
    const resolved = resolveHoursBlock(b, zmanim);
    return resolved ? `${resolved.start}–${resolved.end}` : formatBlockFormula(b);
  }).join(', ');
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

/**
 * A business's hours for one day, whichever model that business is on.
 *
 * hoursSchedule is the day-set model shared with the mikvaot; openingHours is
 * the per-day strings that came before it. Both are read here so a listing that
 * has not been re-saved since the change still shows its hours, and so display
 * code never has to know which one it is looking at.
 */
export function businessHoursForDay(
  business: { hoursSchedule?: HoursBlock[]; openingHours?: OpeningHours },
  day: DayKey,
  zmanim?: ZmanimResult | null,
): string {
  if (business.hoursSchedule?.length) return hoursTextForDay(business.hoursSchedule, day, zmanim);
  const legacy = business.openingHours?.[day];
  return legacy && legacy.trim() ? legacy : 'סגור';
}

/**
 * hoursSchedule flattened back into per-day strings.
 *
 * Written alongside every save purely so a client on an older bundle — which
 * reads openingHours and knows nothing of blocks — keeps showing hours until it
 * picks up the update.
 */
export function scheduleToOpeningHours(schedule: HoursBlock[], zmanim?: ZmanimResult | null): OpeningHours {
  const out: OpeningHours = {};
  for (const day of DAY_KEYS) {
    const text = hoursTextForDay(schedule, day, zmanim);
    if (text !== 'סגור') out[day] = text;
  }
  return out;
}
