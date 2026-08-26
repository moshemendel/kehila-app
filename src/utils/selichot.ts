import { JewishCalendar } from 'kosher-zmanim';

/**
 * Selichot season maths.
 *
 * Two customs, roughly a month apart:
 *
 *  • Sephardim / עדות המזרח — from 2 Elul. When 2 Elul falls on Shabbat (as it
 *    does in 5786) selichot cannot be said that night, so the first night is
 *    Motzaei Shabbat, which by Hebrew reckoning is already 3 Elul.
 *
 *  • Ashkenazim — from the Motzaei Shabbat before Rosh Hashana, but there must
 *    be at least four selichot days before Rosh Hashana; if not, go back a
 *    further week. (5786: Rosh Hashana is Shabbat 12 Sep, the preceding
 *    Motzaei Shabbat is 5 Sep, leaving six days — no extra week needed.)
 *
 * Both run to 9 Tishrei (Erev Yom Kippur). Within that range selichot are NOT
 * said on Shabbat, nor on Rosh Hashana itself (1–2 Tishrei).
 *
 * NOTE ON NUSACH: the season is deliberately NOT inferred from a synagogue's
 * nusach. `nusach` here is free text configured per city, and "נוסח ספרד" is
 * Chassidic-Ashkenazi — it follows the ASHKENAZI start, a month later than
 * "ספרדי / עדות המזרח". Guessing from that string would put a large minority of
 * shuls a month out. A synagogue states its own custom instead
 * (`selichotCustom`), defaulting to the earliest so a shul that never set it is
 * shown rather than hidden.
 */

const TISHREI = 7;
const ELUL = 6;

/**
 * Where one selichot session ends and the next begins.
 *
 * NOT עלות השחר, despite that being the halachic day boundary. The two customs
 * sit on either side of it and grouping by alot merges them:
 *
 *   • Motzaei Shabbat selichot are said at חצות — 00:30, 01:00. Those belong to
 *     the night that just began, i.e. to מוצ״ש.
 *   • Every other day they are אשמורת הבוקר, before shacharit — 04:00, 05:00,
 *     06:00. Those are THAT MORNING's selichot and belong to their own day.
 *
 * Alot in late Elul falls around 04:40, so an alot boundary swept 04:00 and
 * 04:10 backwards into the previous evening and labelled Sunday's early minyan
 * "מוצ״ש". Verified against real pilot data, 22-23/08/2026.
 *
 * 02:00 sits in the empty gap between the two customs — comfortably after the
 * chatzot minyanim and well before the pre-dawn ones — so it is stable even
 * though both drift with the season. It is a display-grouping boundary, not a
 * halachic claim: for "may one still daven arvit", alot remains the answer.
 */
export const NIGHT_CUTOFF_MIN = 2 * 60;

/**
 * Does a minyan at `timeMinutes` belong to the previous evening's session?
 *
 * True for the small hours right after nightfall (00:30 → belongs to the night
 * that began the evening before), false from 02:00 onward (04:00 → that day's
 * own pre-dawn selichot).
 */
export function belongsToPreviousEvening(timeMinutes: number): boolean {
  return timeMinutes < NIGHT_CUTOFF_MIN;
}

const atMidnight = (d: Date): Date => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

const addDays = (d: Date, n: number): Date => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

/** Civil date of a given Hebrew day, searching forward from `from`. */
function findHebrewDate(month: number, day: number, from: Date, limitDays = 400): Date | null {
  for (let i = 0; i < limitDays; i += 1) {
    const d = addDays(from, i);
    const jc = new JewishCalendar(d);
    if (jc.getJewishMonth() === month && jc.getJewishDayOfMonth() === day) return atMidnight(d);
  }
  return null;
}

export interface SelichotWindow {
  /** First civil date on which selichot are said (Sephardi custom). */
  sephardiStart: Date;
  /** First civil date on which selichot are said (Ashkenazi custom). */
  ashkenaziStart: Date;
  /** 9 Tishrei, Erev Yom Kippur — the last day selichot are said. */
  end: Date;
}

/**
 * The selichot window for the season containing (or following) `date`.
 *
 * Dates are the civil day the minyan happens ON. A Motzaei Shabbat minyan at
 * 00:30 belongs to the Sunday it is clocked on — see `selichotNightOf` for the
 * colloquial "which night is this" question.
 */
export function getSelichotWindow(date: Date = new Date()): SelichotWindow | null {
  // Search from a little before Elul of the current Hebrew year.
  const jc = new JewishCalendar(date);
  const searchFrom = jc.getJewishMonth() >= ELUL || jc.getJewishMonth() <= TISHREI
    ? addDays(date, -60)
    : date;

  const elul2 = findHebrewDate(ELUL, 2, searchFrom);
  // 9 Tishrei — Erev Yom Kippur, not Yom Kippur itself.
  const erevYomKippur = elul2 ? findHebrewDate(TISHREI, 9, elul2) : null;
  if (!elul2 || !erevYomKippur) return null;

  // Sephardi: 2 Elul, unless that is Shabbat — then the first night is Motzaei
  // Shabbat, i.e. the minyan is clocked on the following civil day.
  const sephardiStart = elul2.getDay() === 6 ? addDays(elul2, 1) : elul2;

  // Ashkenazi: Motzaei Shabbat before Rosh Hashana; the minyan is clocked on
  // the Sunday. Step back a week if fewer than four selichot days remain.
  const roshHashana = findHebrewDate(TISHREI, 1, elul2);
  if (!roshHashana) return null;
  let sunday = new Date(roshHashana);
  do { sunday = addDays(sunday, -1); } while (sunday.getDay() !== 0);
  const daysBefore = Math.round((roshHashana.getTime() - sunday.getTime()) / 86400000);
  if (daysBefore < 4) sunday = addDays(sunday, -7);

  return { sephardiStart, ashkenaziStart: atMidnight(sunday), end: erevYomKippur };
}

