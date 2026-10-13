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
 * Whether a business has published any opening hours at all.
 *
 * businessHoursForDay answers 'סגור' for a day with no hours, which is right
 * for a business that lists Sunday–Thursday and nothing on Shabbat. For one
 * that lists nothing — every business imported from a source that does not
 * publish hours — it turned "we don't know" into "closed" on every day, and
 * people take a red "סגור" at its word. Callers check this first and say the
 * hours are unavailable instead.
 */
export function hasBusinessHours(
  business: { hoursSchedule?: HoursBlock[]; openingHours?: OpeningHours },
): boolean {
  if (business.hoursSchedule?.length) return true;
  return Object.values(business.openingHours ?? {})
    .some((v) => typeof v === 'string' && v.trim() !== '');
}

/**
 * Where a business stands right now, not just whether it has hours today.
 *
 * The pill used to say "פתוח" for any day with hours, so a shop that closed
 * at 14:00 still read as open at 21:00. This answers from the clock, and for
 * split hours says when it opens again — a 08:00–13:00, 16:00–20:00 shop at
 * 14:30 is closed but worth knowing about.
 *
 *   open            open now, until `until` (the end of a merged run of ranges)
 *   opensLater      closed now, opens again today at `at`
 *   closedForToday  had hours today, all of them already over
 *   closedToday     no hours today at all
 *   unknown         no hours published (see hasBusinessHours)
 *   unclear         hours exist but cannot be placed on the clock: a zmanim
 *                   boundary before zmanim load, or free text like "בתיאום"
 *
 * A range ending at or before its start runs past midnight (20:00–02:00), and
 * yesterday's such range is honoured in the small hours. Times are compared
 * on the device clock, the same clock the day-of-week above already uses.
 */
export type OpenStatus =
  | { kind: 'open'; until: string }
  | { kind: 'opensLater'; at: string }
  | { kind: 'closedForToday' }
  | { kind: 'closedToday' }
  | { kind: 'unknown' }
  | { kind: 'unclear' };

const RANGE_RE = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g;

/** A day's opening ranges in minutes since that day's midnight, or null when
 *  the day has hours that cannot be turned into numbers. [] = closed that day. */
function dayRanges(
  business: { hoursSchedule?: HoursBlock[]; openingHours?: OpeningHours },
  day: DayKey,
  zmanim?: ZmanimResult | null,
): [number, number][] | null {
  const span = (s: number, e: number): [number, number] => [s, e <= s ? e + 1440 : e];
  if (business.hoursSchedule?.length) {
    const out: [number, number][] = [];
    for (const b of business.hoursSchedule.filter((x) => x.days.includes(day))) {
      const r = resolveHoursBlock(b, zmanim);
      if (!r) return null;
      const [sh, sm] = r.start.split(':').map(Number);
      const [eh, em] = r.end.split(':').map(Number);
      if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
      out.push(span(sh * 60 + sm, eh * 60 + em));
    }
    return out;
  }
  const text = business.openingHours?.[day]?.trim();
  if (!text || text === 'סגור' || text.toLowerCase() === 'closed') return [];
  const out = [...text.matchAll(RANGE_RE)].map((m) =>
    span(Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])));
  return out.length ? out : null;
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function businessOpenStatus(
  business: { hoursSchedule?: HoursBlock[]; openingHours?: OpeningHours },
  now: Date = new Date(),
  zmanim?: ZmanimResult | null,
): OpenStatus {
  if (!hasBusinessHours(business)) return { kind: 'unknown' };
  const today = DAY_KEYS[now.getDay()];
  const yesterday = DAY_KEYS[(now.getDay() + 6) % 7];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const ranges = dayRanges(business, today, zmanim);
  if (ranges === null) return { kind: 'unclear' };
  // Last night's range still running into this morning. Yesterday's zmanim
  // are not at hand, so an anchored overnight range there is simply skipped.
  for (const [, e] of dayRanges(business, yesterday, null) ?? []) {
    if (e > 1440 && nowMin < e - 1440) return { kind: 'open', until: hhmm(e) };
  }

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (nowMin >= s && nowMin < e) {
      // Back-to-back or overlapping ranges read as one stretch of opening.
      let end = e;
      for (const [s2, e2] of sorted.slice(i + 1)) if (s2 <= end) end = Math.max(end, e2);
      return { kind: 'open', until: hhmm(end) };
    }
  }
  const next = sorted.find(([s]) => s > nowMin);
  if (next) return { kind: 'opensLater', at: hhmm(next[0]) };
  return sorted.length ? { kind: 'closedForToday' } : { kind: 'closedToday' };
}

/** Short Hebrew wording for an OpenStatus, shared by the card and the detail. */
export function openStatusLabel(st: OpenStatus): string {
  switch (st.kind) {
    case 'open':           return `פתוח עכשיו · עד ${st.until}`;
    case 'opensLater':     return `סגור כעת · ייפתח ב-${st.at}`;
    case 'closedForToday': return 'סגור כעת';
    case 'closedToday':    return 'סגור היום';
    case 'unknown':        return 'שעות לא זמינות';
    case 'unclear':        return '';
  }
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
