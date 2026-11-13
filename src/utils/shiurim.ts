import type { Shiur, ShiurAudience, Synagogue, Gender } from '../types';
import type { ZmanimResult } from './zmanim';
import { describeAnchor, resolveSlotTime } from './prayerUtils';

/** A shiur's start as "HH:MM" — computed from zmanim when anchored. '' if unresolvable. */
export function resolveShiurTime(sh: Shiur, zmanim?: ZmanimResult | null): string {
  return resolveSlotTime(sh, zmanim);
}

/** The shiur's time as the rule it follows: the clock time, or "20 דקות לפני השקיעה". */
export function shiurRuleLabel(sh: Shiur): string {
  return sh.anchor ? describeAnchor(sh.anchor, sh.offsetMin ?? 0, sh.proportional) : (sh.time ?? '');
}

/** Collect all shiurim from every location they can appear in a synagogue.
 *  Handles null values that Firestore can return for missing array fields. */
export function collectShiurim(syn: Synagogue): Shiur[] {
  const map = new Map<string, Shiur>();
  const add = (list?: Shiur[] | null) =>
    (list ?? []).forEach((sh) => sh && map.set(sh.id, sh));
  add(syn.weeklySchedule?.shiurim);
  add(syn.shabbatSchedule?.shiurim);
  add(syn.shiurim);
  return Array.from(map.values());
}

/**
 * Subjects a shiur can be filed under. Fixed rather than free text so the filter
 * has a handful of chips instead of one per spelling; "אחר" catches the rest.
 */
export const SHIUR_TOPICS = [
  'גמרא', 'הלכה', 'פרשת שבוע', 'מוסר ומחשבה', 'תנ"ך', 'חסידות', 'אמונה', 'אחר',
] as const;

export const AUDIENCE_LABEL: Record<ShiurAudience, string> = {
  men: 'גברים', women: 'נשים', all: 'כולם',
};

// Checked in order, first hit wins. Keywords are matched against title and
// description, so a shiur filed before `topic` existed still lands somewhere
// sensible instead of all piling into "אחר".
const TOPIC_KEYWORDS: [string, RegExp][] = [
  ['גמרא',       /גמרא|גמ'|מסכת|תלמוד|דף יומי|בבא|סוגי/],
  ['הלכה',       /הלכ|שולחן ערוך|שו"ע|משנה ברורה|פסק|דיני/],
  ['פרשת שבוע',  /פרשת|פרשה|פרשת השבוע|חומש|שבועית/],
  ['תנ"ך',       /תנ"ך|תנך|נביא|תהילים|ספר |נ"ך/],
  ['חסידות',     /חסיד|תניא|ליקוטי|ברסלב|שיחות/],
  ['מוסר ומחשבה', /מוסר|מסילת ישרים|מחשבה|שערי|חובות הלבבות|יראת/],
  ['אמונה',      /אמונה|בטחון|ביטחון|השגחה/],
];

const WOMEN_RE = /לנשים|נשים|לבנות|בנות|אמהות|אימהות/;
const MEN_RE   = /לגברים|גברים|לאברכים|אברכים|לבחורים|בחורים/;

export function shiurTopic(sh: Shiur): string {
  if (sh.topic && (SHIUR_TOPICS as readonly string[]).includes(sh.topic)) return sh.topic;
  const hay = `${sh.title ?? ''} ${sh.description ?? ''}`;
  for (const [topic, re] of TOPIC_KEYWORDS) if (re.test(hay)) return topic;
  return 'אחר';
}

/** Stated audience, else a best guess from the wording, else everyone. */
export function shiurAudience(sh: Shiur): ShiurAudience {
  if (sh.audience === 'men' || sh.audience === 'women' || sh.audience === 'all') return sh.audience;
  const hay = `${sh.title ?? ''} ${sh.description ?? ''}`;
  if (WOMEN_RE.test(hay)) return 'women';
  if (MEN_RE.test(hay))   return 'men';
  return 'all';
}

/** Does a shiur for `audience` suit someone who picked `want`? 'all' fits anyone. */
export function audienceFits(audience: ShiurAudience, want: 'men' | 'women'): boolean {
  return audience === 'all' || audience === want;
}

/** What sendPushToCity wants for an item's audience: 'all'/absent → no gender filter. */
export function pushAudience(audience?: ShiurAudience): 'men' | 'women' | undefined {
  return audience === 'men' || audience === 'women' ? audience : undefined;
}

/** The audience filter an account should start with. 'any'/absent → none. */
export function defaultAudienceFor(gender?: Gender): 'men' | 'women' | null {
  return gender === 'male' ? 'men' : gender === 'female' ? 'women' : null;
}

export function shiurDays(sh: Shiur): number[] {
  return sh.days === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : Array.isArray(sh.days) ? sh.days : [];
}

export interface ShiurItem {
  key: string;
  synagogue: Synagogue;
  shiur: Shiur;
  topic: string;
  audience: ShiurAudience;
  days: number[];
  timeMinutes: number;
  /** Set for an anchored shiur: the rule behind the resolved time. */
  rule?: string;
}

/** Every shiur in the city as one flat list; rows with an unreadable time are dropped.
 *  `zmanimFor` resolves anchored shiurim against each shul's own zmanim. */
export function collectCityShiurim(
  synagogues: Synagogue[],
  parseTime: (t: string) => number,
  zmanimFor?: (synagogue: Synagogue) => ZmanimResult | null,
): ShiurItem[] {
  const out: ShiurItem[] = [];
  for (const synagogue of synagogues) {
    const zmanim = zmanimFor ? zmanimFor(synagogue) : null;
    for (const shiur of collectShiurim(synagogue)) {
      const timeMinutes = parseTime(resolveShiurTime(shiur, zmanim) ?? '');
      if (timeMinutes < 0) continue;
      out.push({
        key: `${synagogue.id}-${shiur.id}`,
        synagogue, shiur,
        topic: shiurTopic(shiur),
        audience: shiurAudience(shiur),
        days: shiurDays(shiur),
        timeMinutes,
        rule: shiur.anchor ? shiurRuleLabel(shiur) : undefined,
      });
    }
  }
  return out;
}
