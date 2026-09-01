import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserDoc, reloadAuthUser, appUserCacheKey } from '../services/auth';
import { updateUserCity, updateUserHomeCity } from '../services/users';
import { getGuestCityId, setGuestCityId } from '../services/guestCity';
import { initAnalytics, clearAnalytics } from '../services/analytics';
import { AppUser } from '../types';
import { mark } from '../utils/startupTrace';

export const DEMO_USER: AppUser = {
  uid: 'demo',
  email: 'demo@kehila.app',
  displayName: 'משתמש הדגמה',
  cityId: 'city-1',
  role: 'city_admin',
  managedSynagogueIds: ['syn-1', 'syn-2'],
  managedRestaurantIds: ['rest-1', 'rest-2'],
  createdAt: new Date(),
};

interface AuthContextValue {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  isDemo: boolean;
  isGuest: boolean; // signed in anonymously — can receive eruv push, no account
  /** True once the address on the account has been confirmed. Google sign-ins arrive verified. */
  emailVerified: boolean;
  /** A real (non-guest, non-demo) account whose address is still unconfirmed. */
  needsEmailVerification: boolean;
  /** Re-read auth state from the server — `emailVerified` is cached in the ID token. */
  refreshAuthState: () => Promise<boolean>;
  guestCityId: string | null; // a guest's locally-persisted city override, if any
  loginAsDemo: () => void;
  exitDemo: () => void;
  refreshUser: (user?: User) => Promise<void>;
  switchCity: (cityId: string) => Promise<void>;
  updateHomeCity: (cityId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  appUser: null,
  loading: true,
  isDemo: false,
  isGuest: false,
  emailVerified: false,
  needsEmailVerification: false,
  refreshAuthState: async () => false,
  guestCityId: null,
  loginAsDemo: () => {},
  exitDemo: () => {},
  refreshUser: async () => {},
  switchCity: async () => {},
  updateHomeCity: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [guestCityId, setGuestCityIdState] = useState<string | null>(null);

  // The onAuthStateChanged effect below registers its listener once ([] deps)
  // and never re-runs, so its callback closes over isDemo as it was at mount
  // (always false) — entering demo mode later is invisible to it. A ref stays
  // current across renders without needing the effect to re-subscribe, so the
  // listener always sees the live value instead of that stale snapshot.
  const isDemoRef = useRef(isDemo);
  useEffect(() => { isDemoRef.current = isDemo; }, [isDemo]);

  // Load the device's persisted guest-city override once we know we're a guest.
  useEffect(() => {
    if (!isGuest) { setGuestCityIdState(null); return; }
    getGuestCityId().then(setGuestCityIdState);
  }, [isGuest]);

  function loginAsDemo() {
    setAppUser(DEMO_USER);
    setIsDemo(true);
    initAnalytics(DEMO_USER.uid, DEMO_USER.cityId);
  }

  function exitDemo() {
    setAppUser(null);
    setIsDemo(false);
    clearAnalytics();
  }

  async function loadAppUser(user: User) {
    try {
      const doc = await getUserDoc(user.uid);
      setAppUser(doc);
      if (doc) {
        initAnalytics(user.uid, doc.cityId);
        AsyncStorage.setItem(appUserCacheKey(user.uid), JSON.stringify(doc)).catch(() => {});
      }
    } catch {
      // Firebase not configured yet — ignore
    }
  }

  // Accepts an explicit user (e.g. straight from a just-resolved sign-in/sign-up
  // call) rather than always trusting the firebaseUser closed over here — a
  // caller's own closure (formed before the auth state changed, e.g. a login
  // screen's onPress handler) can be stale by the time this actually runs,
  // silently reloading against the *previous* identity (often a guest's
  // anonymous uid) and clobbering the correct data onAuthStateChanged just set.
  async function refreshUser(user?: User) {
    if (isDemo) return;
    const target = user ?? firebaseUser;
    if (target) await loadAppUser(target);
  }

  /**
   * Ask the server whether the address has been confirmed since last we looked.
   *
   * Returns the fresh value rather than relying on the state update, so a caller
   * can act on the answer in the same tick ("still not verified — try again").
   */
  async function refreshAuthState(): Promise<boolean> {
    try {
      const fresh = await reloadAuthUser();
      const verified = fresh?.emailVerified ?? false;
      setEmailVerified(verified);
      return verified;
    } catch {
      return emailVerified;
    }
  }

  async function switchCity(cityId: string) {
    if (isDemo) {
      // Demo mode: just update local state
      setAppUser((u) => u ? { ...u, cityId } : u);
      return;
    }
    if (isGuest) {
      // Guests have no Firestore user doc to write cityId onto — persisted
      // locally instead. Update state first so the UI reacts immediately.
      setGuestCityIdState(cityId);
      await setGuestCityId(cityId).catch(() => {});
      return;
    }
    if (!firebaseUser) return;
    // Optimistic update so UI reacts immediately
    setAppUser((u) => u ? { ...u, cityId } : u);
    await updateUserCity(firebaseUser.uid, cityId);
  }

  // Relocates the user's permanent home city — unlike switchCity, this also updates
  // homeCityId, which is what eruv/kashrut push targeting and (for a city_admin)
  // admin jurisdiction are keyed off. Blocked server-side for city_admin accounts.
  async function updateHomeCity(cityId: string) {
    if (isDemo) {
      setAppUser((u) => u ? { ...u, cityId, homeCityId: cityId } : u);
      return;
    }
    if (!firebaseUser) return;
    setAppUser((u) => u ? { ...u, cityId, homeCityId: cityId } : u);
    await updateUserHomeCity(firebaseUser.uid, cityId);
  }

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onAuthStateChanged(auth, async (user) => {
        setFirebaseUser(user);
        setEmailVerified(user?.emailVerified ?? false);
        if (!user) {
          if (!isDemoRef.current) { setAppUser(null); setIsGuest(false); }
          // Sign in anonymously so guests can receive eruv push notifications
          signInAnonymously(auth).catch(() => {});
          mark('auth resolved (guest)');
          setLoading(false);
        } else if (user.isAnonymous) {
          // Guest: Firebase user exists but no Firestore account
          if (!isDemoRef.current) { setAppUser(null); setIsGuest(true); }
          mark('auth resolved (anonymous)');
          setLoading(false);
        } else {
          setIsGuest(false);
          // Nothing at all renders until `loading` clears (RootNavigator gates
          // the whole app on it), so waiting on a Firestore round-trip here
          // meant every cold start for a signed-in user held the splash open
          // for a full network fetch. The account doc barely changes between
          // launches, so the last-known copy is shown immediately and the
          // fresh one swapped in behind it.
          //
          // Restoring it before clearing `loading` also matters for
          // correctness, not just speed: useCityId() falls back to 'city-1'
          // while appUser is null, so rendering first and filling in after
          // would start every city-scoped listener against the wrong city and
          // restart them all a moment later.
          const cachedRaw = await AsyncStorage.getItem(appUserCacheKey(user.uid)).catch(() => null);
          if (cachedRaw) {
            try {
              const cachedUser = JSON.parse(cachedRaw) as AppUser;
              setAppUser(cachedUser);
              initAnalytics(user.uid, cachedUser.cityId);
              mark('auth resolved (cached account)');
              setLoading(false);
              loadAppUser(user); // refresh in the background
            } catch {
              await loadAppUser(user);
              setLoading(false);
            }
          } else {
            // First launch after install — nothing cached yet, so this one
            // still waits.
            await loadAppUser(user);
            mark('auth resolved (fetched account)');
            setLoading(false);
          }
        }
      });
    } catch {
      setLoading(false);
    }
    return () => unsub?.();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser, appUser, loading, isDemo, isGuest, guestCityId,
        emailVerified,
        // Guests have no address to confirm, and demo mode isn't a real account.
        needsEmailVerification: !!firebaseUser && !firebaseUser.isAnonymous && !isDemo && !emailVerified,
        refreshAuthState,
        loginAsDemo, exitDemo, refreshUser, switchCity, updateHomeCity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
