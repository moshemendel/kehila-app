import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing } from '../../utils/theme';
import CityPicker from '../../components/CityPicker';
import { City } from '../../types';

// Shown once, immediately after a brand-new account is created without a
// city — currently only reachable via Google sign-in, which (unlike email
// registration's own city step) has nowhere to collect one during sign-in
// itself. The user doc is created with cityId '' as a "needs onboarding"
// sentinel; RootNavigator renders this screen instead of the app until it's
// resolved, since almost everything (zmanim, synagogues, kosher, events...)
// is scoped by city.
export default function CompleteCityScreen() {
  const { updateHomeCity } = useAuth();

  function handleSelect(city: City) {
    updateHomeCity(city.id);
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
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 6 },
});
