import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Mirrors a count onto the OS app-icon badge.
 *
 * This needs no push notifications and no server: the badge is set locally by
 * the app itself, so it works on the free Firebase plan.
 *
 * The trade-off is WHEN it updates. The app can only set the badge while it is
 * running, so the number reflects what was true the last time the manager had
 * the app open. If a report arrives while the app is closed, the badge won't
 * change until they next open it — the badge is a reminder of known work, not a
 * live alert. Delivering the latter genuinely requires a push (see functions/).
 *
 * Android caveat: whether an icon badge appears at all is up to the launcher.
 * One UI / Samsung and Pixel generally honour it; some launchers only show a
 * dot, and others ignore counts entirely unless a notification is also present.
 * iOS shows the number reliably.
 */
export function useAppIconBadge(count: number): void {
  useEffect(() => {
    let cancelled = false;

    const apply = async () => {
      try {
        // Requesting nothing here on purpose — badge permission on iOS is part
        // of the notification permission the app already asks for elsewhere.
        // If it was declined, this call is a harmless no-op.
        await Notifications.setBadgeCountAsync(Math.max(0, count));
      } catch {
        /* launcher or platform doesn't support badges — ignore */
      }
    };

    apply();

    // Re-apply when the app comes back to the foreground: the OS can clear the
    // badge when notifications are dismissed, and the count may have changed
    // while backgrounded.
    const sub = AppState.addEventListener('change', (state) => {
      if (!cancelled && state === 'active') apply();
    });

    return () => { cancelled = true; sub.remove(); };
  }, [count]);

  // Android needs no extra setup beyond the above; kept for clarity that the
  // hook is intentionally platform-agnostic.
  void Platform.OS;
}
