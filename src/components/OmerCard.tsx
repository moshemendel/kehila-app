import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppAlert as Alert } from './AppAlert';
import BottomSheetModal from './BottomSheetModal';
import TimePicker from './TimePicker';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import {
  omerCountTonight, omerCountLine, omerWeeksLine, omerLiturgy,
  loadOmerReminder, saveAndSyncOmerReminder, syncOmerReminders,
  loadOmerNusach, saveOmerNusach,
  OmerReminder, OmerNusach, DEFAULT_OMER_TIME,
} from '../utils/omer';

/**
 * Sefirat HaOmer, as a card of its own. Shown only on the evenings a count is
 * said, and says TONIGHT's count — the one a person is about to make. Tapping it
 * opens the text of the blessing and the count for the person's nusach, and the
 * reminder setting. Renders nothing the rest of the year.
 */
export default function OmerCard({ now }: { now: Date }) {
  const n = omerCountTonight(now);
  const [rem, setRem] = useState<OmerReminder>({ enabled: false, time: DEFAULT_OMER_TIME });
  const [nusach, setNusach] = useState<OmerNusach>('ashkenaz');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (n === null) return;
    let live = true;
    Promise.all([loadOmerReminder(), loadOmerNusach()]).then(([r, nu]) => {
      if (!live) return;
      setRem(r);
      setNusach(nu);
      // Rolls the ten-night window forward each time the card is seen.
      if (r.enabled) syncOmerReminders(r);
    });
    return () => { live = false; };
  }, [n === null]);

  if (n === null) return null;

  async function applyReminder(next: OmerReminder) {
    setRem(next);
    const ok = await saveAndSyncOmerReminder(next);
    if (!ok && next.enabled) {
      const off = { ...next, enabled: false };
      setRem(off);
      await saveAndSyncOmerReminder(off);
      Alert.alert('אין הרשאה להתראות', 'כדי לקבל תזכורת יש לאפשר התראות לאפליקציה בהגדרות המכשיר.');
    }
  }

  function pickNusach(v: OmerNusach) {
    setNusach(v);
    saveOmerNusach(v);
  }

  const weeks = omerWeeksLine(n);
  const sections = omerLiturgy(n, nusach);

  return (
    <>
      <TouchableOpacity style={st.card} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <View style={st.left}><Text style={st.emoji}>🌾</Text></View>
        <View style={st.body}>
          <Text style={st.heading}>ספירת העומר · הערב</Text>
          <Text style={st.count}>{omerCountLine(n)}</Text>
          {!!weeks && <Text style={st.weeks}>{weeks}</Text>}
          <View style={st.hintRow}>
            <Ionicons
              name={rem.enabled ? 'notifications' : 'notifications-outline'}
              size={13}
              color={rem.enabled ? Colors.gold : Colors.textMuted}
            />
            <Text style={st.hint}>
              {rem.enabled ? `תזכורת ב-${rem.time} · נוסח הברכה` : 'נוסח הברכה ותזכורת'}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-back" size={18} color={Colors.gold} style={{ marginLeft: 12 }} />
      </TouchableOpacity>

      <BottomSheetModal visible={open} onClose={() => setOpen(false)} title="ספירת העומר" sheetStyle={st.sheet}>
        <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
          <Text style={st.sheetCount}>הערב · {omerCountLine(n)}</Text>
          {!!weeks && <Text style={st.sheetWeeks}>{weeks}</Text>}
          <Text style={st.note}>הספירה נאמרת בעמידה, לאחר צאת הכוכבים.</Text>

          <View style={st.nusachRow}>
            {([['ashkenaz', 'אשכנזים'], ['sepharad', 'ספרדים']] as [OmerNusach, string][]).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[st.nusachChip, nusach === k && st.nusachChipOn]}
                onPress={() => pickNusach(k)}
              >
                <Text style={[st.nusachTxt, nusach === k && st.nusachTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {sections.map((s) => (
            <View key={s.title} style={st.section}>
              <Text style={st.sectionTitle}>{s.title}</Text>
              <Text style={st.liturgy}>{s.text}</Text>
            </View>
          ))}

          <View style={st.remBox}>
            <Text style={st.sectionTitle}>תזכורת</Text>
            <View style={st.remRow}>
              <TouchableOpacity
                style={[st.remBtn, rem.enabled && st.remBtnOn]}
                onPress={() => applyReminder({ ...rem, enabled: !rem.enabled })}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={rem.enabled ? 'notifications' : 'notifications-outline'}
                  size={15}
                  color={rem.enabled ? Colors.white : Colors.gold}
                />
                <Text style={[st.remTxt, rem.enabled && st.remTxtOn]}>
                  {rem.enabled ? 'תזכורת פעילה' : 'הזכר לי כל ערב'}
                </Text>
              </TouchableOpacity>
              {/* The time is always editable: picking one before switching the
                  reminder on is how most people will first meet this. */}
              <TimePicker
                compact
                value={rem.time}
                onChange={(time) => applyReminder({ ...rem, time, enabled: true })}
              />
            </View>
          </View>
        </ScrollView>
      </BottomSheetModal>
    </>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gold + '50',
    ...Shadow.card,
  },
  left:    { width: 68, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold + '18' },
  emoji:   { fontSize: 28 },
  body:    { flex: 1, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  heading: { fontSize: 13, color: Colors.textSecondary, fontWeight: '700', marginBottom: 6 },
  count:   { fontSize: 20, color: Colors.gold, fontWeight: '800', textAlign: 'center' },
  weeks:   { fontSize: 13, color: Colors.textSecondary, marginTop: 3, textAlign: 'center' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  hint:    { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  sheet:        { paddingHorizontal: Spacing.lg, paddingBottom: 36 },
  sheetCount:   { fontSize: 20, fontWeight: '800', color: Colors.gold, textAlign: 'center' },
  sheetWeeks:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 3 },
  note:         { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: Spacing.md },
  nusachRow:    { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  nusachChip:   { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border },
  nusachChipOn: { borderColor: Colors.gold, backgroundColor: Colors.gold + '18' },
  nusachTxt:    { fontSize: 13.5, fontWeight: '600', color: Colors.textSecondary },
  nusachTxtOn:  { color: Colors.gold, fontWeight: '800' },
  section:      { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, marginBottom: 4, textAlign: 'right' },
  liturgy:      { fontSize: 19, lineHeight: 32, color: Colors.text, textAlign: 'right', writingDirection: 'rtl' },
  remBox:       { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md, marginTop: Spacing.sm },
  remRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  remBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Colors.gold + '80', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  remBtnOn:     { backgroundColor: Colors.gold, borderColor: Colors.gold },
  remTxt:       { fontSize: 12.5, fontWeight: '700', color: Colors.gold },
  remTxtOn:     { color: Colors.white },
});
