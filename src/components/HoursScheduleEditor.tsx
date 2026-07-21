import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { DayKey, HoursBlock } from '../types';
import TimePicker from './TimePicker';

const DAY_CHIPS: [DayKey, string][] = [
  ['sunday',    "א'"], ['monday',   "ב'"], ['tuesday',  "ג'"], ['wednesday', "ד'"],
  ['thursday',  "ה'"], ['friday',   "ו'"], ['saturday', "ש'"],
];

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface HoursScheduleEditorProps {
  value: HoursBlock[];
  onChange: (blocks: HoursBlock[]) => void;
}

// Flexible opening-hours editor: each block is a time range applied to
// whichever days the manager picks — not fixed day groups, since one mikveh
// might have Sunday open late and another might have Sunday closed.
export default function HoursScheduleEditor({ value, onChange }: HoursScheduleEditorProps) {
  const [draft, setDraft] = useState<HoursBlock | null>(null);

  function openNew() {
    setDraft({ id: makeId(), days: [], start: '18:00', end: '22:00' });
  }

  function toggleDay(day: DayKey) {
    if (!draft) return;
    setDraft({
      ...draft,
      days: draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day],
    });
  }

  function saveDraft() {
    if (!draft) return;
    if (draft.days.length === 0) { Alert.alert('שגיאה', 'יש לבחור לפחות יום אחד'); return; }
    if (draft.start >= draft.end) { Alert.alert('שגיאה', 'שעת הפתיחה חייבת להיות לפני שעת הסגירה'); return; }
    const exists = value.some((b) => b.id === draft.id);
    onChange(exists ? value.map((b) => (b.id === draft.id ? draft : b)) : [...value, draft]);
    setDraft(null);
  }

  function deleteBlock(id: string) {
    Alert.alert('מחיקת שעות פתיחה', 'למחוק את בלוק השעות הזה?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () => onChange(value.filter((b) => b.id !== id)) },
    ]);
  }

  return (
    <View>
      {value.length === 0 && !draft && (
        <Text style={s.emptyTxt}>לא הוגדרו שעות פתיחה</Text>
      )}

      {value.map((block) => (
        <View key={block.id} style={s.blockRow}>
          <View style={s.blockDays}>
            {DAY_CHIPS.map(([key, label]) => (
              <View key={key} style={[s.dayDot, block.days.includes(key) && s.dayDotOn]}>
                <Text style={[s.dayDotTxt, block.days.includes(key) && s.dayDotTxtOn]}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={s.blockHours}>{block.start}–{block.end}</Text>
          <TouchableOpacity onPress={() => setDraft({ ...block })} hitSlop={HIT_SLOP} style={s.blockBtn}>
            <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteBlock(block.id)} hitSlop={HIT_SLOP} style={s.blockBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      ))}

      {draft ? (
        <View style={s.draftCard}>
          <Text style={s.draftLabel}>ימים</Text>
          <View style={s.draftDaysRow}>
            {DAY_CHIPS.map(([key, label]) => {
              const active = draft.days.includes(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.dayChip, active && s.dayChipOn]}
                  onPress={() => toggleDay(key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.dayChipTxt, active && s.dayChipTxtOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.draftTimesRow}>
            <View style={s.draftTimeField}>
              <Text style={s.draftLabel}>פתיחה</Text>
              <TimePicker compact value={draft.start} onChange={(v) => setDraft({ ...draft, start: v })} />
            </View>
            <Text style={s.draftDash}>—</Text>
            <View style={s.draftTimeField}>
              <Text style={s.draftLabel}>סגירה</Text>
              <TimePicker compact value={draft.end} onChange={(v) => setDraft({ ...draft, end: v })} />
            </View>
          </View>

          <View style={s.draftActions}>
            <TouchableOpacity style={s.draftCancelBtn} onPress={() => setDraft(null)}>
              <Text style={s.draftCancelTxt}>ביטול</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.draftSaveBtn} onPress={saveDraft}>
              <Text style={s.draftSaveTxt}>שמור</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.addBtn} onPress={openNew}>
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={s.addBtnTxt}>הוסף שעות פתיחה</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  emptyTxt: { fontSize: 13, color: Colors.textMuted, paddingVertical: 8, textAlign: 'center' },

  blockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  blockDays: { flexDirection: 'row', gap: 3 },
  dayDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  dayDotOn:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayDotTxt:   { fontSize: 9, fontWeight: '700', color: Colors.textMuted },
  dayDotTxtOn: { color: Colors.white },
  blockHours:  { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'left' },
  blockBtn:    { padding: 2 },

  draftCard: {
    backgroundColor: Colors.background, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.primary + '40',
    padding: Spacing.sm, marginVertical: 6, gap: 8,
  },
  draftLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  draftDaysRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayChip: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  dayChipOn:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayChipTxt:  { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  dayChipTxtOn:{ color: Colors.white },

  draftTimesRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  draftTimeField: { flex: 1, gap: 4 },
  draftDash: { fontSize: 16, color: Colors.textMuted, marginBottom: 10 },

  draftActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  draftCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  draftCancelTxt: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  draftSaveBtn:   { flex: 1, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  draftSaveTxt:   { fontSize: 13, fontWeight: '700', color: Colors.white },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginTop: 4,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: Colors.primary + '60', borderRadius: Radius.md,
  },
  addBtnTxt: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
