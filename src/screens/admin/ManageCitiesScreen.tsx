import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAllCities, createCity, deleteCity } from '../../services/cities';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { City } from '../../types';

interface GeoResult {
  latitude: number;
  longitude: number;
  label: string;
  country: string;
  timezone: string;
}

// Derive timezone from ISO country code + longitude (Android fallback — iOS gets it from CLPlacemark)
function inferTimezone(iso: string | null, lat: number, lon: number): string {
  switch (iso?.toUpperCase()) {
    case 'IL': return 'Asia/Jerusalem';
    case 'GB': return 'Europe/London';
    case 'FR': return 'Europe/Paris';
    case 'DE': return 'Europe/Berlin';
    case 'IT': return 'Europe/Rome';
    case 'ES': return 'Europe/Madrid';
    case 'NL': return 'Europe/Amsterdam';
    case 'BE': return 'Europe/Brussels';
    case 'CH': return 'Europe/Zurich';
    case 'AT': return 'Europe/Vienna';
    case 'PL': return 'Europe/Warsaw';
    case 'HU': return 'Europe/Budapest';
    case 'UA': return 'Europe/Kyiv';
    case 'RU':
      if (lon < 45)  return 'Europe/Moscow';
      if (lon < 80)  return 'Asia/Yekaterinburg';
      if (lon < 110) return 'Asia/Krasnoyarsk';
      return 'Asia/Vladivostok';
    case 'US':
      if (lon < -115) return 'America/Los_Angeles';
      if (lon < -101) return 'America/Denver';
      if (lon < -87)  return 'America/Chicago';
      return 'America/New_York';
    case 'CA':
      if (lon < -115) return 'America/Vancouver';
      if (lon < -95)  return 'America/Winnipeg';
      if (lon < -75)  return 'America/Toronto';
      return 'America/Halifax';
    case 'AU':
      if (lon < 130) return 'Australia/Perth';
      if (lon < 138) return 'Australia/Darwin';
      return 'Australia/Sydney';
    case 'AR': return 'America/Argentina/Buenos_Aires';
    case 'BR': return lon < -50 ? 'America/Manaus' : 'America/Sao_Paulo';
    case 'ZA': return 'Africa/Johannesburg';
    default:   return 'UTC';
  }
}

