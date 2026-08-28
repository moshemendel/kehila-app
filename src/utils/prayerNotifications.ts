import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Synagogue, Shiur } from '../types';
import { ZmanimResult } from './zmanim';
import { resolveSlotTime, todayDayNumber, parseTimeToMinutes } from './prayerUtils';
import {
  FavoritesMap, FavoriteCustom, PrayerType,
} from '../context/FavoritesContext';

// ─── Notification handler ─────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

// ─── Labels ───────────────────────────────────────────────────────────────────
const PRAYER_LABELS: Record<string, string> = {
  shacharit: 'שחרית',
  mincha:    'מנחה',
  maariv:    'ערבית',
};

// ─── Channels ─────────────────────────────────────────────────────────────────
/**
 * Two channels rather than one setting on one channel, because Android freezes
 * a channel's configuration the first time it is created — editing the values
 * below would do nothing for anyone who has already opened the app. So the
 * quiet and the loud variants are separate channels, and the user's choice
 * decides which one a reminder is posted to.
 */
export const CHANNEL_PRAYERS = 'prayers';
export const CHANNEL_PRAYERS_ALARM = 'prayers-alarm';

export function prayerChannelId(alarmSound: boolean | undefined): string {
  return alarmSound ? CHANNEL_PRAYERS_ALARM : CHANNEL_PRAYERS;
}

/**
 * Identifiers this module owns. Everything scheduled here is given one of
 * these prefixes explicitly; reminders scheduled elsewhere (events,
 * announcements) get auto-generated ids, so a prefix test tells the two apart
 * and lets a prayer reschedule leave other people's notifications alone.
 */
function isPrayerOwned(identifier: string): boolean {
  return identifier.startsWith('prayer-') || identifier.startsWith('shiur-');
}

/**
 * What the last completed run scheduled. PrayerNotificationScheduler re-runs
 * on every foreground resume (to catch the day rolling over) and on any change
 * to synagogues/settings/favourites, but the answer is usually identical —
 * and the work is dozens of sequential native calls, enough to visibly stall
 * the JS thread and make navigation feel stuck for seconds.
 *
 * Null on a cold start on purpose: notifications outlive the process, so the
 * first run of a session cannot assume what is already queued and always does
 * the full pass.
 */
let lastScheduleSignature: string | null = null;

