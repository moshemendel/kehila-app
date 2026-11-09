import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '../utils/theme';
import type { Gender } from '../types';

export const GENDER_OPTIONS: { key: Gender; label: string }[] = [
  { key: 'male',   label: 'גבר' },
  { key: 'female', label: 'אישה' },
  { key: 'any',    label: 'לא משנה' },
];

/**
 * Three chips, one choice. "לא משנה" is a real answer ("don't tailor things for
 * me"), not a skip — so the sign-up can require a pick without forcing anyone to
 * state something they would rather not.
 */
export default function GenderPicker({
  value, onChange,
}: { value: Gender | null | undefined; onChange: (g: Gender) => void }) {
  return (
    <View style={st.row}>
      {GENDER_OPTIONS.map((o) => {
        const on = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[st.chip, on && st.chipOn]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.8}
          >
            <Text style={[st.txt, on && st.txtOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  row:   { flexDirection: 'row', gap: Spacing.sm },
  chip:  {
    flex: 1, alignItems: 'center', paddingVertical: 11,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    backgroundColor: Colors.background,
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: Colors.primary + '14' },
  txt:    { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  txtOn:  { color: Colors.primary, fontWeight: '800' },
});
