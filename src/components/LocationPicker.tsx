import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../utils/theme';
import { useCityId } from '../hooks/useCityId';
import { useSynagogues } from '../hooks/useSynagogues';
import { useRestaurants } from '../hooks/useRestaurants';

const STORAGE_KEY = 'kehila_saved_locations_v1';
const MAX_SAVED = 12;
const MAX_PER_SECTION = 8;

export interface LocationPickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}

export default function LocationPicker({
  value,
  onChange,
  placeholder = 'כתובת / שם המקום',
  invalid = false,
}: LocationPickerProps) {
  const cityId = useCityId();
  const { synagogues } = useSynagogues(cityId);
  const { restaurants } = useRestaurants(cityId);

  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (v) setSaved(JSON.parse(v)); })
      .catch(() => {});
  }, []);

  const q = query.trim().toLowerCase();

  const filteredSaved = useMemo(
    () => saved.filter(s => !q || s.toLowerCase().includes(q)),
    [saved, q],
  );

  const filteredSyns = useMemo(
    () =>
      synagogues
        .filter(s => !q || s.name.toLowerCase().includes(q) || (s.neighborhood ?? '').toLowerCase().includes(q))
        .slice(0, MAX_PER_SECTION),
    [synagogues, q],
  );

  const filteredRests = useMemo(
    () =>
      restaurants
        .filter(r => !q || r.name.toLowerCase().includes(q) || (r.neighborhood ?? '').toLowerCase().includes(q) || r.address.toLowerCase().includes(q))
        .slice(0, MAX_PER_SECTION),
    [restaurants, q],
  );

  function bookmarkQuery() {
    const loc = query.trim();
    if (!loc || saved.includes(loc)) return;
    const next = [loc, ...saved].slice(0, MAX_SAVED);
    setSaved(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function removeSaved(loc: string) {
    const next = saved.filter(s => s !== loc);
    setSaved(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function select(loc: string) {
    onChange(loc);
    setVisible(false);
    setQuery('');
  }

  function open() {
    setQuery('');
    setVisible(true);
  }

  const trimmedQuery = query.trim();
  const alreadySaved = saved.includes(trimmedQuery);
  const showUseTyped = trimmedQuery.length > 0;
  const hasAnything =
    filteredSaved.length > 0 || filteredSyns.length > 0 || filteredRests.length > 0;

  return (
    <>
      <TouchableOpacity style={[lp.trigger, invalid && lp.triggerInvalid]} onPress={open} activeOpacity={0.75}>
        <Ionicons
          name={value ? 'location' : 'location-outline'}
          size={17}
          color={value ? Colors.primary : Colors.textMuted}
        />
        <Text style={[lp.triggerTxt, !value && lp.triggerPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={lp.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setVisible(false)} />
          <View style={lp.sheet}>
            <View style={lp.handle} />
            <Text style={lp.sheetTitle}>בחר מיקום</Text>

            {/* Search row */}
            <View style={lp.searchRow}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={lp.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="חפש או הקלד מיקום חדש..."
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {trimmedQuery.length > 0 && (
                <TouchableOpacity
                  onPress={bookmarkQuery}
                  disabled={alreadySaved}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={alreadySaved ? 'bookmark' : 'bookmark-outline'}
                    size={19}
                    color={alreadySaved ? Colors.primary : Colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={lp.resultScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Use typed text */}
              {showUseTyped && (
                <TouchableOpacity style={lp.row} onPress={() => select(trimmedQuery)}>
                  <View style={[lp.rowIcon, { backgroundColor: Colors.primary + '18' }]}>
                    <Ionicons name="create-outline" size={15} color={Colors.primary} />
                  </View>
                  <View style={lp.rowBody}>
                    <Text style={lp.rowTxt} numberOfLines={1}>"{trimmedQuery}"</Text>
                    <Text style={lp.rowHint}>השתמש כמות שהוא</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Saved locations */}
              {filteredSaved.length > 0 && (
                <>
                  <RowHeader label="מיקומים שמורים" icon="bookmark" color={Colors.primary} />
                  {filteredSaved.map(loc => (
                    <TouchableOpacity key={loc} style={lp.row} onPress={() => select(loc)}>
                      <View style={[lp.rowIcon, { backgroundColor: Colors.primary + '18' }]}>
                        <Ionicons name="location" size={15} color={Colors.primary} />
                      </View>
                      <Text style={[lp.rowTxt, { flex: 1 }]} numberOfLines={1}>{loc}</Text>
                      <TouchableOpacity
                        onPress={() => removeSaved(loc)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle-outline" size={18} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Synagogues */}
              {filteredSyns.length > 0 && (
                <>
                  <RowHeader label="בתי כנסת" icon="business-outline" color={Colors.primary} />
                  {filteredSyns.map(syn => (
                    <TouchableOpacity
                      key={syn.id}
                      style={lp.row}
                      onPress={() => select(syn.name + (syn.neighborhood ? ` · ${syn.neighborhood}` : ''))}
                    >
                      <View style={[lp.rowIcon, { backgroundColor: Colors.primary + '18' }]}>
                        <Ionicons name="business" size={15} color={Colors.primary} />
                      </View>
                      <View style={lp.rowBody}>
                        <Text style={lp.rowTxt} numberOfLines={1}>{syn.name}</Text>
                        {syn.neighborhood ? <Text style={lp.rowHint}>{syn.neighborhood}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Businesses / restaurants */}
              {filteredRests.length > 0 && (
                <>
                  <RowHeader label="בתי עסק" icon="storefront-outline" color={Colors.kosher} />
                  {filteredRests.map(r => (
                    <TouchableOpacity
                      key={r.id}
                      style={lp.row}
                      onPress={() => select(r.name + (r.address ? ` · ${r.address}` : ''))}
                    >
                      <View style={[lp.rowIcon, { backgroundColor: Colors.kosher + '18' }]}>
                        <Ionicons name="storefront" size={15} color={Colors.kosher} />
                      </View>
                      <View style={lp.rowBody}>
                        <Text style={lp.rowTxt} numberOfLines={1}>{r.name}</Text>
                        {(r.neighborhood || r.address) ? (
                          <Text style={lp.rowHint} numberOfLines={1}>
                            {r.neighborhood || r.address}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Empty state */}
              {!hasAnything && !showUseTyped && (
                <View style={lp.empty}>
                  <Ionicons name="location-outline" size={40} color={Colors.border} />
                  <Text style={lp.emptyTxt}>{'הקלד מיקום לחיפוש\nאו בחר מהרשימה'}</Text>
                </View>
              )}

              {!hasAnything && showUseTyped && filteredSaved.length === 0 && filteredSyns.length === 0 && filteredRests.length === 0 && q.length > 0 && (
                <Text style={[lp.emptyTxt, { marginTop: 8 }]}>
                  לא נמצאו תוצאות — ניתן להשתמש בטקסט שהוקלד
                </Text>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function RowHeader({ label, icon, color }: { label: string; icon: string; color: string }) {
  return (
    <View style={lp.rowHeader}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[lp.rowHeaderTxt, { color }]}>{label}</Text>
    </View>
  );
}

const lp = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomWidth: 1.5, borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  triggerTxt: { flex: 1, fontSize: 15, color: Colors.text },
  triggerPlaceholder: { color: Colors.textMuted },
  triggerInvalid: { borderBottomColor: Colors.danger, borderBottomWidth: 2 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 0,
    maxHeight: Dimensions.get('window').height * 0.75,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '700', color: Colors.text,
    textAlign: 'center', marginBottom: 12,
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  resultScroll: { maxHeight: Dimensions.get('window').height * 0.52 },

  rowHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 2, marginTop: 4,
  },
  rowHeaderTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTxt: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  rowHint: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  empty: { alignItems: 'center', paddingTop: 32, gap: 10 },
  emptyTxt: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
