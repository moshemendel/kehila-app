/**
 * Reminders for starred community events.
 *
 * Prayer reminders and event reminders look alike and are not. A prayer is
 * daily, you already know where it is, and a few minutes' warning is the whole
 * point. A סיום מסכת is once, and the warning has to cover getting ready —
 * showering, dressing, arranging who watches the kids, driving. Minutes are
 * useless there; the useful units are hours and days.
 *
 * These are scheduled by RECONCILIATION rather than at the moment of starring.
 * Scheduling once, on the star, left three holes:
 *
 *   - an event moved by its organiser kept its reminder on the old date
 *   - an event deleted from the feed left its reminders queued anyway
 *   - changing the lead times did nothing to anything already starred
 *
 * So `syncEventReminders` takes the current feed, the current stars and the
 * current lead times, and makes the queue match. Each event's reminders carry
 * a signature of what they were built from; when the signature no longer
 * matches, they are torn down and rebuilt.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CommunityEvent } from '../types';

export const EVENT_CHANNEL = 'events';

export interface EventLeadOption {
  minutes: number;
  label: string;
  /** Notification title at this distance. */
  title: string;
}

export const EVENT_LEAD_OPTIONS: EventLeadOption[] = [
  { minutes: 7 * 24 * 60, label: 'שבוע',   title: '📅 אירוע בעוד שבוע' },
  { minutes: 2 * 24 * 60, label: 'יומיים', title: '📅 אירוע בעוד יומיים' },
  { minutes: 24 * 60,     label: 'יום',    title: '📅 אירוע מחר' },
  { minutes: 2 * 60,      label: 'שעתיים', title: '⏰ אירוע בעוד שעתיים' },
  { minutes: 60,          label: 'שעה',    title: '⏰ אירוע בעוד שעה' },
];

/**
 * Every selected lead time multiplies the pending notifications per starred
 * event. Android is relaxed about this; iOS caps an app at 64 pending local
 * notifications and silently drops the rest, so three is the ceiling.
 */
export const MAX_EVENT_LEAD_TIMES = 3;

/** What the app scheduled before this was configurable. */
export const DEFAULT_EVENT_LEAD_TIMES = [24 * 60, 60];

/** Reminders already queued for one event, and what they were built from. */
interface StoredReminders {
  sig: string;
  ids: string[];
}

function signature(startDate: string, leadTimes: number[]): string {
  return `${startDate}|${[...leadTimes].sort((a, b) => a - b).join(',')}`;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(EVENT_CHANNEL, {
    name: 'תזכורות אירועים',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

async function scheduleFor(
  event: CommunityEvent,
  leadTimes: number[],
): Promise<string[]> {
  const startMs = new Date(event.startDate).getTime();
  const nowMs = Date.now();
  const ids: string[] = [];

  for (const minutes of leadTimes) {
    const secondsUntil = Math.floor((startMs - minutes * 60_000 - nowMs) / 1000);
    // A week's warning on an event three days out is not a reminder anyone can
    // act on, so distances that have already passed just drop out.
    if (secondsUntil < 60) continue;
    const option = EVENT_LEAD_OPTIONS.find((o) => o.minutes === minutes);
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: option?.title ?? '📅 אירוע קרב',
          body: event.title,
          data: { eventId: event.id },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil,
          repeats: false,
          ...(Platform.OS === 'android' ? { channelId: EVENT_CHANNEL } : {}),
        },
      });
      ids.push(id);
    } catch {
      // A single failed reminder should never take the rest down with it.
    }
  }
  return ids;
}

async function cancelIds(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
}

/**
 * Make the queued reminders match the current feed, stars and lead times.
 * Safe to call often — it only touches events whose signature changed.
 */
export async function syncEventReminders(
  events: CommunityEvent[],
  favorites: Set<string>,
  leadTimes: number[],
  storageKey: string,
): Promise<void> {
  const raw = await AsyncStorage.getItem(storageKey).catch(() => null);
  let stored: Record<string, StoredReminders> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Entries written before signatures existed were { dayBefore, hourBefore };
      // they have no sig, so they read as stale and get rebuilt.
      for (const [id, value] of Object.entries<any>(parsed)) {
        stored[id] = Array.isArray(value?.ids)
          ? value
          : { sig: '', ids: Object.values(value ?? {}).filter((v): v is string => typeof v === 'string') };
      }
    } catch {
      stored = {};
    }
  }

  const nowMs = Date.now();
  const wanted = new Map<string, { event: CommunityEvent; sig: string }>();
  for (const event of events) {
    if (!favorites.has(event.id)) continue;
    if (new Date(event.startDate).getTime() <= nowMs) continue;
    wanted.set(event.id, { event, sig: signature(event.startDate, leadTimes) });
  }

  let changed = false;

  // Tear down anything unstarred, deleted, past, moved, or built from a
  // different set of lead times.
  for (const [eventId, entry] of Object.entries(stored)) {
    const want = wanted.get(eventId);
    if (want && want.sig === entry.sig) continue;
    await cancelIds(entry.ids);
    delete stored[eventId];
    changed = true;
  }

  // Build whatever is now missing.
  const toSchedule = [...wanted.entries()].filter(([id]) => !stored[id]);
  if (toSchedule.length > 0) await ensureChannel();
  for (const [eventId, { event, sig }] of toSchedule) {
    const ids = await scheduleFor(event, leadTimes);
    if (ids.length > 0) {
      stored[eventId] = { sig, ids };
      changed = true;
    }
  }

  if (changed) {
    await AsyncStorage.setItem(storageKey, JSON.stringify(stored)).catch(() => {});
  }
}
