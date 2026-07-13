import { GeoLocation, ComplexZmanimCalendar, AstronomicalCalendar } from 'kosher-zmanim';
import type { DateTime } from 'luxon';

export type AlotMethod    = 'proportional' | 'fixed' | 'degrees';
export type PrimaryMethod = 'gra' | 'mga';
export type TzetMethod    = 'fixed' | 'proportional';

export interface ZmanimSettings {
  primaryMethod: PrimaryMethod;
  alotMethod:    AlotMethod;
  alotValue:     number;
  tzetMinutes:   number;
  tzetMethod:    TzetMethod;
  presetKey?:    string;
  /** Days before a fast to show the fast-day card on the home screen. Default 1. */
  taanisLookAheadDays?: number;
}

export interface ZmanimPreset {
  key:         string;
  label:       string;
  posek:       string;
  description: string;
  settings:    ZmanimSettings;
}

export const PRESET_RAV_OVADIA: ZmanimSettings = {
  primaryMethod: 'gra',
  alotMethod:    'proportional',
  alotValue:     72,
  tzetMinutes:   13.5,
  tzetMethod:    'proportional',
  presetKey:     'maran',
};

export const PRESET_GRA: ZmanimSettings = {
  primaryMethod: 'gra',
  alotMethod:    'fixed',
  alotValue:     72,
  tzetMinutes:   13.5,
  tzetMethod:    'fixed',
  presetKey:     'gra',
};

export const PRESET_MGA: ZmanimSettings = {
  primaryMethod: 'mga',
  alotMethod:    'fixed',
  alotValue:     72,
  tzetMinutes:   45,
  tzetMethod:    'fixed',
  presetKey:     'mga',
};

export const PRESET_RABBENU_TAM: ZmanimSettings = {
  primaryMethod: 'gra',
  alotMethod:    'proportional',
  alotValue:     72,
  tzetMinutes:   72,
  tzetMethod:    'proportional',
  presetKey:     'rabbenu_tam',
};

export const PRESET_CHAZON_ISH: ZmanimSettings = {
  primaryMethod: 'gra',
  alotMethod:    'degrees',
  alotValue:     16.1,
  tzetMinutes:   40,
  tzetMethod:    'fixed',
  presetKey:     'chazon_ish',
};

export const ZMANIM_PRESETS: ZmanimPreset[] = [
  {
    key:         'maran',
    label:       'אור החיים',
    posek:       'הרב עובדיה יוסף זצ"ל',
    description: 'עלות 72 ד׳ זמניות | צאת 13.5 ד׳ זמניות (~16 ד׳ בקיץ) | שיטת הגר"א',
    settings:    PRESET_RAV_OVADIA,
  },
  {
    key:         'gra',
    label:       'הגר"א',
    posek:       'הגאון מוילנה',
    description: 'עלות 72 ד׳ קבועות | צאת 13.5 ד׳ קבועות',
    settings:    PRESET_GRA,
  },
  {
    key:         'mga',
    label:       'מ"א',
    posek:       'מגן אברהם',
    description: 'שעה זמנית מעלות השחר | עלות 72 ד׳ קבועות | צאת 45 ד׳ קבועות',
    settings:    PRESET_MGA,
  },
  {
    key:         'rabbenu_tam',
    label:       'רבנו תם',
    posek:       'רבנו תם',
    description: 'עלות 72 ד׳ זמניות | צאת 72 ד׳ זמניות (~85 ד׳ בקיץ) | לצורך מוצ"ש',
    settings:    PRESET_RABBENU_TAM,
  },
  {
    key:         'chazon_ish',
    label:       'חזון איש',
    posek:       'חזון איש',
    description: 'עלות 16.1° מתחת לאופק | צאת 40 ד׳ קבועות',
    settings:    PRESET_CHAZON_ISH,
  },
];

export interface ZmanimResult {
  alot:             number;
  misheyakir:       number;
  netz:             number;
  netzVatikin:      number; // visible/topographic sunrise for ותיקין; -1 when mountainAngle = 0
  sofZmanShma:      number; // GRA: netz + 3 sha'ot GRA
  sofZmanShmaMga:   number; // MGA per Python formula: alot_prop72 + 3 sha'ot MGA
  sofZmanTfila:     number; // GRA: netz + 4 sha'ot GRA
  sofZmanTfilaMga:  number; // MGA per Python formula
  chatzot:          number;
  minchaGedola:     number;
  minchaKetana:     number;
  plagHamincha:     number;
  shkia:            number;
  tzetHakochavim:   number; // per settings.tzetMethod/tzetMinutes
  tzetHakochavim18: number; // always proportional 18 min GRA
  tzetRabbenuTam:   number; // always proportional 72 min GRA (Rabbenu Tam)
  shaahZmanitGra:   number; // minutes
  shaahZmanitMga:   number; // minutes, per Python formula
}

export function minToStr(minutes: number, withSec = false): string {
  if (minutes < 0) return withSec ? '--:--:--' : '--:--';
  const totalSec = Math.round(minutes * 60);
  const h   = Math.floor(totalSec / 3600) % 24;
  const m   = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const hm  = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return withSec ? `${hm}:${String(sec).padStart(2, '0')}` : hm;
}

function toMin(dt: DateTime | null, tzId: string): number {
  if (!dt) return -1;
  const local = dt.setZone(tzId, { keepLocalTime: false });
  return local.hour * 60 + local.minute + local.second / 60;
}

