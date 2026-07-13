import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, ActivityIndicator, Pressable, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCities } from '../hooks/useCities';
import { Colors, Spacing, Radius } from '../utils/theme';
import { City } from '../types';

interface Props {
  visible: boolean;
  selectedCityId: string;
  onSelect: (city: City) => void;
  onClose: () => void;
}

export default function CityPicker({ visible, selectedCityId, onSelect, onClose }: Props) {
  const { cities, loading } = useCities();
  const { bottom } = useSafeAreaInsets();
  const [query,      setQuery]      = useState('');
  const [detecting,  setDetecting]  = useState(false);
  const [detectHint, setDetectHint] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return cities;
    const q = query.toLowerCase();
    return cities.filter((c) =>
      c.name.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q)
    );
  }, [cities, query]);

  // ── Auto-detect city from device GPS ─────────────────────────────
  async function detectCity() {
    setDetecting(true);
    setDetectHint(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDetectHint('לא ניתן לגשת למיקום');
        return;
      }
      const pos    = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(pos.coords);
      const p      = places[0];
      if (!p) { setDetectHint('לא ניתן לזהות עיר'); return; }

      const detectedName = (p.city ?? p.subregion ?? p.district ?? '').toLowerCase();

      // Try to match against existing cities list
      const match = cities.find((c) =>
        c.name.toLowerCase().includes(detectedName) ||
        detectedName.includes(c.name.toLowerCase())
      );
      if (match) {
        onSelect(match);
        onClose();
      } else {
        const displayName = p.city ?? p.subregion ?? 'עיר לא מזוהה';
        setDetectHint(`זוהה: ${displayName} — העיר אינה ברשימה. בקש ממנהל המערכת להוסיפה.`);
        setQuery(displayName);
      }
    } catch {
      setDetectHint('שגיאה בזיהוי המיקום');
    } finally {
      setDetecting(false);
    }
  }

  function handleClose() {
    setQuery('');
    setDetectHint(null);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable style={s.overlay} onPress={handleClose}>
        <Pressable style={[s.sheet, { paddingBottom: bottom + 8 }]}>
          <View style={s.handle} />
          <Text style={s.title}>בחר עיר</Text>

          {/* Search */}
          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={s.searchIcon} />
            <TextInput scrollEnabled={false}
              style={s.searchInput}
              placeholder="חיפוש עיר..."
              value={query}
              onChangeText={setQuery}
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Detect location button */}
          <TouchableOpacity style={s.detectBtn} onPress={detectCity} disabled={detecting || loading}>
            {detecting
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="navigate-outline" size={16} color={Colors.primary} />}
            <Text style={s.detectText}>
              {detecting ? 'מזהה מיקום...' : 'זהה את מיקומי אוטומטית'}
            </Text>
          </TouchableOpacity>

          {detectHint && (
            <View style={s.hintBox}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.gold} />
              <Text style={s.hintText}>{detectHint}</Text>
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 32 }} />
          ) : filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="location-outline" size={40} color={Colors.textMuted} />
              <Text style={s.emptyText}>
                {query ? `לא נמצאה עיר בשם "${query}"` : 'לא נמצאו ערים במערכת'}
              </Text>
              {!query && <Text style={s.emptyHint}>פנה למנהל המערכת להוסיף ערים</Text>}
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={s.divider} />}
              renderItem={({ item }) => {
                const active = item.id === selectedCityId;
                return (
                  <TouchableOpacity
                    style={[s.cityRow, active && s.cityRowActive]}
                    onPress={() => { onSelect(item); handleClose(); }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.iconCircle, active && s.iconCircleActive]}>
                      <Ionicons name="location" size={18} color={active ? Colors.white : Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cityName, active && s.cityNameActive]}>{item.name}</Text>
                      {item.country ? <Text style={s.cityCountry}>{item.country}</Text> : null}
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '75%', paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12 },
  title:  { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 12, paddingHorizontal: Spacing.lg },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.lg, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 9,
    backgroundColor: Colors.background,
  },
  searchIcon:  {},
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  detectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: Spacing.lg, marginBottom: 10,
    paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '08',
  },
  detectText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  hintBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginHorizontal: Spacing.lg, marginBottom: 10,
    backgroundColor: Colors.gold + '12', borderRadius: Radius.sm,
    padding: 10, borderWidth: 1, borderColor: Colors.gold + '30',
  },
  hintText: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 17 },

  cityRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: Spacing.lg, paddingVertical: 13 },
  cityRowActive:  { backgroundColor: Colors.primary + '0C' },
  iconCircle:     { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  iconCircleActive: { backgroundColor: Colors.primary },
  cityName:       { fontSize: 15, fontWeight: '600', color: Colors.text },
  cityNameActive: { color: Colors.primary },
  cityCountry:    { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  divider:        { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.lg },

  empty:     { alignItems: 'center', paddingVertical: 28, gap: 8, paddingHorizontal: Spacing.lg },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
});