export default function ManageCitiesScreen() {
  const { bottom } = useSafeAreaInsets();
  const [cities,  setCities]  = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery]   = useState('');
  const [searching,   setSearching]     = useState(false);
  const [geoResults,  setGeoResults]    = useState<GeoResult[]>([]);
  const [picked,      setPicked]        = useState<GeoResult | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [tzOverride,    setTzOverride]    = useState('');
  const [tzPickerOpen,  setTzPickerOpen]  = useState(false);
  const [tzSearch,      setTzSearch]      = useState('');

  const ALL_TIMEZONES: string[] = useMemo(
    () => (Intl as any).supportedValuesOf?.('timeZone') ?? [],
    []
  );
  const filteredTz = useMemo(() => {
    const q = tzSearch.trim().toLowerCase();
    if (!q) return ALL_TIMEZONES;
    return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q));
  }, [ALL_TIMEZONES, tzSearch]);

  async function load() {
    setLoading(true);
    try { setCities(await getAllCities()); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setSearchQuery('');
    setGeoResults([]);
    setPicked(null);
    setAddOpen(true);
  }

  // ── Geocode by name ───────────────────────────────────────────────
  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setPicked(null);
    setGeoResults([]);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('הרשאה נדחתה', 'יש לאפשר גישה למיקום כדי לחפש ערים');
        return;
      }
      const coords = await Location.geocodeAsync(q);
      if (!coords.length) {
        Alert.alert('לא נמצא', `לא נמצאה עיר בשם "${q}". נסה שם אחר.`);
        return;
      }
      // Reverse-geocode each result to get city/country details
      const results: GeoResult[] = [];
      for (const c of coords.slice(0, 5)) {
        const places = await Location.reverseGeocodeAsync({ latitude: c.latitude, longitude: c.longitude });
        const p = places[0];
        if (!p) continue;
        const city    = p.city ?? p.subregion ?? p.district ?? q;
        const country = p.country ?? '';
        const tz      = (p as any).timezone ?? inferTimezone(p.isoCountryCode, c.latitude, c.longitude);
        const label   = [city, country].filter(Boolean).join(', ');
        // Deduplicate by label
        if (!results.find((r) => r.label === label)) {
          results.push({ latitude: c.latitude, longitude: c.longitude, label, country, timezone: tz });
        }
      }
      if (results.length === 1) {
        setPicked(results[0]);
        setTzOverride(results[0].timezone);
      } else {
        setGeoResults(results);
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSearching(false);
    }
  }

  // ── Detect current location ───────────────────────────────────────
  async function handleDetectLocation() {
    setSearching(true);
    setPicked(null);
    setGeoResults([]);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('הרשאה נדחתה', 'יש לאפשר גישה למיקום');
        return;
      }
      const pos    = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(pos.coords);
      const p      = places[0];
      if (!p) { Alert.alert('שגיאה', 'לא ניתן לזהות עיר'); return; }
      const city    = p.city ?? p.subregion ?? p.district ?? '';
      const country = p.country ?? '';
      const tz      = (p as any).timezone ?? inferTimezone(p.isoCountryCode, pos.coords.latitude, pos.coords.longitude);
      setSearchQuery(city);
      const result = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, label: [city, country].filter(Boolean).join(', '), country, timezone: tz };
      setPicked(result);
      setTzOverride(tz);
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSearching(false);
    }
  }

  // ── Save to Firestore ─────────────────────────────────────────────
  async function handleSave() {
    if (!picked) return;
    const name = picked.label.split(',')[0].trim();
    setSaving(true);
    try {
      await createCity({
        name,
        country:   picked.country,
        timezone:  tzOverride.trim() || picked.timezone,
        latitude:  picked.latitude,
        longitude: picked.longitude,
      });
      setAddOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(city: City) {
    Alert.alert(
      'מחיקת עיר',
      `האם למחוק את "${city.name}"?\n\nהנתונים של העיר (בתי כנסת, אירועים וכו׳) לא יימחקו.`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק', style: 'destructive',
          onPress: async () => {
            try { await deleteCity(city.id); await load(); }
            catch (e: any) { Alert.alert('שגיאה', e.message); }
          },
        },
      ]
    );
  }

  return (
    <View style={[s.container, { paddingBottom: bottom }]}>
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} size="large" />
      ) : (
        <FlatList
          data={cities}
          keyExtractor={(c) => c.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="location-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>אין ערים במערכת</Text>
              <Text style={s.emptyHint}>לחץ + כדי להוסיף עיר ראשונה</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={s.divider} />}
          renderItem={({ item }) => (
            <View style={s.cityRow}>
              <View style={s.cityIcon}>
                <Ionicons name="location" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cityName}>{item.name}</Text>
                <Text style={s.cityMeta}>{item.country} · {item.timezone}</Text>
                <Text style={s.cityCoords}>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </Text>
              </View>
              <TouchableOpacity style={s.deleteBtn} onPress={() => confirmDelete(item)}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={[s.fab, { bottom: bottom + 24 }]} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color={Colors.white} />
      </TouchableOpacity>

      {/* ── Timezone picker ─────────────────────────────────────── */}
      <Modal visible={tzPickerOpen} transparent animationType="slide" onRequestClose={() => setTzPickerOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setTzPickerOpen(false)}>
          <Pressable style={[s.sheet, { paddingBottom: bottom + 16 }]}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>בחר אזור זמן</Text>
            <View style={s.searchRow}>
              <TextInput scrollEnabled={false}
                style={s.searchInput}
                placeholder='חיפוש (למשל "Jerusalem", "New_York")...'
                value={tzSearch}
                onChangeText={setTzSearch}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={Colors.textMuted}
              />
              {tzSearch.length > 0 && (
                <TouchableOpacity onPress={() => setTzSearch('')} style={s.tzClearBtn}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredTz}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              getItemLayout={(_, index) => ({ length: 46, offset: 46 * index, index })}
              ItemSeparatorComponent={() => <View style={s.tzDivider} />}
              renderItem={({ item }) => {
                const active = item === tzOverride;
                return (
                  <TouchableOpacity
                    style={[s.tzRow, active && s.tzRowActive]}
                    onPress={() => { setTzOverride(item); setTzPickerOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.tzLabel, active && s.tzLabelActive]}>{item}</Text>
                    {active && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Add city sheet ───────────────────────────────────────── */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setAddOpen(false)}>
          <Pressable style={[s.sheet, { paddingBottom: bottom + 16 }]}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>הוסף עיר</Text>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Search row */}
              <View style={s.searchRow}>
                <TextInput scrollEnabled={false}
                  style={s.searchInput}
                  placeholder="שם העיר (עברית או אנגלית)..."
                  value={searchQuery}
                  onChangeText={(t) => { setSearchQuery(t); setGeoResults([]); setPicked(null); }}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />
                <TouchableOpacity
                  style={[s.searchBtn, searching && { opacity: 0.6 }]}
                  onPress={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                >
                  {searching
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Ionicons name="search" size={18} color={Colors.white} />}
                </TouchableOpacity>
              </View>

              {/* Detect current location */}
              <TouchableOpacity style={s.detectBtn} onPress={handleDetectLocation} disabled={searching}>
                <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
                <Text style={s.detectBtnText}>השתמש במיקום הנוכחי של המכשיר</Text>
              </TouchableOpacity>

              {/* Multiple results → pick one */}
              {geoResults.length > 1 && (
                <View style={s.resultBox}>
                  <Text style={s.resultHint}>נמצאו מספר תוצאות — בחר:</Text>
                  {geoResults.map((r, i) => (
                    <TouchableOpacity key={i} style={s.resultRow} onPress={() => { setPicked(r); setTzOverride(r.timezone); setGeoResults([]); }}>
                      <Ionicons name="location-outline" size={16} color={Colors.primary} />
                      <Text style={s.resultLabel}>{r.label}</Text>
                      <Text style={s.resultCoords}>{r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Resolved city preview */}
              {picked && (
                <View style={s.pickedCard}>
                  <View style={s.pickedHeader}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    <Text style={s.pickedTitle}>נמצא</Text>
                  </View>
                  <Text style={s.pickedName}>{picked.label}</Text>
                  <Text style={s.pickedDetail}>
                    {picked.latitude.toFixed(5)}, {picked.longitude.toFixed(5)}
                  </Text>
                  <TouchableOpacity style={s.tzEditRow} onPress={() => { setTzSearch(''); setTzPickerOpen(true); }}>
                    <Text style={s.pickedDetail}>אזור זמן:</Text>
                    <Text style={s.tzValue}>{tzOverride || '—'}</Text>
                    <Ionicons name="chevron-down" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Save button */}
              <TouchableOpacity
                style={[s.saveBtn, (!picked || saving) && { opacity: 0.45 }]}
                onPress={handleSave}
                disabled={!picked || saving}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={s.saveBtnText}>הוסף לרשימת הערים</Text>}
              </TouchableOpacity>

            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list:      { padding: Spacing.md },

  cityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md, padding: Spacing.md,
  },
  cityIcon:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  cityName:   { fontSize: 15, fontWeight: '700', color: Colors.text },
  cityMeta:   { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cityCoords: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  deleteBtn:  { padding: 8 },
  divider:    { height: 8 },

  empty:      { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textSecondary },
  emptyHint:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },

  fab: {
    position: 'absolute', right: Spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingHorizontal: Spacing.lg, maxHeight: '90%',
  },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 16 },

  searchRow:  { flexDirection: 'row', gap: 10, marginBottom: 10 },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: 11, fontSize: 14, color: Colors.text,
    backgroundColor: Colors.background,
  },
  searchBtn: {
    width: 46, borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  detectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 11, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '08',
    marginBottom: 16,
  },
  detectBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  resultBox:  { backgroundColor: Colors.background, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: 14, overflow: 'hidden' },
  resultHint: { fontSize: 12, color: Colors.textMuted, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  resultRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  resultLabel:  { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  resultCoords: { fontSize: 11, color: Colors.textMuted },

  pickedCard: {
    backgroundColor: Colors.success + '10', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.success + '40',
    padding: Spacing.md, marginBottom: 16, gap: 4,
  },
  pickedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  pickedTitle:  { fontSize: 13, fontWeight: '700', color: Colors.success },
  pickedName:   { fontSize: 15, fontWeight: '700', color: Colors.text },
  pickedDetail: { fontSize: 12, color: Colors.textSecondary },

  saveBtn:     { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },

  tzEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4,
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: Colors.primary + '0A', borderRadius: Radius.sm,
  },
  tzValue: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.primary },

  tzClearBtn: { padding: 4 },
  tzDivider:  { height: 1, backgroundColor: Colors.border },
  tzRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, height: 46 },
  tzRowActive:  { backgroundColor: Colors.primary + '0C' },
  tzLabel:      { flex: 1, fontSize: 14, color: Colors.text },
  tzLabelActive: { fontWeight: '700', color: Colors.primary },
});
