import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { registerWithEmail } from '../../services/auth';
import { getAllCities } from '../../services/cities';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { AuthStackParamList, City } from '../../types';
import CityPicker from '../../components/CityPicker';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'> };

export default function RegisterScreen({ navigation }: Props) {
  const { refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCity,   setSelectedCity]   = useState<City | null>(null);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [detectingCity,  setDetectingCity]  = useState(false);

  async function detectCity() {
    setDetectingCity(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('הרשאה נדחתה', 'יש לאפשר גישה למיקום'); return; }
      const pos    = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(pos.coords);
      const p      = places[0];
      if (!p) { Alert.alert('שגיאה', 'לא ניתן לזהות עיר'); return; }
      const detectedName = (p.city ?? p.subregion ?? p.district ?? '').toLowerCase();
      const allCities    = await getAllCities();
      const match = allCities.find((c) =>
        c.name.toLowerCase().includes(detectedName) || detectedName.includes(c.name.toLowerCase())
      );
      if (match) {
        setSelectedCity(match);
      } else {
        Alert.alert('עיר לא נמצאה', `זוהה: ${p.city ?? detectedName}\n\nהעיר אינה ברשימה. בחר מהרשימה או פנה למנהל המערכת.`);
        setCityPickerOpen(true);
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setDetectingCity(false);
    }
  }

  async function handleRegister() {
    if (!name || !email || !password) {
      Alert.alert('שגיאה', 'יש למלא את כל השדות');
      return;
    }
    if (!selectedCity) {
      Alert.alert('שגיאה', 'יש לבחור עיר');
      return;
    }
    if (password !== confirmPass) {
      Alert.alert('שגיאה', 'הסיסמאות אינן תואמות');
      return;
    }
    if (password.length < 6) {
      Alert.alert('שגיאה', 'הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    setLoading(true);
    try {
      const user = await registerWithEmail(email.trim(), password, name.trim(), selectedCity.id);
      // AuthGate closes this modal as soon as firebaseUser becomes non-anonymous,
      // which can race ahead of the user doc actually finishing its Firestore
      // write above — force a reload now that it's guaranteed to exist, so the
      // app doesn't land on Home still showing the "אורח" fallback. Pass `user`
      // explicitly — refreshUser()'s own firebaseUser closure here would still
      // be this screen's pre-registration (guest) identity.
      await refreshUser(user);
    } catch (e: any) {
      const msg: Record<string, string> = {
        'auth/email-already-in-use': 'כתובת האימייל כבר רשומה במערכת',
        'auth/invalid-email': 'כתובת אימייל לא תקינה',
        'auth/weak-password': 'הסיסמה חלשה מדי',
      };
      Alert.alert('שגיאה בהרשמה', msg[e.code] ?? 'אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.logoArea}>
            <Text style={styles.logoIcon}>✡</Text>
            <Text style={styles.appName}>קהילה</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>הרשמה</Text>

            {[
              { label: 'שם מלא', value: name, setter: setName, icon: 'person-outline', placeholder: 'ישראל ישראלי', type: 'default' },
              { label: 'אימייל', value: email, setter: setEmail, icon: 'mail-outline', placeholder: 'your@email.com', type: 'email-address' },
            ].map(({ label, value, setter, icon, placeholder, type }) => (
              <View style={styles.inputGroup} key={label}>
                <Text style={styles.label}>{label}</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name={icon as any} size={18} color={Colors.textSecondary} />
                  <TextInput scrollEnabled={false}
                    style={styles.input}
                    placeholder={placeholder}
                    value={value}
                    onChangeText={setter}
                    autoCapitalize="none"
                    keyboardType={type as any}
                    textAlign="right"
                  />
                </View>
              </View>
            ))}

            {/* City picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>עיר</Text>

              {selectedCity ? (
                /* Selected — show chip + change button */
                <View style={styles.citySelected}>
                  <View style={styles.citySelectedLeft}>
                    <Ionicons name="location" size={16} color={Colors.primary} />
                    <Text style={styles.citySelectedName}>{selectedCity.name}</Text>
                    {selectedCity.country ? <Text style={styles.citySelectedCountry}>{selectedCity.country}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => setCityPickerOpen(true)}>
                    <Text style={styles.cityChangeLink}>שנה</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Not selected — two options */
                <View style={styles.cityBtnRow}>
                  <TouchableOpacity
                    style={[styles.cityBtn, styles.cityBtnDetect]}
                    onPress={detectCity}
                    disabled={detectingCity}
                    activeOpacity={0.8}
                  >
                    {detectingCity
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Ionicons name="navigate-outline" size={16} color={Colors.primary} />}
                    <Text style={styles.cityBtnDetectText}>זהה מיקום</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cityBtn, styles.cityBtnPick]}
                    onPress={() => setCityPickerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="list-outline" size={16} color={Colors.white} />
                    <Text style={styles.cityBtnPickText}>בחר מרשימה</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <CityPicker
              visible={cityPickerOpen}
              selectedCityId={selectedCity?.id ?? ''}
              onSelect={(c) => setSelectedCity(c)}
              onClose={() => setCityPickerOpen(false)}
            />

            <View style={styles.inputGroup}>
              <Text style={styles.label}>סיסמה</Text>
              <View style={styles.inputWrapper}>
                <TouchableOpacity onPress={() => setShowPass((p) => !p)}>
                  <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TextInput scrollEnabled={false}
                  style={styles.input}
                  placeholder="לפחות 6 תווים"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>אימות סיסמה</Text>
              <View style={[styles.inputWrapper, confirmPass && confirmPass !== password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} />
                <TextInput scrollEnabled={false}
                  style={styles.input}
                  placeholder="חזור על הסיסמה"
                  value={confirmPass}
                  onChangeText={setConfirmPass}
                  secureTextEntry={!showPass}
                  textAlign="right"
                />
              </View>
            </View>

            <TouchableOpacity style={styles.registerBtn} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.registerBtnText}>צור חשבון</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
              <Text style={styles.backText}>
                יש לך חשבון? <Text style={styles.backLinkText}>התחבר</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  logoArea: { alignItems: 'center', marginBottom: Spacing.lg },
  logoIcon: { fontSize: 40, color: Colors.accentLight },
  appName: { fontSize: 30, fontWeight: '800', color: Colors.white, letterSpacing: 2 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
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
  inputError: { borderColor: Colors.danger },
  input: { flex: 1, fontSize: 15, color: Colors.text },
  registerBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  registerBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  backLink: { marginTop: Spacing.md, alignItems: 'center' },
  backText: { fontSize: 14, color: Colors.textSecondary },
  backLinkText: { color: Colors.primaryLight, fontWeight: '700' },
  citySelected: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 10,
    backgroundColor: Colors.primary + '08',
  },
  citySelectedLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  citySelectedName:    { fontSize: 15, fontWeight: '600', color: Colors.text },
  citySelectedCountry: { fontSize: 12, color: Colors.textMuted },
  cityChangeLink:      { fontSize: 13, fontWeight: '700', color: Colors.primaryLight },
  cityBtnRow: { flexDirection: 'row', gap: 10 },
  cityBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: Radius.sm,
  },
  cityBtnDetect:     { borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.background },
  cityBtnPick:       { backgroundColor: Colors.primary },
  cityBtnDetectText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  cityBtnPickText:   { fontSize: 13, fontWeight: '600', color: Colors.white },
});
