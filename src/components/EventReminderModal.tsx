/**
 * Per-event reminders, set the way a calendar sets them: a list you add to,
 * each entry a distance before the event.
 *
 * A global "always remind me a day before" cannot serve both a weekly shiur
 * and a סיום מסכת announced three weeks out — one needs a nudge, the other
 * needs enough warning to shower, dress and arrange the evening. So the
 * distances belong to the event, not to the app.
 *
 * The default set from settings seeds the list, so starring an event and
 * pressing save without touching anything still does something sensible.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheetModal from './BottomSheetModal';
import { DrumWheel } from './DrumWheel';
import { formatLead, MAX_REMINDERS_PER_EVENT } from '../utils/eventReminders';
import { Colors, Spacing, Radius } from '../utils/theme';

interface Props {
  visible: boolean;
  eventTitle: string;
  /** ISO start, used to grey out distances that already passed. */
  startDate: string;
  /** Minutes before the event; seeded from the default set when empty. */
  initial: number[];
  onSave: (minutes: number[]) => void;
  /** Clears every reminder and unstars the event. */
  onRemove: () => void;
  onClose: () => void;
}

const DAY_VALUES = Array.from({ length: 15 }, (_, i) => i);      // 0–14
const HOUR_VALUES = Array.from({ length: 24 }, (_, i) => i);     // 0–23

export default function EventReminderModal({
  visible, eventTitle, startDate, initial, onSave, onRemove, onClose,
}: Props) {
  const [list, setList] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [days, setDays] = useState(1);
  const [hours, setHours] = useState(0);

  // Re-seed each time it opens, so cancelling leaves nothing behind.
  useEffect(() => {
    if (!visible) return;
    setList([...initial].sort((a, b) => b - a));
    setAdding(false);
    setDays(1);
    setHours(0);
  }, [visible, initial]);

  const draft = days * 24 * 60 + hours * 60;
  const duplicate = list.includes(draft);
  const full = list.length >= MAX_REMINDERS_PER_EVENT;

  // A week's warning on an event two days out can never fire. Saying so beats
  // letting the user add it and quietly dropping it later.
  const msUntil = new Date(startDate).getTime() - Date.now();
  const tooLate = draft * 60_000 > msUntil;

  function add() {
    if (duplicate || full) return;
    setList((prev) => [...prev, draft].sort((a, b) => b - a));
    setAdding(false);
  }

  function removeAt(minutes: number) {
    setList((prev) => prev.filter((m) => m !== minutes));
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="תזכורות לאירוע">
      <Text style={styles.eventTitle} numberOfLines={2}>{eventTitle}</Text>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {list.length === 0 && !adding && (
          <Text style={styles.empty}>אין תזכורות. הוסיפו אחת למטה.</Text>
        )}

        {list.map((minutes) => {
          const passed = minutes * 60_000 > msUntil;
          return (
            <View key={minutes} style={styles.row}>
              <Ionicons
                name="notifications-outline"
                size={18}
                color={passed ? Colors.textMuted : Colors.primary}
              />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, passed && styles.rowLabelPassed]}>
                  {formatLead(minutes)}
                </Text>
                {passed && <Text style={styles.rowNote}>המועד כבר חלף — לא תישלח</Text>}
              </View>
              <TouchableOpacity onPress={() => removeAt(minutes)} hitSlop={10}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          );
        })}

        {adding && (
          <View style={styles.picker}>
            <View style={styles.drums}>
              <View style={styles.drumCol}>
                <Text style={styles.drumLabel}>ימים</Text>
                <DrumWheel values={DAY_VALUES} selected={days} onChange={setDays} />
              </View>
              <View style={styles.drumCol}>
                <Text style={styles.drumLabel}>שעות</Text>
                <DrumWheel values={HOUR_VALUES} selected={hours} onChange={setHours} />
              </View>
            </View>

            <Text style={styles.preview}>{formatLead(draft)}</Text>
            {duplicate && <Text style={styles.warn}>התזכורת הזאת כבר קיימת</Text>}
            {!duplicate && tooLate && (
              <Text style={styles.warn}>המועד הזה כבר חלף — התזכורת לא תישלח</Text>
            )}

            <View style={styles.pickerBtns}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setAdding(false)}>
                <Text style={styles.ghostBtnTxt}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, duplicate && styles.addBtnOff]}
                onPress={add}
                disabled={duplicate}
              >
                <Text style={styles.addBtnTxt}>הוסף</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!adding && (
          <TouchableOpacity
            style={[styles.addRow, full && styles.addRowOff]}
            onPress={() => setAdding(true)}
            disabled={full}
          >
            <Ionicons name="add" size={20} color={full ? Colors.textMuted : Colors.primary} />
            <Text style={[styles.addRowTxt, full && styles.addRowTxtOff]}>
              {full ? `מקסימום ${MAX_REMINDERS_PER_EVENT} תזכורות` : 'הוסף תזכורת'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
          <Ionicons name="trash-outline" size={17} color={Colors.danger} />
          <Text style={styles.removeBtnTxt}>הסר אירוע</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={() => onSave(list)}>
          <Text style={styles.saveBtnTxt}>שמור</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  eventTitle: {
    fontSize: 14, fontWeight: '600', color: Colors.textSecondary,
    textAlign: 'right', paddingHorizontal: Spacing.md, paddingBottom: 10,
  },
  list: { paddingHorizontal: Spacing.md, maxHeight: 340 },
  empty: {
    fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 22,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: Colors.text, textAlign: 'right' },
  rowLabelPassed: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  rowNote: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },

  addRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
  },
  addRowOff: { opacity: 0.6 },
  addRowTxt: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  addRowTxtOff: { color: Colors.textMuted },

  picker: { paddingVertical: 12, alignItems: 'center' },
  drums: { flexDirection: 'row', gap: 28, justifyContent: 'center' },
  drumCol: { alignItems: 'center', gap: 6 },
  drumLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  preview: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 12 },
  warn: { fontSize: 12, color: Colors.gold, marginTop: 6, textAlign: 'center' },
  pickerBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  ghostBtn: {
    paddingHorizontal: 20, paddingVertical: 9, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  ghostBtnTxt: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  addBtn: {
    paddingHorizontal: 24, paddingVertical: 9, borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  addBtnOff: { opacity: 0.45 },
  addBtnTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.md, paddingTop: 14, paddingBottom: 6,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  removeBtnTxt: { fontSize: 14, fontWeight: '600', color: Colors.danger },
  saveBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: Radius.full, backgroundColor: Colors.primary,
  },
  saveBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
