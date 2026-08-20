import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheetModal from './BottomSheetModal';
import { Colors, Spacing, Radius } from '../utils/theme';

// A real (modal + search + tap-to-select) dropdown for picking a neighborhood,
// mirroring CityPicker's UX — replaces the chip-row pattern for this one field
// since a growing per-city neighborhood list doesn't scale well as pills.
interface Props {
  visible: boolean;
  options: string[];
  selected?: string;
  canAdd: boolean;
  onSelect: (name: string | undefined) => void;
  onAddNew: (name: string) => Promise<boolean>;
  onClose: () => void;
}

export default function NeighborhoodPickerModal({
  visible, options, selected, canAdd, onSelect, onAddNew, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setQuery(''); }, [visible]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();
  const canOfferAdd = canAdd && trimmedQuery.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmedQuery.toLowerCase());

  function handleClose() {
    setQuery('');
    onClose();
  }

  async function handleAddNew() {
    if (!trimmedQuery || saving) return;
    setSaving(true);
    try {
      const ok = await onAddNew(trimmedQuery);
      if (ok) {
        onSelect(trimmedQuery);
        handleClose();
      } else {
        Alert.alert('שגיאה', 'שכונה זו כבר קיימת ברשימה');
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message ?? 'שגיאה בהוספת שכונה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheetModal
      visible={visible}
      onClose={handleClose}
      title="בחר שכונה"
      avoidKeyboard
    >
      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
        <TextInput scrollEnabled={false}
          style={s.searchInput}
          placeholder="חיפוש / הוספת שכונה..."
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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={s.divider} />}
        ListHeaderComponent={
          selected ? (
            <TouchableOpacity style={s.clearRow} onPress={() => { onSelect(undefined); handleClose(); }}>
              <Ionicons name="close-circle-outline" size={18} color={Colors.textSecondary} />
              <Text style={s.clearText}>נקה בחירה</Text>
            </TouchableOpacity>
          ) : null
        }
        ListFooterComponent={
          canOfferAdd ? (
            <TouchableOpacity style={s.addRow} onPress={handleAddNew} disabled={saving}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={s.addText}>הוסף שכונה "{trimmedQuery}"</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          !canOfferAdd ? (
            <View style={s.empty}>
              <Ionicons name="location-outline" size={36} color={Colors.textMuted} />
              <Text style={s.emptyText}>
                {query ? `לא נמצאה שכונה בשם "${query}"` : 'אין עדיין שכונות מוגדרות'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const active = item === selected;
          return (
            <TouchableOpacity
              style={[s.row, active && s.rowActive]}
              onPress={() => { onSelect(item); handleClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[s.rowText, active && s.rowTextActive]}>{item}</Text>
              {active && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
            </TouchableOpacity>
          );
        }}
      />
    </BottomSheetModal>
  );
}

const s = StyleSheet.create({
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.lg, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 9,
    backgroundColor: Colors.background,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  clearText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 14 },
  addText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: 13 },
  rowActive:  { backgroundColor: Colors.primary + '0C' },
  rowText:       { fontSize: 15, fontWeight: '600', color: Colors.text },
  rowTextActive: { color: Colors.primary },
  divider:    { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.lg },

  empty:     { alignItems: 'center', paddingVertical: 28, gap: 8, paddingHorizontal: Spacing.lg },
  emptyText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
});
