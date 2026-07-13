import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { useZmanimSettings } from '../../context/ZmanimSettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useCities } from '../../hooks/useCities';
import { useCityId } from '../../hooks/useCityId';
import { ZMANIM_PRESETS } from '../../utils/zmanim';

export default function ZmanimSettingsScreen() {
  const navigation = useNavigation();
  const { top, bottom } = useSafeAreaInsets();
  const { settings, setSettings, gpsLocation, setGpsLocation } = useZmanimSettings();
  const { switchCity } = useAuth();
  const cityId = useCityId();
  const { cities, loading: citiesLoading } = useCities();
  const [gpsLoading, setGpsLoading] = useState(false);

  const activePreset = ZMANIM_PRESETS.find(p =>
    settings.presetKey ? settings.presetKey === p.key
                       : JSON.stringify(settings) === JSON.stringify(p.settings)
  );

  async function handleGps() {
    setGpsLoading(true);
    try {
      // Check if location services are on at the OS level (separate from app permission)
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert('שירות מיקום כבוי', 'יש להפעיל את שירות המיקום בהגדרות המכשיר.');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('הרשאת מיקום', 'יש לאפשר גישה למיקום בהגדרות האפליקציה.');
        return;
      }

      // Last-known is instant (no GPS fix needed). Fall back to a fresh fix only if unavailable.
      let coords: { latitude: number; longitude: number } | null = null;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
      if (last) {
        coords = last.coords;
      } else {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = pos.coords;
      }

      if (!coords) {
        Alert.alert('מיקום לא זמין', 'לא ניתן לקבל מיקום. נסה שנית בחוץ.');
        return;
      }

      const { latitude, longitude } = coords;

      // Reverse geocoding is best-effort — coordinates are saved regardless
      let name = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) name = geo.city ?? geo.subregion ?? geo.region ?? name;
      } catch {}

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await setGpsLocation({ lat: latitude, lon: longitude, name, timezone });
    } catch (err) {
      Alert.alert('שגיאה', 'לא ניתן לקבל מיקום. ודא שה-GPS פעיל ונסה שנית.');
    } finally {
      setGpsLoading(false);
    }
  }

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[Colors.primaryDark, Colors.primary]}
        style={[s.header, { paddingTop: top + 10 }]}
      >
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-forward" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>הגדרות זמנים</Text>
          {activePreset && (
            <Text style={s.headerSub}>{activePreset.label} · {activePreset.posek}</Text>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[s.list, { paddingBottom: bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Location ── */}
        <Text style={s.sectionTitle}>מיקום</Text>
        <View style={s.card}>
          {/* GPS row */}
          <TouchableOpacity
            style={[s.row, s.rowDivider]}
            onPress={handleGps}
            disabled={gpsLoading}
            activeOpacity={0.7}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ width: 20 }} />
            ) : (
              <View style={[s.radioOuter, !!gpsLocation && s.radioOuterActive]}>
                {!!gpsLocation && <View style={s.radioInner} />}
              </View>
            )}
            <Ionicons
              name="locate-outline"
              size={20}
              color={gpsLocation ? Colors.primary : Colors.textMuted}
            />
            <View style={s.rowContent}>
              <Text style={[s.rowTitle, !!gpsLocation && s.rowTitleActive]}>
                {gpsLocation ? gpsLocation.name : 'מיקום נוכחי (GPS)'}
              </Text>
              <Text style={s.rowSub}>
                {gpsLocation ? 'מיקום נקבע לפי GPS המכשיר' : 'לחץ לזיהוי מיקום אוטומטי'}
              </Text>
            </View>
            {gpsLocation && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
          </TouchableOpacity>

          {/* City list */}
          {citiesLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} />
          ) : (
            cities.map((city, idx) => {
              const active = !gpsLocation && city.id === cityId;
              return (
                <TouchableOpacity
                  key={city.id}
                  style={[s.row, idx < cities.length - 1 && s.rowDivider]}
                  onPress={() => { setGpsLocation(null); switchCity(city.id); }}
                  activeOpacity={0.7}
                >
                  <View style={[s.radioOuter, active && s.radioOuterActive]}>
                    {active && <View style={s.radioInner} />}
                  </View>
                  <View style={s.rowContent}>
                    <Text style={[s.rowTitle, active && s.rowTitleActive]}>{city.name}</Text>
                    <Text style={s.rowSub}>{city.country}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── Method ── */}
        <Text style={[s.sectionTitle, { marginTop: 28 }]}>שיטת חישוב</Text>
        <View style={s.card}>
          {ZMANIM_PRESETS.map((preset, idx) => {
            const active = settings.presetKey
              ? settings.presetKey === preset.key
              : JSON.stringify(settings) === JSON.stringify(preset.settings);
            return (
              <TouchableOpacity
                key={preset.key}
                style={[s.row, idx < ZMANIM_PRESETS.length - 1 && s.rowDivider]}
                onPress={() => setSettings(preset.settings)}
                activeOpacity={0.7}
              >
                <View style={[s.radioOuter, active && s.radioOuterActive]}>
                  {active && <View style={s.radioInner} />}
                </View>
                <View style={s.rowContent}>
                  <Text style={[s.rowTitle, active && s.rowTitleActive]}>
                    {preset.label}
                    <Text style={s.rowPosek}> · {preset.posek}</Text>
                  </Text>
                  <Text style={s.rowSub}>{preset.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Steppers header ── */}
        <Text style={[s.sectionTitle, { marginTop: 28 }]}>תצוגה</Text>

        {/* ── Tzeit stepper ── */}
        <View style={s.stepperCard}>
          <View>
            <Text style={s.stepperTitle}>צאת הכוכבים</Text>
            <Text style={s.stepperSub}>
              {settings.tzetMethod === 'proportional' ? "דקות זמניות" : "דקות קבועות"}
            </Text>
          </View>
          <View style={s.stepper}>
            <TouchableOpacity
              style={s.stepBtn}
              onPress={() => setSettings({
                ...settings,
                tzetMinutes: Math.max(13.5, settings.tzetMinutes - 0.5),
              })}
            >
              <Ionicons name="remove" size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={s.stepVal}>{settings.tzetMinutes}</Text>
            <TouchableOpacity
              style={s.stepBtn}
              onPress={() => setSettings({
                ...settings,
                tzetMinutes: Math.min(72, settings.tzetMinutes + 0.5),
              })}
            >
              <Ionicons name="add" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        {/* ── Taanis look-ahead stepper ── */}
        <View style={[s.stepperCard, { marginTop: 1, borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.stepperTitle}>הצגת צומות מראש</Text>
            <Text style={s.stepperSub}>
              {(settings.taanisLookAheadDays ?? 1) === 0
                ? 'רק ביום הצום עצמו'
                : `עד ${settings.taanisLookAheadDays ?? 1} ${(settings.taanisLookAheadDays ?? 1) === 1 ? 'יום' : 'ימים'} לפני הצום`}
            </Text>
          </View>
          <View style={s.stepper}>
            <TouchableOpacity
              style={s.stepBtn}
              onPress={() => setSettings({
                ...settings,
                taanisLookAheadDays: Math.max(0, (settings.taanisLookAheadDays ?? 1) - 1),
              })}
            >
              <Ionicons name="remove" size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={s.stepVal}>{settings.taanisLookAheadDays ?? 1}</Text>
            <TouchableOpacity
              style={s.stepBtn}
              onPress={() => setSettings({
                ...settings,
                taanisLookAheadDays: Math.min(7, (settings.taanisLookAheadDays ?? 1) + 1),
              })}
            >
              <Ionicons name="add" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header:      { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  // List
  list:         { padding: Spacing.md, paddingTop: Spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, paddingHorizontal: 4 },

  // Card
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 14, gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowContent: { flex: 1 },
  rowTitle:   { fontSize: 15, fontWeight: '500', color: Colors.textSecondary },
  rowTitleActive: { color: Colors.text, fontWeight: '700' },
  rowPosek:   { fontSize: 14, fontWeight: '400', color: Colors.textMuted },
  rowSub:     { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  // Radio
  radioOuter:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner:       { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  // Stepper card
  stepperCard: {
    marginTop: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  stepperTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  stepperSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  stepper:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  stepVal: { fontSize: 18, fontWeight: '700', color: Colors.text, minWidth: 36, textAlign: 'center' },
});
