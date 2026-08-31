import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { useZmanimSettings } from '../context/ZmanimSettingsContext';
import AppLoadingScreen, { useSplashHold } from '../components/AppLoadingScreen';
import { useShabbatLock } from '../hooks/useShabbatLock';
import ShabbatClosedScreen from '../screens/ShabbatClosedScreen';
import CompleteCityScreen from '../screens/auth/CompleteCityScreen';
import CityGpsPrompt from '../components/CityGpsPrompt';
import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';
import SynagogueDetailScreen  from '../screens/main/SynagogueDetailScreen';
import BusinessDetailScreen from '../screens/main/BusinessDetailScreen';
import MikvehDetailScreen         from '../screens/main/MikvehDetailScreen';
import AppointmentBookingScreen   from '../screens/main/AppointmentBookingScreen';
import KashrutUpdatesScreen        from '../screens/main/KashrutUpdatesScreen';
import EventDetailScreen           from '../screens/main/EventDetailScreen';
import MyEventsScreen              from '../screens/main/MyEventsScreen';
import ManageSynagogueScreen      from '../screens/admin/ManageSynagogueScreen';
import ManageAppointmentsScreen   from '../screens/admin/ManageAppointmentsScreen';
import ManageBusinessScreen from '../screens/admin/ManageBusinessScreen';
import ManageKosherScreen     from '../screens/admin/ManageKosherScreen';
import ManageMikvehScreen     from '../screens/admin/ManageMikvehScreen';
import ManageEventsScreen     from '../screens/admin/ManageEventsScreen';
import UserManagementScreen   from '../screens/admin/UserManagementScreen';
import ManageEruvScreen       from '../screens/admin/ManageEruvScreen';
import ManageReportsScreen     from '../screens/admin/ManageReportsScreen';
import ManageCitiesScreen     from '../screens/admin/ManageCitiesScreen';
import ManageGemachScreen     from '../screens/admin/ManageGemachScreen';
import ZmanimSettingsScreen   from '../screens/main/ZmanimSettingsScreen';
import GemachSubmitScreen     from '../screens/main/GemachSubmitScreen';
import { Colors } from '../utils/theme';
import { SHOW_DEV_TOOLS } from '../utils/devTools';

const Root = createNativeStackNavigator();

/**
 * A screen's header wears its section's colour.
 *
 * Every section already has one — the management rows in ProfileScreen and the
 * cards in each list have used them all along — so a blue bar over a green
 * kashrut screen was the odd part, not the coloured ones. The header is the
 * largest block of colour on the screen, which makes it the cheapest way to say
 * where you are before a word is read.
 *
 * Not every accent survives being a background. White on the ceremonial gold
 * measures 2.92:1, under even the 3:1 allowed for large text, so the eruv and
 * gemach headers use the deepened pair added alongside them in theme.ts rather
 * than the accent itself.
 */
const HEADER = {
  headerTintColor: Colors.white,
  headerTitleStyle: { fontWeight: '700' as const },
  headerBackTitle: 'חזור',
  headerStyle: { backgroundColor: Colors.primary },
};
const header = (backgroundColor: string) => ({ ...HEADER, headerStyle: { backgroundColor } });

// Login/Register presented as an on-demand modal. Auto-dismisses itself the
// moment the user becomes authenticated (or enters demo), so the caller never
// has to manage closing it.
function AuthGate({ navigation, route }: any) {
  const { firebaseUser, isGuest, isDemo } = useAuth();
  useEffect(() => {
    // A guest already has an (anonymous) firebaseUser, so this must also check
    // !isGuest — otherwise the modal would auto-dismiss itself the instant it
    // opens, before the guest ever gets to see the login form.
    if ((firebaseUser && !isGuest) || isDemo) {
      // A guest who was blocked mid-flow (e.g. booking a mikveh appointment,
      // adding a gemach) expects to land back where they were, not on Home —
      // the caller passes returnTo/returnParams for that. Falling back to the
      // Home tab explicitly (rather than goBack()) only when there's nothing
      // to return to, since the modal can also be opened from plain entry
      // points (e.g. Profile's "התחבר/הרשמה"), where goBack() would just
      // return there instead of landing on the main screen.
      const { returnTo, returnParams } = route.params ?? {};
      if (returnTo) {
        navigation.navigate(returnTo, returnParams);
      } else {
        navigation.navigate('MainTabs', { screen: 'Home' });
      }
    }
  }, [firebaseUser, isGuest, isDemo, navigation, route.params]);
  return <AuthNavigator />;
}

