import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Modal, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';

export interface AddFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'select' | 'multiselect';
  options?: { value: string; label: string }[];
  required?: boolean;
}

// multiselect values are stored as a comma-joined string in the values map
const splitMulti = (v?: string) => (v ?? '').split(',').filter(Boolean);

interface Props {
  visible: boolean;
  title: string;
  accentColor?: string;
  fields: AddFieldDef[];
  submitting?: boolean;
  inline?: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}

/** Lightweight "create new item" form — text inputs + chip selects.
 *  inline=true → renders as a card in the parent ScrollView (no modal overlay).
 *  inline=false (default) → bottom sheet modal. */
export default function AddItemModal({
  visible, title, accentColor = Colors.primary, fields, submitting, inline = false, onSubmit, onClose,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  function set(key: string, v: string) {
    setValues((p) => ({ ...p, [key]: v }));
  }

  function toggleMulti(key: string, v: string) {
    setValues((p) => {
      const cur = splitMulti(p[key]);
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      return { ...p, [key]: next.join(',') };
    });
  }

  function handleSubmit() {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        Alert.alert('שדה חסר', `יש למלא: ${f.label}`);
        return;
      }
    }
    onSubmit(values);
  }

  // Reset values whenever the modal is freshly opened
  function handleClose() {
    setValues({});
    onClose();
  }

  const formContent = (
    <>
      <Text style={[s.title, { color: accentColor }]}>{title}</Text>

      <ScrollView keyboardShouldPersistTaps="handled" style={inline ? undefined : { maxHeight: 420 }}>
        {fields.map((f) => (
          <View key={f.key} style={s.field}>
            <Text style={s.label}>
              {f.label}{f.required ? ' *' : ''}
            </Text>

            {f.type === 'select' || f.type === 'multiselect' ? (
              <View style={s.chipRow}>
                {f.options?.map((opt) => {
                  const active = f.type === 'multiselect'
                    ? splitMulti(values[f.key]).includes(opt.value)
                    : values[f.key] === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.chip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
                      onPress={() => f.type === 'multiselect' ? toggleMulti(f.key, opt.value) : set(f.key, opt.value)}
                    >
                      <Text style={[s.chipTxt, active && { color: '#fff' }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput scrollEnabled={false}
                style={s.input}
                value={values[f.key] ?? ''}
                onChangeText={(v) => set(f.key, v)}
                placeholder={f.placeholder}
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
              />
            )}
          </View>
        ))}
      </ScrollView>

      <View style={s.btnRow}>
        <TouchableOpacity style={s.cancelBtn} onPress={handleClose} disabled={submitting}>
          <Text style={s.cancelTxt}>ביטול</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.createBtn, { backgroundColor: accentColor }, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Ionicons name="add" size={18} color="#fff" /><Text style={s.createTxt}>צור</Text></>}
        </TouchableOpacity>
      </View>
    </>
  );

  if (inline) {
    if (!visible) return null;
    return <View style={s.inlineCard}>{formContent}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          {formContent}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  inlineCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm,
    ...Shadow.card,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.border, marginBottom: 6 },
  title:  { fontSize: 18, fontWeight: '800', marginBottom: 4 },

  field:  { marginBottom: Spacing.sm },
  label:  { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    fontSize: 15, color: Colors.text, backgroundColor: Colors.background,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  chipTxt: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  btnRow:    { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  createBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  createTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