// ─── Permissions ──────────────────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_PRAYERS, {
      name: 'תזכורות תפילה',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B3A6B',   // Colors.primary
      sound: 'default',
    });
    // Same reminder, routed to the alarm audio stream: it follows the alarm
    // volume rather than the (usually much lower) notification volume, and
    // Do Not Disturb normally lets alarms through — which is what makes a
    // 06:00 shacharit reminder actually arrive.
    await Notifications.setNotificationChannelAsync(CHANNEL_PRAYERS_ALARM, {
      name: 'תזכורות תפילה (צלצול)',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: '#1B3A6B',
      sound: 'default',
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
      },
    });
    // Required for admin push notifications that specify channelId: 'default'
    await Notifications.setNotificationChannelAsync('default', {
      name: 'הודעות כלליות',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface NotifSettings {
  minutesBefore: number;
  prayers: Array<PrayerType>;
  /** Post reminders to the alarm stream instead of the notification stream. */
  alarmSound?: boolean;
  /** Minutes before a starred event to remind. See utils/eventReminders. */
  eventLeadTimes?: number[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** True if a shiur applies on today's day number (1=Sun…7=Sat). */
function shiurAppliesToday(sh: Shiur, dayNum: number): boolean {
  return sh.days === 'daily' || (sh.days as number[]).includes(dayNum);
}

/** Slot indices to actually notify for, given the stored setting. */
function prayerSlotIndices(
  custom:    FavoriteCustom,
  type:      PrayerType,
  slotCount: number,
): number[] {
  const stored = custom[type];
  if (!stored || stored.length === 0) return [];
  return stored as number[];
}

function shiurIndices(
  custom:     FavoriteCustom,
  shiurCount: number,
): number[] {
  const stored = custom.shiurim;
  if (!stored) return [];
  if (stored === 'all') return Array.from({ length: shiurCount }, (_, i) => i);
  return stored as number[];
}

// ─── Main scheduler ───────────────────────────────────────────────────────────

/**
 * Cancels all previously scheduled prayer/shiur notifications and schedules
 * fresh ones for today based on the user's favorites.
 *
 * One notification per unique (type, timeMin) combination is fired so that
 * duplicate times across different synagogues collapse into one reminder.
 */
export async function schedulePrayerNotifications(
  synagogues: Synagogue[],
  zmanim:     ZmanimResult,
  settings:   NotifSettings,
  favorites:  FavoritesMap,
): Promise<void> {
  const dayNum = todayDayNumber();
  const now    = new Date();
  const nowMs  = now.getTime();

  // key → { title, body, timeMin }  (deduped by key)
  const pending = new Map<string, { title: string; body: string; timeMin: number }>();

  function enqueue(key: string, title: string, body: string, timeMin: number) {
    if (!pending.has(key)) pending.set(key, { title, body, timeMin });
  }

  for (const syn of synagogues) {
    const setting = favorites[syn.id];
    if (!setting) continue;

    // ── 'all' mode: every prayer slot + every shiur ──────────────────────────
    if (setting === 'all') {
      // Prayers
      for (const type of settings.prayers) {
        for (const slot of syn.weeklySchedule[type] ?? []) {
          if (!(slot.days ?? []).includes(dayNum)) continue;
          const timeStr = resolveSlotTime(slot, zmanim);
          if (!timeStr) continue;
          const timeMin = parseTimeToMinutes(timeStr);
          if (timeMin < 0) continue;
          enqueue(
            `prayer-${type}-${timeMin}`,
            `תפילת ${PRAYER_LABELS[type]}`,
            `בעוד ${settings.minutesBefore} דקות · ${syn.name}`,
            timeMin,
          );
        }
      }
      // Shiurim
      const allShiurim = collectShiurim(syn);
      for (const sh of allShiurim) {
        if (!shiurAppliesToday(sh, dayNum)) continue;
        const timeMin = parseTimeToMinutes(sh.time);
        if (timeMin < 0) continue;
        enqueue(
          `shiur-${sh.id}-${timeMin}`,
          `שיעור: ${sh.title}`,
          `בעוד ${settings.minutesBefore} דקות · ${sh.rabbi ? sh.rabbi + ' · ' : ''}${syn.name}`,
          timeMin,
        );
      }
      continue;
    }

    // ── custom mode ───────────────────────────────────────────────────────────
    const custom = setting as FavoriteCustom;

    // Prayers
    for (const type of settings.prayers) {
      const slots    = syn.weeklySchedule[type] ?? [];
      const indices  = prayerSlotIndices(custom, type, slots.length);
      for (const idx of indices) {
        const slot = slots[idx];
        if (!slot || !(slot.days ?? []).includes(dayNum)) continue;
        const timeStr = resolveSlotTime(slot, zmanim);
        if (!timeStr) continue;
        const timeMin = parseTimeToMinutes(timeStr);
        if (timeMin < 0) continue;
        enqueue(
          `prayer-${type}-${timeMin}`,
          `תפילת ${PRAYER_LABELS[type]}`,
          `בעוד ${settings.minutesBefore} דקות · ${syn.name}`,
          timeMin,
        );
      }
    }

    // Shiurim
    const allShiurim = collectShiurim(syn);
    const selIndices = shiurIndices(custom, allShiurim.length);
    for (const idx of selIndices) {
      const sh = allShiurim[idx];
      if (!sh || !shiurAppliesToday(sh, dayNum)) continue;
      const timeMin = parseTimeToMinutes(sh.time);
      if (timeMin < 0) continue;
      enqueue(
        `shiur-${sh.id}-${timeMin}`,
        `שיעור: ${sh.title}`,
        `בעוד ${settings.minutesBefore} דקות · ${sh.rabbi ? sh.rabbi + ' · ' : ''}${syn.name}`,
        timeMin,
      );
    }
  }

  // ── Work out what actually needs scheduling ──────────────────────────────
  const channelId = prayerChannelId(settings.alarmSound);
  const toSchedule: Array<{ identifier: string; title: string; body: string; seconds: number }> = [];

  for (const [identifier, { title, body, timeMin }] of pending) {
    const triggerMin  = timeMin - settings.minutesBefore;
    const triggerDate = new Date(now);
    triggerDate.setHours(Math.floor(triggerMin / 60), triggerMin % 60, 0, 0);

    const secondsUntil = Math.floor((triggerDate.getTime() - nowMs) / 1000);
    if (secondsUntil <= 0) continue;

    toSchedule.push({ identifier, title, body, seconds: secondsUntil });
  }

  // Bail before touching the bridge at all when this run would reproduce the
  // previous one. Times are bucketed to the minute so that resuming the app
  // a few seconds later — the common case — still counts as unchanged rather
  // than redoing everything because `secondsUntil` ticked down.
  const signature = [
    channelId,
    ...toSchedule
      .map((n) => `${n.identifier}@${Math.round((nowMs + n.seconds * 1000) / 60_000)}`)
      .sort(),
  ].join('|');
  if (signature === lastScheduleSignature) return;

  // ── Replace this module's own notifications ──────────────────────────────
  // Cancel and schedule in parallel: each call is a round trip to the native
  // scheduler, and awaiting dozens of them in series is what made returning
  // to the app feel frozen.
  await cancelAllPrayerNotifications();

  await Promise.all(
    toSchedule.map((n) =>
      Notifications.scheduleNotificationAsync({
        identifier: n.identifier,
        content: { title: n.title, body: n.body, sound: 'default' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: n.seconds,
          repeats: false,
          ...(Platform.OS === 'android' ? { channelId } : {}),
        },
      }).catch(() => {}),
    ),
  );

  lastScheduleSignature = signature;
}

/**
 * Cancel only what this module scheduled.
 *
 * This used to be cancelAllScheduledNotificationsAsync(), which also wiped the
 * community-event and synagogue-announcement reminders — and those keep their
 * own AsyncStorage record of what is scheduled, so reconcileReminders saw a
 * matching signature, concluded nothing needed doing, and never rebuilt them.
 * Every prayer reschedule silently destroyed them; since a reschedule runs on
 * every foreground resume, in practice they did not survive the app being
 * backgrounded.
 *
 * Prayer notifications carry deterministic `prayer-*` / `shiur-*` identifiers
 * while event reminders get auto-generated ones, so ownership is decidable.
 */
export async function cancelAllPrayerNotifications(): Promise<void> {
  lastScheduleSignature = null;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => isPrayerOwned(n.identifier))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch {
    // Never let notification bookkeeping take the app down.
  }
}
