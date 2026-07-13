import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';

interface Props {
  value?: string;
  placeholder: string;
  options: string[];
  onSelect: (v: string) => void;
  onAddNew?: () => void;      // optional "+ הוסף לרשימה"
  accentColor?: string;
}

/** Compact dropdown: a field that opens a modal list (with optional "add"). */
export default function Dropdown({
  value, placeholder, options, onSelect, onAddNew, accentColor = Colors.kosher,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity style={s.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {options.map((o) => {
                const active = o === value;
                return (
                  <TouchableOpacity key={o} style={s.row} onPress={() => { onSelect(o); setOpen(false); }}>
                    {active && <Ionicons name="checkmark" size={18} color={accentColor} />}
                    <Text style={[s.rowTxt, active && { color: accentColor, fontWeight: '800' }]}>{o}</Text>
                  </TouchableOpacity>
                );
              })}
              {onAddNew && (
                <TouchableOpacity
                  style={[s.row, s.addRow]}
                  onPress={() => { setOpen(false); onAddNew(); }}
                >
                  <Ionicons name="add" size={18} color={accentColor} />
                  <Text style={[s.rowTxt, { color: accentColor, fontWeight: '700' }]}>הוסף לרשימה</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    gap:               8,
    borderWidth:       1.5,
    borderColor:       Colors.border,
    borderRadius:      Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical:   11,
    backgroundColor:   Colors.background,
  },
  value:       { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '600' },
  placeholder: { color: Colors.textMuted, fontWeight: '400' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.lg },
  sheet:   { backgroundColor: Colors.cardBackground, borderRadius: Radius.lg, overflow: 'hidden', ...Shadow.card, shadowOpacity: 0.2, elevation: 10 },
  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowTxt:  { fontSize: 15, color: Colors.text },
  addRow:  { backgroundColor: Colors.background },
});
