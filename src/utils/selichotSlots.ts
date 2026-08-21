import { JewishCalendar, HebrewDateFormatter } from 'kosher-zmanim';
import { Synagogue, PrayerTimeSlot } from '../types';
import { resolveSlotTime, parseTimeToMinutes } from './prayerUtils';
import {
  getSelichotWindow, belongsToPreviousEvening,
  synagogueSelichotStart, isSelichotExcludedDay,
} from './selichot';

/** How far ahead to list. A week is enough to plan around without being noise. */
const LOOKAHEAD_DAYS = 7;

export interface SelichotOccurrence {
  synagogue: Synagogue;
  /** Resolved clock time, "HH:MM". */
  time: string;
  timeMinutes: number;
  /** 1=Sunday … 7=Shabbat — the civil day this is clocked on. */
  dayNum: number;
  /**
   * Absolute start time, ms since epoch.
   *
   * Kept because "how long until this starts" cannot be recovered from
   * `timeMinutes` alone: an after-midnight slot is grouped under the PREVIOUS
   * evening, so its clock time is smaller than now's while still being in the
   * future. The screen needs the real instant to judge whether you can get there.
   */
  whenMs: number;
  notes?: string | null;
  distanceKm: number | null;
}

export interface SelichotNight {
  /** Stable key — the civil date of the evening this night belongs to. */
  key: string;
  /** Human label, e.g. "מוצ״ש · 16/08" or "הלילה". */
  label: string;
  /** Hebrew date of the minyan itself, e.g. "ג׳ אלול". */
  hebrewLabel: string;
  /** Short civil date of the evening, e.g. "15/08". */
  dateLabel: string;
  occurrences: SelichotOccurrence[];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const p2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

/** 1=Sunday … 7=Shabbat, matching PrayerTimeSlot.days. */
const dayNumOf = (d: Date) => (d.getDay() === 6 ? 7 : d.getDay() + 1);

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const hebFmt = new HebrewDateFormatter();
hebFmt.setHebrewFormat(true);

/** "ג׳ אלול" for the given civil date. */
function hebrewDayLabel(d: Date): string {
  const jc = new JewishCalendar(d);
  return `${hebFmt.formatHebrewNumber(jc.getJewishDayOfMonth())} ${hebFmt.formatMonth(jc)}`;
}

/**
 * Does this slot happen on `date`?
 *
 * A slot is either a list of dates (`dates`) or a weekly pattern (`days`) — see
 * PrayerTimeSlot. A pattern with no days at all is treated as every weekday,
 * matching how the admin slot card renders it ("א–ו").
 */
function slotOccursOn(slot: PrayerTimeSlot, date: Date): boolean {
  if (slot.dates?.length) return slot.dates.includes(isoOf(date));
  const days = slot.days ?? [];
  if (days.length === 0) return dayNumOf(date) !== 7; // weekdays
  return days.includes(dayNumOf(date));
}

/**
 * Gather upcoming selichot minyanim, grouped by the evening they belong to.
 *
 * The grouping is the subtle part: a minyan clocked at 00:30 on Sunday is
 * "Motzaei Shabbat" to everyone attending, so it is grouped under Saturday
 * evening rather than shown as a Sunday morning minyan (see NIGHT_CUTOFF_HOUR).
 *
 * Only nights inside the selichot season are returned, so this is safe to call
 * year-round — outside the season it yields nothing.
 */
export function collectSelichot(
  synagogues: Synagogue[],
  zmanim: Parameters<typeof resolveSlotTime>[1],
  userLoc: { lat: number; lon: number } | null,
): SelichotNight[] {
  const window = getSelichotWindow();
  if (!window) return [];

  const now = new Date();
  // Dawn is the day boundary — before it a minyan belongs to the previous
  // evening. Read from the day's zmanim so it tracks the season, not a guess.
  const alot = (zmanim as { alot?: number } | null | undefined)?.alot ?? null;
  const byNight = new Map<string, SelichotOccurrence[]>();

  for (let i = 0; i <= LOOKAHEAD_DAYS; i += 1) {
    const date = addDays(now, i);
    // Season bounds are inclusive; the earliest custom opens the window.
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    if (dayStart < window.sephardiStart || dayStart > window.end) continue;
    // No selichot on Shabbat or on Rosh Hashana, even mid-season.
    if (isSelichotExcludedDay(dayStart)) continue;

    for (const syn of synagogues) {
      const slots = syn.weeklySchedule?.selichot ?? [];
      if (slots.length === 0) continue;

      // Each shul starts on its own custom's date — Sephardi shuls a month
      // before Ashkenazi ones. Without this a recurring slot would surface from
      // the earliest custom for everyone.
      const synStart = synagogueSelichotStart(syn, date);
      if (synStart && dayStart < synStart) continue;

      const distanceKm = userLoc && syn.latitude && syn.longitude
        ? haversineKm(userLoc.lat, userLoc.lon, syn.latitude, syn.longitude)
        : null;

      for (const slot of slots) {
        if (!slotOccursOn(slot, date)) continue;
        const time = resolveSlotTime(slot, zmanim);
        if (!time) continue;
        const timeMinutes = parseTimeToMinutes(time);
        if (timeMinutes < 0) continue;

        // Skip minyanim that have already happened.
        const when = new Date(date);
        when.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
        if (when.getTime() < now.getTime()) continue;

        // Group under the evening it belongs to.
        const nightDate = belongsToPreviousEvening(timeMinutes) ? addDays(date, -1) : date;
        const key = isoOf(nightDate);
        const list = byNight.get(key) ?? [];
        list.push({
          synagogue: syn,
          time,
          timeMinutes,
          whenMs: when.getTime(),
          dayNum: dayNumOf(date),
          notes: slot.notes,
          distanceKm,
        });
        byNight.set(key, list);
      }
    }
  }

  const todayKey = isoOf(now);
  return [...byNight.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, unsorted]) => {
      // Chronological within the session, by absolute instant rather than clock
      // time. A selichot day runs 04:00 → … → 00:30, and that last one is
      // clocked on the NEXT civil date: sorting on timeMinutes would put 00:30
      // first, at the head of a day it actually closes. whenMs has no such
      // wraparound.
      //
      // Sorted here rather than in the screen because callers assume it —
      // HomeScreen shows occurrences[0] as "המוקדם", which was only accidentally
      // right whenever iteration order happened to agree.
      const occurrences = [...unsorted].sort((a, b) => a.whenMs - b.whenMs);
      const d = new Date(`${key}T12:00:00`);
      const dateTxt = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;

      // A group is a DAY, named for the day it belongs to — not for the night
      // that follows it. Sunday's group holds Sunday's pre-dawn selichot, its
      // morning and evening minyanim, AND the 00:30 one clocked on Monday: one
      // session running from before netz through to after midnight. Naming that
      // "ליל שני" pointed at the wrong day entirely.
      //
      // Shabbat is the exception. No selichot are said during the day, so a
      // group keyed to Saturday contains only the post-Shabbat night minyanim —
      // which everyone calls מוצ״ש, not "יום שבת".
      const isMotzaeiShabbat = d.getDay() === 6;

      // The Hebrew date follows the MINYAN: a מוצ״ש group is keyed to Saturday,
      // but its minyanim run after nightfall and are already the next Hebrew day.
      const hebrewLabel = hebrewDayLabel(isMotzaeiShabbat ? addDays(d, 1) : d);

      const isToday = key === todayKey;
      const label = isMotzaeiShabbat
        ? `מוצ״ש · ${dateTxt}`
        : isToday
          ? `היום · ${dateTxt}`
          : `יום ${DAY_LABELS[d.getDay()]} · ${dateTxt}`;
      return { key, label, hebrewLabel, dateLabel: dateTxt, occurrences };
    });
}

/** Count of minyanim on the nearest upcoming night — drives the Home card. */
export function nextSelichotNight(nights: SelichotNight[]): SelichotNight | null {
  return nights[0] ?? null;
}
