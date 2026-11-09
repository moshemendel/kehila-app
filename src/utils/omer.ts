import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { JewishCalendar } from 'kosher-zmanim';

/**
 * Which night's count is said TONIGHT, for the civil date given — null when no
 * count is said tonight.
 *
 * The count is made at night, for the day that is just beginning, so it runs a
 * night ahead of the date label: the evening of 15 Nisan counts 1, and the
 * evening of the 48th day counts 49. `getDayOfOmer` is the DAYTIME number (the
 * 16th of Nisan is day 1), so tonight is that plus one — except on 15 Nisan,
 * where today has no number yet but tonight is the first count. The evening of
 * day 49 is the night of Shavuot, when no count is said.
 */
export function omerCountTonight(date: Date): number | null {
  const cal = new JewishCalendar(date);
  cal.setInIsrael(true);
  if (cal.getJewishMonth() === 1 && cal.getJewishDayOfMonth() === 15) return 1;
  const today = cal.getDayOfOmer();
  return today >= 1 && today <= 48 ? today + 1 : null;
}

const DAYS_WORD = (n: number) =>
  n === 1 ? 'יום אחד' : n === 2 ? 'יומיים' : n <= 10 ? `${n} ימים` : `${n} יום`;

/** "היום 15 יום לעומר" — what is said. */
export function omerCountLine(n: number): string {
  return `היום ${DAYS_WORD(n)} לעומר`;
}

/** "שהם שבועיים ויום אחד" — the weeks-and-days half; empty under a week. */
export function omerWeeksLine(n: number): string {
  const w = Math.floor(n / 7);
  const d = n % 7;
  if (w === 0) return '';
  const weeks = w === 1 ? 'שבוע אחד' : w === 2 ? 'שבועיים' : `${w} שבועות`;
  const days = d === 0 ? '' : d === 1 ? ' ויום אחד' : d === 2 ? ' ויומיים' : ` ו-${d} ימים`;
  return `שהם ${weeks}${days}`;
}

// ── Reminder ────────────────────────────────────────────────────────────────

export interface OmerReminder { enabled: boolean; time: string }

const KEY = '@omer_reminder_v1';
const CHANNEL = 'omer';
const ID_PREFIX = 'omer-';
// A window, not the whole season: iOS keeps at most 64 pending local
// notifications for the app and the prayer and event reminders share them. The
// card re-syncs whenever it is shown, so the window rolls forward by itself.
const WINDOW_NIGHTS = 10;
export const DEFAULT_OMER_TIME = '20:30';

export async function loadOmerReminder(): Promise<OmerReminder> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.enabled === 'boolean' && /^\d{1,2}:\d{2}$/.test(p?.time ?? '')) return p;
    }
  } catch {}
  return { enabled: false, time: DEFAULT_OMER_TIME };
}

/**
 * Makes the queued omer notifications match the setting: tears down every
 * `omer-*` one, then — when enabled — queues one per coming night at the chosen
 * time, each carrying ITS night's count (a repeating daily notification could
 * not say which night it is). Returns false when permission was refused, so the
 * caller can say why nothing will arrive.
 */
export async function saveAndSyncOmerReminder(setting: OmerReminder): Promise<boolean> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(setting)); } catch {}
  return syncOmerReminders(setting);
}

