/**
 * Sending the user to Android's "Alarms & reminders" screen.
 *
 * Prayer reminders are scheduled through expo-notifications, which picks its
 * alarm precision at fire time:
 *
 *   if (SDK < S || alarmManager.canScheduleExactAlarms())
 *     AlarmManagerCompat.setExactAndAllowWhileIdle(...)   // to the minute
 *   else
 *     AlarmManagerCompat.setAndAllowWhileIdle(...)        // may drift in Doze
 *
 * We declare SCHEDULE_EXACT_ALARM, and up to Android 13 that was enough — the
 * permission was granted on install. Android 14 stopped pre-granting it for
 * apps targeting API 34+, which is us. So on those devices the check above
 * fails silently and every reminder falls back to the inexact branch.
 *
 * For "10 minutes before mincha" the difference between exact and "sometime
 * around then" is the difference between making the minyan and missing it, so
 * it is worth asking for. There is no JS API to read whether it was granted —
 * that needs a native call — so instead of nagging, the settings row that
 * calls this is always present and the user decides.
 */
import { Linking, Platform } from 'react-native';

/** Android 14. Below this the permission is granted on install. */
const ANDROID_14 = 34;

export const NEEDS_EXACT_ALARM_OPT_IN =
  Platform.OS === 'android' && Number(Platform.Version) >= ANDROID_14;

export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Opens the system list of apps allowed to set exact alarms.
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    // Not every OEM ships that screen; the app's own settings page always
    // exists, and "Alarms & reminders" sits one tap inside it.
    await Linking.openSettings();
  }
}