/**
 * Is any shul's selichot season running on `date`?
 *
 * Uses the earliest custom so the Home card appears as soon as the first
 * minyanim start, rather than hiding Sephardi minyanim for a month.
 */
export function isSelichotSeason(date: Date = new Date()): boolean {
  const w = getSelichotWindow(date);
  if (!w) return false;
  const day = atMidnight(date);
  return day >= w.sephardiStart && day <= w.end && !isSelichotExcludedDay(day);
}

/**
 * Is the selichot SEASON open — regardless of whether they are said today?
 *
 * Distinct from `isSelichotSeason`, and the distinction matters. That one
 * excludes Shabbat and Rosh Hashana, which is right for "is there a minyan
 * today" and wrong for "should the screen be reachable": the list looks a week
 * ahead, so on Shabbat afternoon someone checking tonight's Motzaei Shabbat
 * selichot would find the entry had disappeared — at precisely the moment they
 * went looking. Navigation and menus should use this; per-day content should
 * use `isSelichotSeason`.
 *
 * Opens SELICHOT_LEAD_DAYS early so the screen exists while people are still
 * planning, matching `shouldShowSelichot`.
 */
export function isSelichotWindowOpen(date: Date = new Date()): boolean {
  const w = getSelichotWindow(date);
  if (!w) return false;
  const day = atMidnight(date);
  return day >= addDays(w.sephardiStart, -SELICHOT_LEAD_DAYS) && day <= w.end;
}

/**
 * Days on which selichot are not said, inside the season.
 *
 * Shabbat, and Rosh Hashana itself (1–2 Tishrei). The date is the civil day the
 * minyan is CLOCKED on, which is what makes this work for after-midnight
 * minyanim: a Motzaei Shabbat 00:30 minyan is clocked on Sunday and correctly
 * allowed, while a 00:30 minyan clocked on Saturday is Friday night — Shabbat —
 * and correctly excluded.
 */
export function isSelichotExcludedDay(date: Date): boolean {
  if (date.getDay() === 6) return true; // Shabbat
  const jc = new JewishCalendar(date);
  const day = jc.getJewishDayOfMonth();
  return jc.getJewishMonth() === TISHREI && (day === 1 || day === 2); // Rosh Hashana
}

/**
 * Which evening a clock time belongs to.
 *
 * A minyan at 00:30 on Sunday is "Motzaei Shabbat" to everyone who attends it.
 * Returns the civil date of the evening it belongs to, so "tonight's selichot"
 * on Saturday night includes the small hours of Sunday.
 */
export function selichotNightOf(when: Date): Date {
  const mins = when.getHours() * 60 + when.getMinutes();
  return belongsToPreviousEvening(mins)
    ? atMidnight(addDays(when, -1))
    : atMidnight(when);
}

/** As `belongsToPreviousEvening`, from an "HH:MM" string. */
export function isAfterMidnight(time: string): boolean {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  return belongsToPreviousEvening(h * 60 + m);
}

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/**
 * How a selichot slot should read to a human.
 *
 * An after-midnight slot is named for the evening it follows — a Sunday 00:30
 * minyan is "מוצ״ש", not "יום א׳", which is what a gabbai would say and what
 * someone deciding whether to go tonight needs to see.
 */
export function selichotDayLabel(dayNum: number, time: string): string {
  // days[] is 1=Sunday … 7=Shabbat, matching the rest of the app.
  const idx = ((dayNum - 1) % 7 + 7) % 7;
  if (isAfterMidnight(time)) {
    const prev = (idx + 6) % 7;
    return prev === 6 ? 'מוצ״ש' : `ליל ${DAY_LABELS[idx]}`;
  }
  return `יום ${DAY_LABELS[idx]}`;
}

/**
 * When a specific synagogue's selichot begin, for the season around `date`.
 *
 * The shul's stated custom, defaulting to the earliest — being a week early is
 * a smaller failure than a congregant not finding a minyan that is running.
 */
export function synagogueSelichotStart(
  syn: { selichotCustom?: 'sephardi' | 'ashkenazi' },
  date: Date = new Date(),
): Date | null {
  const w = getSelichotWindow(date);
  if (!w) return null;
  // Unset defaults to the earliest custom, so a shul that published times but
  // never stated a custom is shown rather than hidden.
  return syn.selichotCustom === 'ashkenazi' ? w.ashkenaziStart : w.sephardiStart;
}

/** Days of warning before a shul's selichot begin, so people can plan. */
export const SELICHOT_LEAD_DAYS = 7;

/**
 * Should this shul's selichot be shown yet?
 *
 * True from a week before its own start through the end of the season, so a
 * congregant can see "selichot begin Motzaei Shabbat at 00:30" while there is
 * still time to plan, rather than discovering it the morning after.
 */
export function shouldShowSelichot(
  syn: { selichotCustom?: 'sephardi' | 'ashkenazi' },
  date: Date = new Date(),
): boolean {
  const w = getSelichotWindow(date);
  const start = synagogueSelichotStart(syn, date);
  if (!w || !start) return false;
  const day = atMidnight(date);
  return day >= addDays(start, -SELICHOT_LEAD_DAYS) && day <= w.end;
}

/** Days until this shul's selichot begin; 0 once they have. */
export function daysUntilSelichot(
  syn: { selichotCustom?: 'sephardi' | 'ashkenazi' },
  date: Date = new Date(),
): number {
  const start = synagogueSelichotStart(syn, date);
  if (!start) return 0;
  const diff = Math.ceil((start.getTime() - atMidnight(date).getTime()) / 86400000);
  return Math.max(0, diff);
}
