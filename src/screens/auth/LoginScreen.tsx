import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { loginWithEmail, signInWithGoogleCredential, resetPassword } from '../../services/auth';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { SHOW_DEV_TOOLS } from '../../utils/devTools';
import { AuthStackParamList } from '../../types';
import GuestInfoModal from '../../components/GuestInfoModal';
import CityPicker from '../../components/CityPicker';
import { useCities } from '../../hooks/useCities';

const googleAuthConfig = (Constants.expoConfig?.extra as any)?.googleAuth ?? {};

// Native Google Sign-In (Play Services on Android / native SDK on iOS) — not
// a browser redirect, so it needs the actual Android/iOS OAuth client
// (matched to this app's package/bundle id + signing cert), not just the web
// one. webClientId is still required: it's the audience Firebase expects the
// ID token to be issued for, regardless of platform.
GoogleSignin.configure({
  webClientId: googleAuthConfig.webClientId || undefined,
  iosClientId: googleAuthConfig.iosClientId || undefined,
});

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const { loginAsDemo, refreshUser, guestCityId, switchCity } = useAuth();
  const { cities } = useCities();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestInfoVisible, setGuestInfoVisible] = useState(false);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { bottom } = useSafeAreaInsets();

  async function handleForgotPassword() {
    const target = email.trim();
    if (!target) {
      Alert.alert('שכחתי סיסמה', 'יש להזין את כתובת האימייל בשדה למעלה, ואז ללחוץ שוב.');
      return;
    }
    setResetting(true);
    try {
      await resetPassword(target);
    } catch (e: any) {
      // Anything other than a malformed address is reported as success on
      // purpose — "no such user" would let anyone test which addresses are
      // registered in the community.
      if (e?.code === 'auth/invalid-email') {
        Alert.alert('שגיאה', 'כתובת אימייל לא תקינה');
        setResetting(false);
        return;
      }
    } finally {
      setResetting(false);
    }
    Alert.alert(
      'נשלח מייל לאיפוס',
      `אם קיים חשבון עבור ${target}, נשלח אליו קישור לבחירת סיסמה חדשה.

הקישור תקף לשעה. בדוק/י גם בתיקיית הספאם.`,
    );
  }

  /**
   * Timed out loud, in release builds, because "it feels slow" is how this was
   * reported and "it feels faster" is not good enough to answer it with. The
   * phases are separated because they fail differently: the picker is Google's
   * and we cannot make it quicker, the credential exchange is one network round
   * trip, and everything after it is ours.
   *
   *   adb logcat -d | grep signin
   */
  async function handleGooglePress() {
    const t0 = Date.now();
    const since = () => Date.now() - t0;
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      console.log(`[signin] +${since()}ms google picker done`);
      if (isSuccessResponse(response)) {
        if (!response.data.idToken) throw new Error('לא התקבל אסימון זיהוי מ-Google');
        const { user, created } = await signInWithGoogleCredential(response.data.idToken);
        console.log(`[signin] +${since()}ms firebase credential exchanged (new account: ${created})`);
        // ONLY for an account created just now. AuthContext's onAuthStateChanged
        // listener may have raced ahead and tried to load a profile document
        // that did not exist yet, and nothing else re-triggers a reload — so a
        // new account still needs this. An existing one does not: the listener
        // loaded the document perfectly well, and reloading it was a second
        // Firestore round trip on top of a redundant existence check, together
        // most of why Google sign-in took 7-8 seconds against 2-3 for a
        // password. Pass `user` explicitly — refreshUser()'s own firebaseUser
        // closure here would still be this screen's pre-sign-in (guest)
        // identity, since nothing has re-rendered this component yet.
        if (created) await refreshUser(user);
        console.log(`[signin] +${since()}ms handler done — AuthGate now closes the screen`);
      }
      // type === 'cancelled' — user backed out of the account picker, no-op.
    } catch (e: any) {
      if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) {
        // A sign-in is already underway (e.g. double-tap) — ignore.
      } else {
        Alert.alert('שגיאה בהתחברות', e?.message ?? 'ההתחברות עם Google נכשלה');
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  // Anonymous guest auth is already established app-wide (RootNavigator signs
  // guests in automatically) — "continue as guest" just needs to dismiss this
  // modal back to the app. AuthGate's own auto-dismiss effect only fires once
  // actually authenticated (or in demo mode), so a guest choosing to stay a
  // guest must close the modal itself via the parent (Root) navigator.
  //
  // ONE THING HAS TO HAPPEN FIRST, and only when there is more than one city:
  // ask which. Registering carries the answer (CompleteCityScreen), so declining
  // an account was the one path into the app that left the city unanswered — and
  // it was answered by a hardcoded default, which quietly hands a resident of one
  // town another town's prayer times. This is the right moment to ask because it
  // is the last one before any content is shown: nothing has been rendered yet,
  // so there is nothing to correct and nothing flashes. A single-city install
  // never sees this — GuestCityBootstrap has already stored the only city there
  // is, without asking.
  //
  // goBack() is not enough on its own: on the first launch after install this
  // screen IS the navigator's first screen, so there is nothing behind it and
  // goBack() silently does nothing — leaving the guest stuck on the login form
  // they just declined. Opened later as a modal there is, and going back is
  // what returns them to where they were.
  function leaveAuth() {
    const parent = navigation.getParent<any>();
    if (parent?.canGoBack()) { parent.goBack(); return; }
    // Reset rather than navigate. As the first screen there is nothing behind
    // this one, so navigate() would push the tabs ON TOP of the login screen
    // and leave it sitting in the stack — the Android back button from Home
    // would then return a guest to the form they had just declined. Resetting
    // makes the tabs the only route, which is what "continue" means.
    parent?.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }

  function handleContinueAsGuest() {
    if (!guestCityId && cities.length > 1) {
      setCityPickerVisible(true);
      return;
    }
    leaveAuth();
  }

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('שגיאה', 'יש למלא אימייל וסיסמה');
      return;
    }
    setLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
    } catch (e: any) {
      Alert.alert('שגיאה בהתחברות', translateFirebaseError(e.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: Spacing.lg + bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoArea}>
            <Text style={styles.logoIcon}>✡</Text>
            <Text style={styles.appName}>קהילה</Text>
            <Text style={styles.tagline}>כל שירותי הדת במקום אחד</Text>
          </View>

          <View style={styles.card}>
            {/* <Text style={styles.title}>התחברות</Text> */}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>אימייל</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} />
                <TextInput scrollEnabled={false}
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>סיסמה</Text>
              <View style={styles.inputWrapper}>
                <TouchableOpacity onPress={() => setShowPass((p) => !p)}>
                  <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TextInput scrollEnabled={false}
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  keyboardType="ascii-capable"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textAlign="right"
                />
              </View>
              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={resetting}
                style={styles.forgotLink}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotTxt}>
                  {resetting ? 'שולח…' : 'שכחתי סיסמה'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.loginBtnText}>התחבר</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.guestBtn} onPress={handleContinueAsGuest}>
              <Text style={styles.guestBtnText}>המשך כאורח</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setGuestInfoVisible(true)} style={styles.guestInfoLink}>
              <Text style={styles.guestInfoLinkText}>משמעות התחברות כאורח</Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>או</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.googleBtn} onPress={handleGooglePress} disabled={googleLoading}>
              {googleLoading ? (
                <ActivityIndicator color={Colors.textSecondary} />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleBtnText}>המשך עם Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.registerLink}>
              <Text style={styles.registerText}>
                אין לך חשבון? <Text style={styles.registerLinkText}>הרשם כאן</Text>
              </Text>
            </TouchableOpacity>

            {SHOW_DEV_TOOLS && (
              <>
                <View style={styles.demoDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>הדגמה</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity style={styles.demoBtn} onPress={loginAsDemo}>
                  <Text style={styles.demoIcon}>✡</Text>
                  <View>
                    <Text style={styles.demoBtnText}>כניסת הדגמה</Text>
                    <Text style={styles.demoBtnSub}>כל הפיצ׳רים פתוחים · ללא Firebase</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <GuestInfoModal visible={guestInfoVisible} onClose={() => setGuestInfoVisible(false)} />
      <CityPicker
        visible={cityPickerVisible}
        selectedCityId={guestCityId ?? ''}
        onSelect={async (city) => {
          setCityPickerVisible(false);
          await switchCity(city.id);
          leaveAuth();
        }}
        // Dismissing without choosing still lets them in — this is an offer,
        // not a wall, and CityGpsPrompt will ask again from GPS. It just means
        // the fallback applies until then.
        onClose={() => {
          setCityPickerVisible(false);
          leaveAuth();
        }}
      />
    </LinearGradient>
  );
}

function translateFirebaseError(code: string): string {
  const map: Record<string, string> = {
    // Modern Firebase Auth (v9.6+) no longer distinguishes "no such user" from
    // "wrong password" — both now come back as auth/invalid-credential, as a
    // deliberate privacy measure against account enumeration. The old specific
    // codes below are kept in case an older SDK path ever produces them, but
    // invalid-credential is the one real logins will actually hit.
    'auth/invalid-credential': 'אימייל או סיסמה שגויים',
    'auth/user-not-found': 'משתמש לא נמצא',
    'auth/wrong-password': 'סיסמה שגויה',
    'auth/invalid-email': 'כתובת אימייל לא תקינה',
    'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
    'auth/network-request-failed': 'בעיית רשת. בדוק את החיבור.',
  };
  return map[code] ?? 'אירעה שגיאה. נסה שוב.';
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  logoArea: { alignItems: 'center', marginBottom: Spacing.xl },
  logoIcon: { fontSize: 56, color: Colors.accentLight },
  appName: { fontSize: 36, fontWeight: '800', color: Colors.white, letterSpacing: 2 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    backgroundColor: Colors.background,
  },
  input: { flex: 1, fontSize: 15, color: Colors.text },
  forgotLink: { alignSelf: 'flex-start', marginTop: 6 },
  forgotTxt:  { fontSize: 12.5, fontWeight: '600', color: Colors.primaryLight },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  loginBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 13, color: Colors.textMuted },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: 13,
  },
  googleIcon: { fontSize: 16, fontWeight: '800', color: '#4285F4' },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  registerLink: { marginTop: Spacing.md, alignItems: 'center' },
  registerText: { fontSize: 14, color: Colors.textSecondary },
  registerLinkText: { color: Colors.primaryLight, fontWeight: '700' },
  demoDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: Spacing.md },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  demoIcon: { fontSize: 22 },
  demoBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primaryDark },
  demoBtnSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  guestBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  guestBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  guestInfoLink: { alignItems: 'center', marginTop: 8 },
  guestInfoLinkText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});