export async function syncOmerReminders(setting: OmerReminder): Promise<boolean> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      pending
        .filter((n) => n.identifier.startsWith(ID_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    if (!setting.enabled) return true;

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'ספירת העומר',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const [h, m] = setting.time.split(':').map(Number);
    const now = Date.now();
    for (let i = 0; i < WINDOW_NIGHTS; i++) {
      const day = new Date();
      day.setDate(day.getDate() + i);
      const n = omerCountTonight(day);
      if (n === null) continue;
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0);
      if (at.getTime() <= now + 30_000) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${at.toISOString().slice(0, 10)}`,
        content: {
          title: '🌾 ספירת העומר',
          body: `הערב סופרים: ${omerCountLine(n)}`,
          sound: 'default',
          data: { screen: 'Home' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ── Liturgy ─────────────────────────────────────────────────────────────────

export type OmerNusach = 'ashkenaz' | 'sepharad';

const NUSACH_KEY = '@omer_nusach_v1';

export async function loadOmerNusach(): Promise<OmerNusach> {
  try {
    const v = await AsyncStorage.getItem(NUSACH_KEY);
    if (v === 'ashkenaz' || v === 'sepharad') return v;
  } catch {}
  return 'ashkenaz';
}

export async function saveOmerNusach(n: OmerNusach): Promise<void> {
  try { await AsyncStorage.setItem(NUSACH_KEY, n); } catch {}
}

const ONES: Record<number, string> = {
  1: 'אֶחָד', 2: 'שְׁנַיִם', 3: 'שְׁלֹשָׁה', 4: 'אַרְבָּעָה', 5: 'חֲמִשָּׁה',
  6: 'שִׁשָּׁה', 7: 'שִׁבְעָה', 8: 'שְׁמוֹנָה', 9: 'תִּשְׁעָה', 10: 'עֲשָׂרָה',
};
// Each tens word already carries its "and": 21 is "one AND twenty".
const TENS_AND: Record<number, string> = { 2: 'וְעֶשְׂרִים', 3: 'וּשְׁלֹשִׁים', 4: 'וְאַרְבָּעִים' };
const TENS: Record<number, string> = { 2: 'עֶשְׂרִים', 3: 'שְׁלֹשִׁים', 4: 'אַרְבָּעִים' };

function daysPhrase(n: number): string {
  if (n === 1) return 'יוֹם אֶחָד';
  if (n === 2) return 'שְׁנֵי יָמִים';
  if (n <= 10) return `${ONES[n]} יָמִים`;
  if (n === 11) return 'אַחַד עָשָׂר יוֹם';
  if (n === 12) return 'שְׁנֵים עָשָׂר יוֹם';
  if (n <= 19) return `${ONES[n - 10]} עָשָׂר יוֹם`;
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? `${TENS[t]} יוֹם` : `${ONES[u]} ${TENS_AND[t]} יוֹם`;
}

function weeksPhrase(n: number): string {
  const w = Math.floor(n / 7);
  const d = n % 7;
  if (w === 0) return '';
  const weeks = w === 1 ? 'שָׁבוּעַ אֶחָד' : w === 2 ? 'שְׁנֵי שָׁבוּעוֹת' : `${ONES[w]} שָׁבוּעוֹת`;
  const rest = ['', ' וְיוֹם אֶחָד', ' וּשְׁנֵי יָמִים', ' וּשְׁלֹשָׁה יָמִים',
    ' וְאַרְבָּעָה יָמִים', ' וַחֲמִשָּׁה יָמִים', ' וְשִׁשָּׁה יָמִים'][d];
  return `${weeks}${rest}`;
}

/** The count as said, with vowels: "הַיּוֹם חֲמִשָּׁה עָשָׂר יוֹם, שֶׁהֵם שְׁנֵי שָׁבוּעוֹת וְיוֹם אֶחָד לָעֹמֶר." */
export function omerCountVocalized(n: number): string {
  const w = weeksPhrase(n);
  return `הַיּוֹם ${daysPhrase(n)}${w ? `, שֶׁהֵם ${w}` : ''} לָעֹמֶר.`;
}

export interface LiturgySection { title: string; text: string }

const BLESSING =
  'בָּרוּךְ אַתָּה יְיָ אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ עַל סְפִירַת הָעֹמֶר.';

const HARACHAMAN =
  'הָרַחֲמָן הוּא יַחֲזִיר לָנוּ עֲבוֹדַת בֵּית הַמִּקְדָּשׁ לִמְקוֹמָהּ, בִּמְהֵרָה בְיָמֵינוּ, אָמֵן סֶלָה.';

const PSALM_67 =
  'לַמְנַצֵּחַ בִּנְגִינֹת מִזְמוֹר שִׁיר. אֱלֹהִים יְחָנֵּנוּ וִיבָרְכֵנוּ, יָאֵר פָּנָיו אִתָּנוּ סֶלָה. ' +
  'לָדַעַת בָּאָרֶץ דַּרְכֶּךָ, בְּכָל גּוֹיִם יְשׁוּעָתֶךָ. יוֹדוּךָ עַמִּים אֱלֹהִים, יוֹדוּךָ עַמִּים כֻּלָּם. ' +
  'יִשְׂמְחוּ וִירַנְּנוּ לְאֻמִּים, כִּי תִשְׁפֹּט עַמִּים מִישֹׁר, וּלְאֻמִּים בָּאָרֶץ תַּנְחֵם סֶלָה. ' +
  'יוֹדוּךָ עַמִּים אֱלֹהִים, יוֹדוּךָ עַמִּים כֻּלָּם. אֶרֶץ נָתְנָה יְבוּלָהּ, יְבָרְכֵנוּ אֱלֹהִים אֱלֹהֵינוּ. ' +
  'יְבָרְכֵנוּ אֱלֹהִים, וְיִירְאוּ אוֹתוֹ כָּל אַפְסֵי אָרֶץ.';

const ANA_BEKOACH =
  'אָנָּא, בְּכֹחַ גְּדֻלַּת יְמִינְךָ תַּתִּיר צְרוּרָה. קַבֵּל רִנַּת עַמְּךָ, שַׂגְּבֵנוּ טַהֲרֵנוּ נוֹרָא. ' +
  'נָא גִבּוֹר, דּוֹרְשֵׁי יִחוּדְךָ כְּבָבַת שָׁמְרֵם. בָּרְכֵם טַהֲרֵם, רַחֲמֵי צִדְקָתְךָ תָּמִיד גָּמְלֵם. ' +
  'חֲסִין קָדוֹשׁ, בְּרוֹב טוּבְךָ נַהֵל עֲדָתֶךָ. יָחִיד גֵּאֶה, לְעַמְּךָ פְּנֵה זוֹכְרֵי קְדֻשָּׁתֶךָ. ' +
  'שַׁוְעָתֵנוּ קַבֵּל וּשְׁמַע צַעֲקָתֵנוּ, יוֹדֵעַ תַּעֲלוּמוֹת. ' +
  'בָּרוּךְ שֵׁם כְּבוֹד מַלְכוּתוֹ לְעוֹלָם וָעֶד.';

/**
 * The text for tonight. The blessing and the count are the same in every
 * community; what follows varies, so the sections after them are per nusach.
 * The count is said standing, after nightfall, and the blessing comes first.
 */
export function omerLiturgy(n: number, nusach: OmerNusach): LiturgySection[] {
  const sections: LiturgySection[] = [
    { title: 'הברכה', text: BLESSING },
    { title: 'הספירה', text: omerCountVocalized(n) },
    { title: 'הרחמן', text: HARACHAMAN },
    { title: 'מזמור סז', text: PSALM_67 },
  ];
  if (nusach === 'sepharad') sections.push({ title: 'אנא בכח', text: ANA_BEKOACH });
  return sections;
}
