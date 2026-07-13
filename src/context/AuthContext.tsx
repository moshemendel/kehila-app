import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserDoc } from '../services/auth';
import { updateUserCity, updateUserHomeCity } from '../services/users';
import { getGuestCityId, setGuestCityId } from '../services/guestCity';
import { initAnalytics, clearAnalytics } from '../services/analytics';
import { AppUser } from '../types';

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
  const [guestCityId, setGuestCityIdState] = useState<string | null>(null);

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
      if (doc) initAnalytics(user.uid, doc.cityId);
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
        if (!user) {
          if (!isDemo) { setAppUser(null); setIsGuest(false); }
          // Sign in anonymously so guests can receive eruv push notifications
          signInAnonymously(auth).catch(() => {});
          setLoading(false);
        } else if (user.isAnonymous) {
          // Guest: Firebase user exists but no Firestore account
          if (!isDemo) { setAppUser(null); setIsGuest(true); }
          setLoading(false);
        } else {
          setIsGuest(false);
          await loadAppUser(user);
          setLoading(false);
        }
      });
    } catch {
      setLoading(false);
    }
    return () => unsub?.();
  }, []);

  return (
    <AuthContext.Provider
      value={{ firebaseUser, appUser, loading, isDemo, isGuest, guestCityId, loginAsDemo, exitDemo, refreshUser, switchCity, updateHomeCity }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
