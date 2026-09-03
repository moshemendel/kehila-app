import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { useSynagoguesFeed } from '../context/SynagoguesContext';
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
  const { synagogues }     = useSynagoguesFeed();
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

  /**
   * The identity as it is right now, not as it was when a registration was
   * queued. Read at write time — see the effect below for why that distinction
   * is the whole bug.
   */
  const identity = useRef<{ uid: string | null; role: string | null; roles: string[] | null; cityId: string }>({
    uid: null, role: null, roles: null, cityId,
  });

  // Register push token for any logged-in user (registered or guest), independent of prayer scheduling.
  // Runs as soon as we have a uid + cityId — does NOT require synagogue favorites.
  useEffect(() => {
    if (IS_EXPO_GO) return;
    // Always the live Auth uid, never appUser.uid (a field self-reported on the
    // Firestore profile doc) — Firestore rules check pushTokens.uid against
    // request.auth.uid, so anything else risks a mismatch the rule will reject.
    const uid   = firebaseUser?.uid ?? null;
    const role  = appUser?.role  ?? (isGuest ? 'guest' : null);
    const roles = appUser?.roles ?? (role ? [role] : null);
    identity.current = { uid, role, roles, cityId };

    if (!uid || !role || !cityId) return;
    const key = `${uid}:${cityId}`;
    if (registeredForKey.current === key) return;

    const timer = setTimeout(async () => {
      if (registeredForKey.current === key) return;
      const granted = await requestNotificationPermissions();
      if (!granted) return;

      // WHO WE ARE NOW, not who we were three seconds ago.
      //
      // This wrote permission-denied on every sign-in, and the payload said
      // why: role=guest, roles=["guest"], sent nine seconds after the guest had
      // stopped existing. The timer was queued during the anonymous session,
      // fired, and then blocked on the permission prompt above — and while it
      // waited, the user signed in. It resumed and wrote the values it had
      // closed over, against an identity that was no longer theirs, failing the
      // rule twice over: the uid no longer matched request.auth.uid, and
      // 'guest' is not the role on the profile.
      //
      // clearTimeout cannot help. The cleanup cancels a timer that has not
      // fired; this one had, and was sitting in an await where nothing can
      // reach it. So the guard belongs after the await, not before it.
      const now = identity.current;
      if (!now.uid || !now.role) return;
      if (`${now.uid}:${now.cityId}` !== key) return; // a newer effect owns this

      registeredForKey.current = key;
      hasPermission.current = true;
      registerPushToken(now.uid, now.cityId, now.role, now.roles ?? [now.role]);
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
