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
import { loginWithEmail, signInWithGoogleCredential } from '../../services/auth';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { AuthStackParamList } from '../../types';
import GuestInfoModal from '../../components/GuestInfoModal';

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
  const { loginAsDemo, refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestInfoVisible, setGuestInfoVisible] = useState(false);
  const { bottom } = useSafeAreaInsets();

  async function handleGooglePress() {
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        if (!response.data.idToken) throw new Error('לא התקבל אסימון זיהוי מ-Google');
        const user = await signInWithGoogleCredential(response.data.idToken);
        // AuthContext's onAuthStateChanged listener may have already tried (and
        // failed) to load the Firestore user doc for a brand-new account, racing
        // ahead of signInWithGoogleCredential's own doc creation above — nothing
        // else re-triggers a reload afterward, so force one now that the doc is
        // guaranteed to exist. Pass `user` explicitly — refreshUser()'s own
        // firebaseUser closure here would still be this screen's pre-sign-in
        // (guest) identity, since nothing has re-rendered this component yet.
        await refreshUser(user);
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
  function handleContinueAsGuest() {
    navigation.getParent()?.goBack();
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
                  textAlign="right"
                />
              </View>
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

            {__DEV__ && (
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
    </LinearGradient>
  );
}

function translateFirebaseError(code: string): string {
  const map: Record<string, string> = {
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
