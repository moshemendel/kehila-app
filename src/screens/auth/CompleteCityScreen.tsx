import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing } from '../../utils/theme';
import CityPicker from '../../components/CityPicker';
import { City, Gender } from '../../types';
import GenderPicker from '../../components/GenderPicker';

// Shown once, immediately after a brand-new account is created without a
// city — currently only reachable via Google sign-in, which (unlike email
// registration's own city step) has nowhere to collect one during sign-in
// itself. The user doc is created with cityId '' as a "needs onboarding"
// sentinel; RootNavigator renders this screen instead of the app until it's
// resolved, since almost everything (zmanim, synagogues, kosher, events...)
// is scoped by city.
export default function CompleteCityScreen() {
  const { updateHomeCity, updateGender, appUser } = useAuth();
  // Google sign-in has no form, so this is where the question is asked. An
  // account that already answered (it can't have, today, but a retry after a
  // failed city write lands here again) skips straight to the city.
  const [gender, setGender] = useState<Gender | null>(appUser?.gender ?? null);
  const [genderDone, setGenderDone] = useState(!!appUser?.gender);

  function continueFromGender() {
    if (!gender) return;
    // Fire and forget: a failed write must not strand someone on this screen;
    // they can set it again from the profile.
    updateGender(gender).catch(() => {});
    setGenderDone(true);
  }

  function handleSelect(city: City) {
    updateHomeCity(city.id);
  }

  if (!genderDone) {
    return (
      <LinearGradient colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]} style={styles.gradient}>
        <View style={styles.header}>
          <Text style={styles.icon}>✡</Text>
          <Text style={styles.title}>ברוכים הבאים לקהילה!</Text>
          <Text style={styles.subtitle}>כדי להתאים לך שיעורים, התראות ופרסומים</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>אני</Text>
          <GenderPicker value={gender} onChange={setGender} />
          <TouchableOpacity
            style={[styles.btn, !gender && styles.btnOff]}
            onPress={continueFromGender}
            disabled={!gender}
            activeOpacity={0.85}
          >
            <Text style={styles.btnTxt}>המשך</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]} style={styles.gradient}>
      <View style={styles.header}>
        <Text style={styles.icon}>✡</Text>
        <Text style={styles.title}>ברוכים הבאים לקהילה!</Text>
        <Text style={styles.subtitle}>נשאר רק לבחור את העיר שלך כדי להתחיל</Text>
      </View>
      <CityPicker
        visible
        selectedCityId=""
        onSelect={handleSelect}
        onClose={() => {}}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', paddingHorizontal: Spacing.xl, marginBottom: Spacing.xl },
  icon: { fontSize: 48, color: Colors.accentLight, marginBottom: Spacing.sm },
  title: { fontSize: 22, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: 16, marginHorizontal: Spacing.lg, padding: Spacing.lg, gap: Spacing.md },
  cardLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  btn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnOff: { opacity: 0.4 },
  btnTxt: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 6 },
});
