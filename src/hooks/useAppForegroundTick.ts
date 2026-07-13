import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// Bumps a counter every time the app returns to the foreground. Date-derived
// values that are memoized off stable deps (e.g. today's zmanim, keyed only on
// city/settings) would otherwise stay frozen at whatever they were on first
// mount — include this tick in such a memo's deps to force a recompute with a
// fresh Date() after the app has been backgrounded. Mirrors the AppState
// pattern already used in PrayerNotificationScheduler.tsx for reschedule-on-
// resume.
export function useAppForegroundTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  return tick;
}
