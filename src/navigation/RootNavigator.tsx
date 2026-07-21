import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { useZmanimSettings } from '../context/ZmanimSettingsContext';
import { useShabbatLock } from '../hooks/useShabbatLock';
import ShabbatClosedScreen from '../screens/ShabbatClosedScreen';
import CompleteCityScreen from '../screens/auth/CompleteCityScreen';
import CityGpsPrompt from '../components/CityGpsPrompt';
import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';
import SynagogueDetailScreen  from '../screens/main/SynagogueDetailScreen';
import RestaurantDetailScreen from '../screens/main/RestaurantDetailScreen';
import MikvehDetailScreen         from '../screens/main/MikvehDetailScreen';
import AppointmentBookingScreen   from '../screens/main/AppointmentBookingScreen';
import KashrutUpdatesScreen        from '../screens/main/KashrutUpdatesScreen';
import EventDetailScreen           from '../screens/main/EventDetailScreen';
import ManageSynagogueScreen      from '../screens/admin/ManageSynagogueScreen';
import ManageAppointmentsScreen   from '../screens/admin/ManageAppointmentsScreen';
import ManageRestaurantScreen from '../screens/admin/ManageRestaurantScreen';
import ManageKosherScreen     from '../screens/admin/ManageKosherScreen';
import ManageMikvehScreen     from '../screens/admin/ManageMikvehScreen';
import ManageEventsScreen     from '../screens/admin/ManageEventsScreen';
import UserManagementScreen   from '../screens/admin/UserManagementScreen';
import ManageEruvScreen       from '../screens/admin/ManageEruvScreen';
import ManageCitiesScreen     from '../screens/admin/ManageCitiesScreen';
import ManageGemachScreen     from '../screens/admin/ManageGemachScreen';
import ZmanimSettingsScreen   from '../screens/main/ZmanimSettingsScreen';
import GemachSubmitScreen     from '../screens/main/GemachSubmitScreen';
import { Colors } from '../utils/theme';

const Root = createNativeStackNavigator();

const HEADER = {
  headerStyle: { backgroundColor: Colors.primary },
  headerTintColor: Colors.white,
  headerTitleStyle: { fontWeight: '700' as const },
  headerBackTitle: 'חזור',
};

// Login/Register presented as an on-demand modal. Auto-dismisses itself the
// moment the user becomes authenticated (or enters demo), so the caller never
// has to manage closing it.
function AuthGate({ navigation }: any) {
  const { firebaseUser, isGuest, isDemo } = useAuth();
  useEffect(() => {
    // A guest already has an (anonymous) firebaseUser, so this must also check
    // !isGuest — otherwise the modal would auto-dismiss itself the instant it
    // opens, before the guest ever gets to see the login form.
    //
    // Navigate to the Home tab explicitly rather than goBack() — the modal can
    // be opened from anywhere (e.g. Profile), and goBack() would just return
    // there instead of landing on the main screen after a successful sign-in.
    if ((firebaseUser && !isGuest) || isDemo) {
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  }, [firebaseUser, isGuest, isDemo, navigation]);
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

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // A brand-new account created without a city (currently only reachable via
  // Google sign-in, which has no city-collection step of its own) must pick
  // one before anything else — ahead of the Shabbat lock too, since that's
  // itself computed from a city and meaningless without one yet.
  if (appUser && !isGuest && !isDemo && !appUser.cityId) {
    return <CompleteCityScreen />;
  }

  // Hard lock for everyone on Shabbat / Yom Tov. The bypass is only ever wired
  // in development builds (__DEV__) — in production there is no way in.
  if (lock.locked && !devBypass) {
    return (
      <ShabbatClosedScreen
        title={lock.title ?? 'שבת שלום'}
        kind={lock.kind}
        parasha={lock.parasha}
        reopenAt={lock.reopenAt}
        onDevBypass={__DEV__ ? () => setDevBypass(true) : undefined}
      />
    );
  }

  // No login wall — the app opens in guest mode (מצב אורח). Login is reached
  // on demand via the "Auth" modal (from Profile or a contextual prompt).
  const stackContentStyle = { paddingBottom: bottom };

  return (
    <>
    <CityGpsPrompt />
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
        options={{ ...HEADER, title: 'בית הכנסת', contentStyle: stackContentStyle }}
      />

      {/* Restaurant detail — custom header baked into the screen (overlaid on gallery image) */}
      <Root.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={{ headerShown: false }}
      />

      {/* Mikveh detail — custom header, same Facebook-style card design */}
      <Root.Screen
        name="MikvehDetail"
        component={MikvehDetailScreen}
        options={{ headerShown: false }}
      />

      {/* Appointment booking — user-facing slot picker */}
      <Root.Screen
        name="AppointmentBooking"
        component={AppointmentBookingScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.mikveh }, title: 'קביעת תור', contentStyle: { paddingBottom: 0 } }}
      />

      {/* Kashrut updates feed */}
      <Root.Screen
        name="KashrutUpdates"
        component={KashrutUpdatesScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.success }, title: 'עדכוני כשרות', contentStyle: stackContentStyle }}
      />

      {/* Event detail */}
      <Root.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />

      {/* Admin screens */}
      <Root.Screen
        name="ManageSynagogue"
        component={ManageSynagogueScreen}
        options={{ ...HEADER, title: 'ניהול בית כנסת', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageRestaurant"
        component={ManageRestaurantScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.kosher }, title: 'ניהול בתי עסק', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageKosher"
        component={ManageKosherScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.success }, title: 'ניהול כשרות', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageMikveh"
        component={ManageMikvehScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.mikveh }, title: 'ניהול מקוואות', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageAppointments"
        component={ManageAppointmentsScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.mikveh }, title: 'ניהול תורים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageEvents"
        component={ManageEventsScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.events }, title: 'ניהול אירועים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="UserManagement"
        component={UserManagementScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.danger }, title: 'ניהול משתמשים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageEruv"
        component={ManageEruvScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: Colors.gold }, title: 'ניהול עירוב', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageCities"
        component={ManageCitiesScreen}
        options={{ ...HEADER, title: 'ניהול ערים', contentStyle: stackContentStyle }}
      />
      <Root.Screen
        name="ManageGemach"
        component={ManageGemachScreen}
        options={{ ...HEADER, headerStyle: { backgroundColor: '#B06B3A' }, title: 'ניהול גמ"חים', contentStyle: stackContentStyle }}
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
});
