import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BusinessDepartment, KosherLevel } from '../types';
import { CATEGORY_META } from '../services/businesses';
import { Colors, Spacing, Radius } from '../utils/theme';

const LEVELS: { key: KosherLevel; label: string }[] = [
  { key: 'mehadrin',      label: 'מהדרין' },
  { key: 'regular',       label: 'רגיל' },
  { key: 'chalav_israel', label: 'חלב ישראל' },
  { key: 'bishul_israel', label: 'בישול ישראל' },
  { key: 'glatt',         label: 'גלאט' },
];

// One tap adds a department with a sensible category already chosen.
const QUICK: { name: string; cat: string }[] = [
  { name: 'פירות וירקות', cat: 'produce' },
  { name: 'בשר ועוף',     cat: 'meat' },
  { name: 'דגים',         cat: 'fish' },
  { name: 'מעדנייה',      cat: 'deli' },
  { name: 'גבינות',       cat: 'dairy' },
  { name: 'מאפייה',       cat: 'bakery' },
  { name: 'פיצוחים',      cat: 'nuts' },
];

interface Props {
  value: BusinessDepartment[];
  onChange: (next: BusinessDepartment[]) => void;
}

/** Edits the departments of a business that has a different kashrut per section. */
export default function DepartmentsEditor({ value, onChange }: Props) {
  const update = (id: string, patch: Partial<BusinessDepartment>) =>
    onChange(value.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const add = (name = '', cat?: string) =>
    onChange([...value, { id: `dept-${Date.now()}-${value.length}`, name, categories: cat ? [cat] : [], kosherLevel: ['regular'] }]);
  const remove = (id: string) => onChange(value.filter((d) => d.id !== id));
  const toggleLevel = (d: BusinessDepartment, lvl: KosherLevel) => {
    const has = d.kosherLevel.includes(lvl);
    let next = has ? d.kosherLevel.filter((l) => l !== lvl) : [...d.kosherLevel, lvl];
    // mehadrin and regular exclude each other
    if (!has && lvl === 'mehadrin') next = next.filter((l) => l !== 'regular');
    if (!has && lvl === 'regular') next = next.filter((l) => l !== 'mehadrin');
    update(d.id, { kosherLevel: next });
  };

  return (
    <View>
      {value.length === 0 && <Text style={s.empty}>אין מחלקות — העסק מוצג עם כשרות אחת</Text>}

      {value.map((d) => (
        <View key={d.id} style={s.card}>
          <View style={s.rowTop}>
            <TextInput
              scrollEnabled={false}
              style={[s.input, { flex: 1 }]}
              value={d.name}
              onChangeText={(t) => update(d.id, { name: t })}
              placeholder="שם המחלקה"
              textAlign="right"
            />
            <TouchableOpacity onPress={() => remove(d.id)} hitSlop={8} style={s.del}>
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {CATEGORY_META.map((c) => {
              const on = d.categories?.includes(c.key);
              return (
                <TouchableOpacity key={c.key} style={[s.chip, on && s.chipOn]} onPress={() => update(d.id, { categories: on ? [] : [c.key] })}>
                  <Text style={[s.chipTxt, on && s.chipTxtOn]}>{c.icon} {c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={s.chipsWrap}>
            {LEVELS.map((l) => {
              const on = d.kosherLevel.includes(l.key);
              return (
                <TouchableOpacity key={l.key} style={[s.chip, on && s.chipOn]} onPress={() => toggleLevel(d, l.key)}>
                  <Text style={[s.chipTxt, on && s.chipTxtOn]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.rowTop}>
            <TextInput
              scrollEnabled={false}
              style={[s.input, { flex: 1 }]}
              value={d.mashgiachName ?? ''}
              onChangeText={(t) => update(d.id, { mashgiachName: t || undefined })}
              placeholder="שם המשגיח"
              textAlign="right"
            />
            <TextInput
              scrollEnabled={false}
              style={[s.input, { flex: 1 }]}
              value={d.mashgiachPhone ?? ''}
              onChangeText={(t) => update(d.id, { mashgiachPhone: t || undefined })}
              placeholder="טלפון"
              keyboardType="phone-pad"
              textAlign="right"
            />
          </View>
        </View>
      ))}

      <View style={s.chipsWrap}>
        {QUICK.filter((q) => !value.some((d) => d.name === q.name)).map((q) => (
          <TouchableOpacity key={q.name} style={s.quick} onPress={() => add(q.name, q.cat)}>
            <Ionicons name="add" size={13} color={Colors.kosher} />
            <Text style={s.quickTxt}>{q.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.quick} onPress={() => add()}>
          <Ionicons name="add" size={13} color={Colors.kosher} />
          <Text style={s.quickTxt}>מחלקה אחרת</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Drops blank departments and empty optional fields before saving. */
export function cleanDepartments(list: BusinessDepartment[]): BusinessDepartment[] {
  return list
    .filter((d) => d.name.trim())
    .map((d) => ({
      id: d.id,
      name: d.name.trim(),
      categories: d.categories ?? [],
      kosherLevel: d.kosherLevel.length ? d.kosherLevel : ['regular'],
      ...(d.issuedBy ? { issuedBy: d.issuedBy } : {}),
      ...(d.mashgiachName?.trim() ? { mashgiachName: d.mashgiachName.trim() } : {}),
      ...(d.mashgiachPhone?.trim() ? { mashgiachPhone: d.mashgiachPhone.trim() } : {}),
      ...(d.notes ? { notes: d.notes } : {}),
    }));
}

const s = StyleSheet.create({
  empty:   { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm },
  card:    { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.sm, gap: 8 },
  rowTop:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input:   { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, color: Colors.text },
  del:     { padding: 6 },
  chips:   { flexDirection: 'row', gap: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  chipOn:  { backgroundColor: Colors.kosher, borderColor: Colors.kosher },
  chipTxt: { fontSize: 12, color: Colors.text },
  chipTxtOn: { color: '#fff', fontWeight: '700' },
  quick:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm, backgroundColor: Colors.kosher + '12' },
  quickTxt: { fontSize: 12, color: Colors.kosher, fontWeight: '600' },
});