function offset(dt: DateTime | null, ms: number): DateTime | null {
  return AstronomicalCalendar.getTimeOffset(dt, ms);
}

export function calcZmanim(
  date:           Date,
  lat:            number,
  lon:            number,
  settings:       ZmanimSettings,
  tzId =          'Asia/Jerusalem',
  elevationMeters = 0,
  mountainAngle =  0, // angular elevation of horizon in sunrise direction (degrees), for ותיקין
): ZmanimResult {
  // Always pass 0 for elevation — the library uses GeoLocation elevation even with
  // setUseElevation(false). Sea-level is correct per Rav Ovadia for all standard times.
  // ותיקין (visible netz) is computed separately via mountainAngle.
  const geo = new GeoLocation('', lat, lon, 0, tzId);
  const cal = new ComplexZmanimCalendar(geo);
  cal.setDate(date);
  cal.setUseElevation(false);

  const m = (dt: DateTime | null) => toMin(dt, tzId);

  const netz    = cal.getSunrise();
  const shkia   = cal.getSunset();
  const chatzot = cal.getSunTransit();
  if (!netz || !shkia || !chatzot) {
    return {
      alot: -1, misheyakir: -1, netz: -1, netzVatikin: -1,
      sofZmanShma: -1, sofZmanShmaMga: -1,
      sofZmanTfila: -1, sofZmanTfilaMga: -1,
      chatzot: -1, minchaGedola: -1, minchaKetana: -1, plagHamincha: -1,
      shkia: -1, tzetHakochavim: -1, tzetHakochavim18: -1, tzetRabbenuTam: -1,
      shaahZmanitGra: 60, shaahZmanitMga: 60,
    };
  }

  // ── Sha'ah zmanit GRA: (sunset − sunrise) / 12 ───────────────────────────
  const shaahGraMs = cal.getShaahZmanisGra() ?? ((shkia.toMillis() - netz.toMillis()) / 12);

  // ── Proportional alot (72) and tzeit (13.5) — base for MGA sha'ah ────────
  // Matches Python: alos = sunrise − 1.2 × sz_gra; tzeit = sunset + (13.5/60) × sz_gra
  const alotProp72  = offset(netz,  -(72 / 60)  * shaahGraMs);
  const tzeit13Prop = offset(shkia, (13.5 / 60) * shaahGraMs);

  // MGA sha'ah per Python formula: (tzeit_proportional_13.5 − alot_proportional_72) / 12
  const shaahMgaMs = alotProp72 && tzeit13Prop
    ? (tzeit13Prop.toMillis() - alotProp72.toMillis()) / 12
    : (shkia.toMillis() - netz.toMillis() + (72 + 45) * 60_000) / 12;

  // ── Alot for display (per preset settings) ───────────────────────────────
  let alot: DateTime | null;
  if (settings.alotMethod === 'degrees') {
    alot = cal.getSunriseOffsetByDegrees(AstronomicalCalendar.GEOMETRIC_ZENITH + settings.alotValue);
  } else if (settings.alotMethod === 'proportional') {
    alot = alotProp72;
  } else {
    alot = offset(netz, -settings.alotValue * 60_000);
  }

  const misheyakir = alot
    ? offset(alot, (netz.toMillis() - alot.toMillis()) / 3)
    : null;

  // ── ותיקין: visible sunrise — Python: get_time_min(90.833 − mountainAngle) ─
  // kosher-zmanim equivalent: getSunriseOffsetByDegrees(GEOMETRIC_ZENITH + 0.833 − mountainAngle)
  const netzVatikinDt = mountainAngle > 0
    ? cal.getSunriseOffsetByDegrees(AstronomicalCalendar.GEOMETRIC_ZENITH + 0.833 - mountainAngle)
    : null;

  // ── Tzeit per preset ─────────────────────────────────────────────────────
  const tzet = settings.tzetMethod === 'proportional'
    ? offset(shkia, (settings.tzetMinutes / 60) * shaahGraMs)
    : offset(shkia, settings.tzetMinutes * 60_000);

  // Tzeit 18 — always proportional
  const tzet18 = offset(shkia, (18 / 60) * shaahGraMs);
  // Tzeit Rabbenu Tam — always proportional 72 min
  const tzetRt = offset(shkia, (72 / 60) * shaahGraMs);

  return {
    alot:             m(alot),
    misheyakir:       m(misheyakir),
    netz:             m(netz),
    netzVatikin:      m(netzVatikinDt),
    // Shema/Tefila: GRA always from netz; MGA from proportional alot per Python formula
    sofZmanShma:      m(offset(netz,       3     * shaahGraMs)),
    sofZmanShmaMga:   alotProp72 ? m(offset(alotProp72, 3 * shaahMgaMs)) : -1,
    sofZmanTfila:     m(offset(netz,       4     * shaahGraMs)),
    sofZmanTfilaMga:  alotProp72 ? m(offset(alotProp72, 4 * shaahMgaMs)) : -1,
    chatzot:          m(chatzot),
    minchaGedola:     m(offset(chatzot,  0.5   * shaahGraMs)),
    minchaKetana:     m(offset(netz,     9.5   * shaahGraMs)),
    plagHamincha:     m(offset(netz,     10.75 * shaahGraMs)),
    shkia:            m(shkia),
    tzetHakochavim:   m(tzet),
    tzetHakochavim18: m(tzet18),
    tzetRabbenuTam:   m(tzetRt),
    shaahZmanitGra:   shaahGraMs / 60_000,
    shaahZmanitMga:   shaahMgaMs / 60_000,
  };
}
