import { JewishCalendar, HebrewDateFormatter } from 'kosher-zmanim';

const fmt = new HebrewDateFormatter();
fmt.setHebrewFormat(true);

export interface JewishDayInfo {
  /** Parasha of the upcoming Shabbat (this week). Empty string on Shabbat Chol Hamoed / special Shabbatot. */
  parasha: string;
  /** Yom Tov or fast name if today is one, otherwise empty string. */
  yomTov: string;
  /** Rosh Chodesh label (e.g. "ראש חודש סיוון") if today is Rosh Chodesh, otherwise empty string. */
  roshChodesh: string;
  /** Omer count string (e.g. "היום ג׳ בעומר") during the Omer period, empty otherwise. */
  omer: string;
}

/**
 * Returns Jewish calendar metadata for the given date.
 * Uses Israel holiday schedule.
 */
export function getJewishDayInfo(date: Date): JewishDayInfo {
  const cal = new JewishCalendar(date);
  cal.setInIsrael(true);

  // ── Yom Tov / special day ────────────────────────────────────────────────
  let yomTov = '';
  if (cal.isYomTov() || cal.getYomTovIndex() > 0) {
    yomTov = fmt.formatYomTov(cal) ?? '';
  }

  // ── Rosh Chodesh ─────────────────────────────────────────────────────────
  let roshChodesh = '';
  if (cal.isRoshChodesh()) {
    roshChodesh = fmt.formatRoshChodesh(cal) ?? '';
  }

  // ── Parasha of this week (advance to the upcoming Shabbat) ────────────────
  let parasha = '';
  try {
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
    // (6 - dayOfWeek + 7) % 7 gives exact days to reach the upcoming Saturday:
    // Sun(0)→6, Mon(1)→5, Tue(2)→4, Wed(3)→3, Thu(4)→2, Fri(5)→1, Sat(6)→0
    const daysToShabbat = (6 - dayOfWeek + 7) % 7;
    const shabbatDate = new Date(date);
    shabbatDate.setDate(date.getDate() + daysToShabbat);
    const shabbatCal = new JewishCalendar(shabbatDate);
    shabbatCal.setInIsrael(true);
    parasha = fmt.formatParsha(shabbatCal) ?? '';
  } catch {
    // Non-critical — leave empty
  }

  // ── Sefirat HaOmer ───────────────────────────────────────────────────────
  let omer = '';
  if (cal.getDayOfOmer() > 0) {
    omer = fmt.formatOmer(cal) ?? '';
  }

  return { parasha, yomTov, roshChodesh, omer };
}

// ── Yom Tov detection ────────────────────────────────────────────────────────

export interface UpcomingYomTovInfo {
  name: string;            // Hebrew name, e.g. "פסח"
  yomTovDate: Date;        // The actual Yom Tov day
  lastDayDate: Date;       // Last assur-bemelacha day of the period (same as yomTovDate for 1-day YTs)
  daysUntilYomTov: number; // 0 = today, 1 = tomorrow (Erev tonight), etc.
}

/**
 * Returns the next Yom Tov (assur bemelacha, non-Shabbat) within maxLookAheadDays,
 * or null if none. Skips Shabbat days — the Shabbat card handles those.
 */
export function getUpcomingYomTov(date: Date = new Date(), maxLookAheadDays = 30): UpcomingYomTovInfo | null {
  for (let d = 0; d <= maxLookAheadDays; d++) {
    const checkDate = new Date(date);
    checkDate.setDate(date.getDate() + d);

    // Skip Saturday — the Shabbat card handles it
    if (checkDate.getDay() === 6) continue;

    const cal = new JewishCalendar(checkDate);
    cal.setInIsrael(true);

    let yomTovIdx = 0;
    try { yomTovIdx = cal.getYomTovIndex(); } catch { continue; }
    if (yomTovIdx === 0) continue;

    let isAssur = false;
    try { isAssur = cal.isAssurBemelacha(); } catch { continue; }
    if (!isAssur) continue; // Chol Hamoed or Hoshana Rabba

    let name = '';
    try { name = fmt.formatYomTov(cal) ?? ''; } catch {}

    // Find the last consecutive assur-bemelacha Yom Tov day (skip Shabbat in the middle)
    let lastDay = new Date(checkDate);
    for (let extra = 1; extra <= 8; extra++) {
      const nextDate = new Date(checkDate);
      nextDate.setDate(checkDate.getDate() + extra);
      if (nextDate.getDay() === 6) continue;
      const nextCal = new JewishCalendar(nextDate);
      nextCal.setInIsrael(true);
      let nextIdx = 0;
      try { nextIdx = nextCal.getYomTovIndex(); } catch {}
      let nextAssur = false;
      try { nextAssur = nextCal.isAssurBemelacha(); } catch {}
      if (nextIdx > 0 && nextAssur) {
        lastDay = nextDate;
      } else {
        break;
      }
    }

    return { name, yomTovDate: checkDate, lastDayDate: lastDay, daysUntilYomTov: d };
  }
  return null;
}

// ── Fast day detection ───────────────────────────────────────────────────────

export interface UpcomingFastInfo {
  name: string;         // Hebrew name from formatter, e.g. "יז בתמוז"
  daysAhead: number;    // 0 = today, 1 = tomorrow, 2 = in two days, …
  isMajorFast: boolean; // Yom Kippur / Tisha B'Av — starts previous evening
}

/**
 * Returns the next fast within maxLookAhead days (inclusive), or null.
 * Handles postponed fasts automatically (kosher-zmanim moves them to the
 * correct Gregorian date when Shabbat falls on the fast).
 */
export function getUpcomingFast(date: Date = new Date(), maxLookAheadDays = 1): UpcomingFastInfo | null {
  for (let d = 0; d <= maxLookAheadDays; d++) {
    const checkDate = new Date(date);
    checkDate.setDate(date.getDate() + d);
    const cal = new JewishCalendar(checkDate);
    cal.setInIsrael(true);

    let isFast = false;
    try { isFast = cal.isTaanis(); } catch { continue; }
    if (!isFast) continue;

    let name = '';
    try { name = fmt.formatYomTov(cal) ?? ''; } catch {}
    if (name === 'שבעה עשר בתמוז') {
      name = 'צום י"ז בתמוז'; // clarify that it's a public fast
    };
    let isMajorFast = false;
    try { isMajorFast = cal.isYomKippur(); } catch {}
    if (!isMajorFast) {
      try {
        const idx = cal.getYomTovIndex();
        isMajorFast = idx === 11; // JewishCalendar.TISHA_BEAV
      } catch {}
    }

    return { name, daysAhead: d, isMajorFast };
  }
  return null;
}
