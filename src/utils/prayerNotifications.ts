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

// ─── Permissions ──────────────────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('prayers', {
      name: 'תזכורות תפילה',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B3A6B',   // Colors.primary
      sound: 'default',
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
  await Notifications.cancelAllScheduledNotificationsAsync();

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

  // ── Fire all collected notifications ─────────────────────────────────────
  for (const [identifier, { title, body, timeMin }] of pending) {
    const triggerMin  = timeMin - settings.minutesBefore;
    const triggerDate = new Date(now);
    triggerDate.setHours(Math.floor(triggerMin / 60), triggerMin % 60, 0, 0);

    const secondsUntil = Math.floor((triggerDate.getTime() - nowMs) / 1000);
    if (secondsUntil <= 0) continue;

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: 'default' },
      trigger: { seconds: secondsUntil, repeats: false } as any,
    });
  }
}

export async function cancelAllPrayerNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
