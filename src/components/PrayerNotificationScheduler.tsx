import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { useSynagogues } from '../hooks/useSynagogues';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { useZmanimSettings } from '../context/ZmanimSettingsContext';
import { useNotifications } from '../context/NotificationsContext';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { calcZmanim } from '../utils/zmanim';
import {
  schedulePrayerNotifications,
  requestNotificationPermissions,
  cancelAllPrayerNotifications,
} from '../utils/prayerNotifications';
import { registerPushToken } from '../services/pushNotifications';

// Expo Go (storeClient) doesn't support local notifications in SDK 53+.
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

/**
 * Headless component — renders nothing but keeps prayer notifications in sync.
 * Silently no-ops inside Expo Go; works fully in dev/production builds.
 */
export default function PrayerNotificationScheduler() {
  const cityId             = useCityId();
  const { synagogues }     = useSynagogues(cityId);
  const { city }           = useCity(cityId);
  const { settings: zmanimSettings } = useZmanimSettings();
  const { enabled, settings: notifSettings } = useNotifications();
  const { favorites } = useFavorites();
  const { appUser, firebaseUser, isGuest } = useAuth();

  const hasPermission    = useRef(false);
  // Tracks *which identity + city* we last registered a token for — a plain boolean would
  // permanently block re-registration after the first success, so logging out (which
  // switches to a fresh anonymous guest uid) would leave the device with no token at
  // all once its old doc is cleared on logout. Keying on uid alone would also miss a home
  // city change for the *same* uid — pushTokens.cityId would go stale and the user would
  // keep receiving the old city's eruv/kashrut alerts instead of the new one.
  const registeredForKey = useRef<string | null>(null);

  // Register push token for any logged-in user (registered or guest), independent of prayer scheduling.
  // Runs as soon as we have a uid + cityId — does NOT require synagogue favorites.
  useEffect(() => {
    if (IS_EXPO_GO) return;
    const uid   = appUser?.uid ?? (isGuest ? firebaseUser?.uid : null);
    const role  = appUser?.role  ?? (isGuest ? 'guest' : null);
    const roles = appUser?.roles ?? (role ? [role] : null);
    if (!uid || !role || !cityId) return;
    const key = `${uid}:${cityId}`;
    if (registeredForKey.current === key) return;

    const timer = setTimeout(async () => {
      if (registeredForKey.current === key) return;
      const granted = await requestNotificationPermissions();
      if (granted) {
        registeredForKey.current = key;
        hasPermission.current = true;
        registerPushToken(uid, cityId, role, roles ?? [role]);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [appUser?.uid, isGuest, firebaseUser?.uid, cityId, appUser?.role]);

  async function reschedule() {
    if (IS_EXPO_GO || !enabled || !city || synagogues.length === 0) return;

    // If no synagogues are starred at all, cancel and bail
    if (Object.keys(favorites).length === 0) {
      await cancelAllPrayerNotifications();
      return;
    }

    try {
      if (!hasPermission.current) {
        hasPermission.current = await requestNotificationPermissions();
        if (!hasPermission.current) return;
      }

      const zmanim = calcZmanim(
        new Date(),
        city.latitude,
        city.longitude,
        zmanimSettings,
        city.timezone || 'Asia/Jerusalem',
        city.elevation ?? 0,
      );

      await schedulePrayerNotifications(synagogues, zmanim, notifSettings, favorites);
    } catch (e) {
      // Notification errors should never crash the app
      console.warn('[PrayerNotifications]', e);
    }
  }

  // Reschedule whenever settings, favorites, or data change
  useEffect(() => { reschedule(); }, [enabled, synagogues, city, zmanimSettings, notifSettings, favorites]);

  // Reschedule when app comes to foreground (handles day rollover)
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') reschedule();
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [enabled, synagogues, city, zmanimSettings, notifSettings, favorites]);

  return null;
}