export default function RootNavigator() {
  const { loading, appUser, isGuest, isDemo } = useAuth();
  const { bottom } = useSafeAreaInsets();

  // Shabbat / Yom Tov lock — closes the whole app from candle-lighting until tzeit.
  const cityId       = useCityId();
  const { city }     = useCity(cityId);
  const { settings } = useZmanimSettings();
  const lock         = useShabbatLock(city, settings);
  const [devBypass, setDevBypass] = useState(false);
  // There was previously no way to test "does the lock screen engage/look
  // right" without waiting for an actual real candle-lighting moment (or
  // fiddling with the device's system clock) — this forces it on for
  // preview, same dev-only gating as the bypass button below.
  const [devForceLock, setDevForceLock] = useState(false);
  const isLocked = (lock.locked || devForceLock) && !devBypass;

  // Must be called before the early returns below — a hook skipped on one
  // render and reached on the next is exactly the "rendered more hooks"
  // crash SynagogueDetailScreen hit.
  const showSplash = useSplashHold(loading);

  if (showSplash) return <AppLoadingScreen />;

  // A brand-new account created without a city (currently only reachable via
  // Google sign-in, which has no city-collection step of its own) must pick
  // one before anything else — ahead of the Shabbat lock too, since that's
  // itself computed from a city and meaningless without one yet.
  if (appUser && !isGuest && !isDemo && !appUser.cityId) {
    return <CompleteCityScreen />;
  }

  // Hard lock for everyone on Shabbat / Yom Tov. The bypass is only ever wired
  // in development builds — in production there is no way in. See devTools.ts.
  if (isLocked) {
    return (
      <ShabbatClosedScreen
        title={lock.locked ? (lock.title ?? 'שבת שלום') : 'שבת שלום (בדיקה)'}
        kind={lock.kind}
        parasha={lock.parasha}
        reopenAt={lock.reopenAt}
        onDevBypass={SHOW_DEV_TOOLS ? () => setDevBypass(true) : undefined}
      />
    );
  }

  // No login wall — the app opens in guest mode (מצב אורח). Login is reached
  // on demand via the "Auth" modal (from Profile or a contextual prompt).
  const stackContentStyle = { paddingBottom: bottom };

  return (
    <>
    <CityGpsPrompt />
    {SHOW_DEV_TOOLS && (
      <TouchableOpacity
        style={styles.devLockBtn}
        onPress={() => setDevForceLock(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.devLockBtnTxt}>🕯️</Text>
      </TouchableOpacity>
    )}
    <Root.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      {/* Main tabs — tab bar handles its own safe area */}
      <Root.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />

      {/* Auth (login / register) — on-demand modal for guests */}
      <Root.Screen
        name="Auth"
        component={AuthGate}
        options={{ headerShown: false, presentation: 'modal' }}
      />

      {/* Synagogue detail */}
      <Root.Screen
        name="SynagogueDetail"
        component={SynagogueDetailScreen}
        options={{ ...header(Colors.primary), title: 'בית הכנסת', contentStyle: stackContentStyle }}
      />

      {/* These two ran without the stack header, floating their own report and
          edit controls over the cover instead. That left them with no way back:
          nothing in either screen called goBack, so leaving depended entirely
          on the Android system button — and on iOS, on knowing the edge swipe.
          They now carry the same header as SynagogueDetail, which is also where
          the app puts a listing's actions everywhere else. */}
      <Root.Screen
        name="BusinessDetail"
        component={BusinessDetailScreen}
        options={{ ...header(Colors.kosher), title: 'בית עסק', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="MikvehDetail"
        component={MikvehDetailScreen}
        options={{ ...header(Colors.mikveh), title: 'מקווה', contentStyle: stackContentStyle }}
      />

      {/* Appointment booking — user-facing slot picker */}
      <Root.Screen
        name="AppointmentBooking"
        component={AppointmentBookingScreen}
        options={{ ...header(Colors.mikveh), title: 'קביעת תור', contentStyle: { paddingBottom: 0 } }}
      />

      {/* Kashrut updates feed */}
      <Root.Screen
        name="KashrutUpdates"
        component={KashrutUpdatesScreen}
        options={{ ...header(Colors.kosher), title: 'עדכוני כשרות', contentStyle: stackContentStyle }}
      />

      {/* Event detail */}
      <Root.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />

      {/* Starred events + synagogue-announcement reminders, merged */}
      <Root.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={{ ...header(Colors.events), title: 'האירועים שלי', contentStyle: stackContentStyle }}
      />

      {/* Selichot lives in the tab navigator, not here: as a root-stack screen
          it covered the bottom bar, so there was no way back to the rest of the
          app except the header arrow. It is season-gated inside MainTabNavigator
          rather than registered conditionally, so navigate('Selichot') always
          resolves. */}

      {/* Admin screens */}
      <Root.Screen
        name="ManageSynagogue"
        component={ManageSynagogueScreen}
        options={{ ...header(Colors.primary), title: 'ניהול בית כנסת', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageBusiness"
        component={ManageBusinessScreen}
        options={{ ...header(Colors.kosher), title: 'ניהול בתי עסק', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageKosher"
        component={ManageKosherScreen}
        options={{ ...header(Colors.kosher), title: 'ניהול כשרות', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageMikveh"
        component={ManageMikvehScreen}
        options={{ ...header(Colors.mikveh), title: 'ניהול מקוואות', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageAppointments"
        component={ManageAppointmentsScreen}
        options={{ ...header(Colors.mikveh), title: 'ניהול תורים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageEvents"
        component={ManageEventsScreen}
        options={{ ...header(Colors.events), title: 'ניהול אירועים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="UserManagement"
        component={UserManagementScreen}
        options={{ ...header(Colors.danger), title: 'ניהול משתמשים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageEruv"
        component={ManageEruvScreen}
        options={{ ...header(Colors.goldDeep), title: 'ניהול עירוב', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageCities"
        component={ManageCitiesScreen}
        options={{ ...header(Colors.primary), title: 'ניהול ערים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageReports"
        component={ManageReportsScreen}
        options={{ ...header(Colors.danger), title: 'דיווחים על מידע שגוי', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageGemach"
        component={ManageGemachScreen}
        options={{ ...header(Colors.gemachDeep), title: 'ניהול גמ"חים', contentStyle: stackContentStyle }}
      />

      {/* Zmanim settings — city + method selection */}
      <Root.Screen
        name="ZmanimSettings"
        component={ZmanimSettingsScreen}
        options={{ headerShown: false }}
      />

      {/* Gemach submission form */}
      <Root.Screen
        name="GemachSubmit"
        component={GemachSubmitScreen}
        options={{ headerShown: false }}
      />
    </Root.Navigator>
    </>
  );
}

const styles = StyleSheet.create({
  // __DEV__-only — lets a developer preview the Shabbat lock screen without
  // waiting for a real candle-lighting moment. Never renders in a real build.
  devLockBtn: {
    position: 'absolute', top: 50, left: 8, zIndex: 999,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  devLockBtnTxt: { fontSize: 16 },
});
