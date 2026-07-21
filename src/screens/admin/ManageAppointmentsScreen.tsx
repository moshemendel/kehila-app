import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { AppointmentConfig, DayKey, HoursBlock, MikvehAppointment } from '../../types';
import { getMikveh, updateMikveh } from '../../services/mikvaot';
import { getAppointmentsForDay, managerCancelAppointment } from '../../services/appointments';
import { useAuth } from '../../context/AuthContext';
import {
  formatDateHeLong, todayString, addDays, addMinutesToTime, hoursTextForDay,
} from '../../utils/appointmentSlots';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_HE:   string[] = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

const DEFAULT_CONFIG: AppointmentConfig = {
  slotDurationMin: 20,
  parallelTracks: 1,
  prepMultiplier: 2,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ManageAppointmentsScreen() {
  const route            = useRoute<any>();
  const navigation       = useNavigation<any>();
  const { bottom }       = useSafeAreaInsets();
  const { firebaseUser, isDemo } = useAuth();
  const { mikvehId, mikvehName } = route.params as { mikvehId: string; mikvehName: string };

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'appointments' | 'settings'>('appointments');

  // ── Settings state ────────────────────────────────────────────────────────
  const [config,        setConfig]        = useState<AppointmentConfig>(DEFAULT_CONFIG);
  const [hoursSchedule, setHoursSchedule]  = useState<HoursBlock[]>([]);
  const [configLoaded,  setConfigLoaded]   = useState(false);
  const [saving,        setSaving]         = useState(false);

  // ── Appointments state ────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [dayAppts,     setDayAppts]     = useState<MikvehAppointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);

  // ── Load mikveh config + hours (hours are edited on the mikveh screen; here
  //    they're read-only reference for the settings tab) ─────────────────────
  useEffect(() => {
    getMikveh(mikvehId).then((m) => {
      // Merge over defaults rather than replacing outright — a doc saved
      // before parallelTracks/prepMultiplier existed would otherwise load
      // those as undefined, and the steppers would compute NaN on the first tap.
      if (m?.appointmentConfig) setConfig({ ...DEFAULT_CONFIG, ...m.appointmentConfig });
      setHoursSchedule(m?.hoursSchedule ?? []);
      setConfigLoaded(true);
    });
  }, [mikvehId]);

  // ── Load appointments for selected date ───────────────────────────────────
  useEffect(() => {
    setLoadingAppts(true);
    getAppointmentsForDay(mikvehId, selectedDate).then((appts) => {
      setDayAppts(appts);
      setLoadingAppts(false);
    }).catch(() => setLoadingAppts(false));
  }, [selectedDate, mikvehId]);

  const prepCount = dayAppts.filter((a) => (a.slotsCount ?? 1) > 1).length;

  // ── Save settings ─────────────────────────────────────────────────────────
  async function handleSave() {
    // Must be signed in with a real Firebase account to write to Firestore
    if (!firebaseUser) {
      Alert.alert(
        'נדרשת התחברות',
        isDemo
          ? 'במצב הדגמה לא ניתן לשמור שינויים. התחבר עם חשבון אמיתי כדי לשמור.'
          : 'יש להתחבר לחשבון כדי לשמור.',
      );
      return;
    }
    setSaving(true);
    try {
      await updateMikveh(mikvehId, { appointmentConfig: config });
      Alert.alert('✓ נשמר', 'הגדרות התורים עודכנו');
    } catch (e: any) {
      // Firestore security-rules error → guide the user
      const msg = (e?.message ?? '') as string;
      if (msg.includes('permission') || msg.includes('insufficient')) {
        Alert.alert(
          'אין הרשאה',
          'לא ניתן לשמור — יש לעדכן את כללי האבטחה של Firestore בקונסול Firebase.\n\nפרטים בהמשך.',
        );
      } else {
        Alert.alert('שגיאה', msg);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Cancel from manager ───────────────────────────────────────────────────
  function handleManagerCancel(appt: MikvehAppointment) {
    Alert.alert(
      'ביטול תור',
      `לבטל את התור בשעה ${appt.time}?`,
      [
        { text: 'חזור', style: 'cancel' },
        {
          text: 'בטל תור', style: 'destructive',
          onPress: async () => {
            try {
              await managerCancelAppointment(mikvehId, appt.id);
              setDayAppts((prev) => prev.filter((a) => a.id !== appt.id));
            } catch (e: any) {
              Alert.alert('שגיאה', e.message);
            }
          },
        },
      ]
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        <Text style={s.tabBarTitle} numberOfLines={1}>{mikvehName}</Text>
        <View style={s.tabRow}>
          {(['appointments', 'settings'] as const).map((t) => {
            const active = tab === t;
            const label  = t === 'appointments' ? 'תורים' : 'הגדרות';
            const icon   = t === 'appointments' ? 'calendar-outline' : 'settings-outline';
            return (
              <TouchableOpacity
                key={t}
                style={[s.tab, active && s.tabActive]}
                onPress={() => setTab(t)}
              >
                <Ionicons
                  name={icon as any}
                  size={15}
                  color={active ? Colors.mikveh : Colors.textMuted}
                />
                <Text style={[s.tabTxt, active && s.tabTxtActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ════════════════ APPOINTMENTS TAB ════════════════════════════════ */}
      {tab === 'appointments' && (
        <View style={{ flex: 1 }}>

          {/* Date nav bar */}
          <View style={s.dateNav}>
            <TouchableOpacity
              style={s.dateNavArrow}
              onPress={() => setSelectedDate((d) => addDays(d, -1))}
            >
              <Ionicons name="chevron-forward" size={22} color={Colors.mikveh} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.dateNavCenter}
              onPress={() => setSelectedDate(todayString())}
            >
              <Text style={s.dateNavTxt}>{formatDateHeLong(selectedDate)}</Text>
              {selectedDate === todayString() && (
                <View style={s.todayBadge}><Text style={s.todayBadgeTxt}>היום</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.dateNavArrow}
              onPress={() => setSelectedDate((d) => addDays(d, 1))}
            >
              <Ionicons name="chevron-back" size={22} color={Colors.mikveh} />
            </TouchableOpacity>
          </View>

          {/* Stats bar — just counts, no "capacity" numbers (that's an admin-only concept) */}
          {dayAppts.length > 0 && (
            <View style={s.statsBar}>
              <View style={s.statItem}>
                <View style={[s.statDot, { backgroundColor: Colors.mikveh }]} />
                <Text style={s.statTxt}>{dayAppts.length} תורים</Text>
              </View>
              {prepCount > 0 && (
                <>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <View style={[s.statDot, { backgroundColor: Colors.success }]} />
                    <Text style={s.statTxt}>{prepCount} הכנה</Text>
                  </View>
                </>
              )}
            </View>
          )}

          {loadingAppts ? (
            <ActivityIndicator color={Colors.mikveh} style={{ marginTop: 50 }} size="large" />
          ) : dayAppts.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>אין תורים ביום זה</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 32 }}>
              {dayAppts.map((appt) => {
                const isPrep  = (appt.slotsCount ?? 1) > 1;
                const endTime = isPrep ? addMinutesToTime(appt.time, (appt.slotsCount ?? 1) * config.slotDurationMin) : null;
                return (
                  <TouchableOpacity
                    key={appt.id}
                    style={s.apptRow}
                    onPress={() => handleManagerCancel(appt)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.apptDot, { backgroundColor: Colors.mikveh }]} />
                    <Text style={s.apptTime}>{appt.time}{endTime ? ` – ${endTime}` : ''}</Text>
                    <View style={[s.apptBadge, isPrep ? s.apptBadgePrep : s.apptBadgeQuick]}>
                      <Text style={[s.apptBadgeTxt, isPrep ? s.apptBadgeTxtPrep : s.apptBadgeTxtQuick]}>
                        {isPrep ? 'הכנה' : 'טבילה בלבד'}
                      </Text>
                    </View>
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ════════════════ SETTINGS TAB ════════════════════════════════════ */}
      {tab === 'settings' && (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 80 }}>
          {!configLoaded ? (
            <ActivityIndicator color={Colors.mikveh} style={{ marginTop: 40 }} size="large" />
          ) : (
            <>
              {/* ── Opening hours (read-only — edited on the mikveh screen) ── */}
              <View style={s.settSection}>
                <View style={s.settSectionHeader}>
                  <Text style={s.settSectionTitle}>שעות פתיחה</Text>
                  <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={s.settSectionLink}>לעריכה — חזרה למסך המקווה</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.settCard}>
                  {DAY_KEYS.map((day, i) => (
                    <View key={day} style={[s.hoursSummaryRow, i < DAY_KEYS.length - 1 && s.dayRowBorder]}>
                      <Text style={s.hoursSummaryDay}>{DAY_HE[i]}</Text>
                      <Text style={s.hoursSummaryTxt}>{hoursTextForDay(hoursSchedule, day)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ── Slot duration (stepper) ── */}
              <View style={s.settSection}>
                <Text style={s.settSectionTitle}>משך כל תור</Text>
                <View style={s.settCard}>
                  <View style={s.stepperRow}>
                    <TouchableOpacity
                      style={[s.stepperBtn, config.slotDurationMin <= 5 && s.stepperBtnOff]}
                      onPress={() => setConfig((c) => ({ ...c, slotDurationMin: Math.max(5, c.slotDurationMin - 5) }))}
                      disabled={config.slotDurationMin <= 5}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="remove" size={28} color={config.slotDurationMin <= 5 ? Colors.textMuted : Colors.mikveh} />
                    </TouchableOpacity>

                    <View style={s.stepperValue}>
                      <Text style={s.stepperNum}>{config.slotDurationMin}</Text>
                      <Text style={s.stepperUnit}>דקות לתור</Text>
                    </View>

                    <TouchableOpacity
                      style={[s.stepperBtn, config.slotDurationMin >= 90 && s.stepperBtnOff]}
                      onPress={() => setConfig((c) => ({ ...c, slotDurationMin: Math.min(90, c.slotDurationMin + 5) }))}
                      disabled={config.slotDurationMin >= 90}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={28} color={config.slotDurationMin >= 90 ? Colors.textMuted : Colors.mikveh} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* ── Parallel tracks / prep rooms (stepper) ── */}
              <View style={s.settSection}>
                <Text style={s.settSectionTitle}>מספר חדרי הכנה</Text>
                <View style={s.settCard}>
                  <View style={s.stepperRow}>
                    <TouchableOpacity
                      style={[s.stepperBtn, config.parallelTracks <= 1 && s.stepperBtnOff]}
                      onPress={() => setConfig((c) => ({ ...c, parallelTracks: Math.max(1, c.parallelTracks - 1) }))}
                      disabled={config.parallelTracks <= 1}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="remove" size={28} color={config.parallelTracks <= 1 ? Colors.textMuted : Colors.mikveh} />
                    </TouchableOpacity>

                    <View style={s.stepperValue}>
                      <Text style={s.stepperNum}>{config.parallelTracks}</Text>
                      <Text style={s.stepperUnit}>{config.parallelTracks === 1 ? 'חדר הכנה' : 'חדרי הכנה'}</Text>
                    </View>

                    <TouchableOpacity
                      style={[s.stepperBtn, config.parallelTracks >= 6 && s.stepperBtnOff]}
                      onPress={() => setConfig((c) => ({ ...c, parallelTracks: Math.min(6, c.parallelTracks + 1) }))}
                      disabled={config.parallelTracks >= 6}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={28} color={config.parallelTracks >= 6 ? Colors.textMuted : Colors.mikveh} />
                    </TouchableOpacity>
                  </View>
                  <Text style={s.settHint}>כמה נשים יכולות להתכונן במקביל (הבלנית מפקחת ברצף על הטבילות עצמן)</Text>
                </View>
              </View>

              {/* ── Prep multiplier (segmented) ── */}
              <View style={s.settSection}>
                <Text style={s.settSectionTitle}>מכפיל זמן הכנה</Text>
                <View style={s.settCard}>
                  <View style={s.multiplierRow}>
                    {[2, 3].map((n) => {
                      const active = config.prepMultiplier === n;
                      return (
                        <TouchableOpacity
                          key={n}
                          style={[s.multiplierBtn, active && s.multiplierBtnActive]}
                          onPress={() => setConfig((c) => ({ ...c, prepMultiplier: n }))}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.multiplierBtnTxt, active && s.multiplierBtnTxtActive]}>
                            {n}× ({n * config.slotDurationMin} דק')
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={s.settHint}>משך תור "הכנה במקווה" ביחס לתור "טבילה בלבד"</Text>
                </View>
              </View>

              {/* ── Save button ── */}
              <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={Colors.white} />
                  : (
                    <>
                      <Ionicons name="save-outline" size={20} color={Colors.white} />
                      <Text style={s.saveBtnTxt}>שמור הגדרות</Text>
                    </>
                  )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Tab bar
  tabBar: {
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 0,
  },
  tabBarTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  tabRow:      { flexDirection: 'row', gap: Spacing.sm },
  tab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:   { borderBottomColor: Colors.mikveh },
  tabTxt:      { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  tabTxtActive:{ color: Colors.mikveh },

  // Date nav
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
  },
  dateNavArrow:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dateNavCenter: { flex: 1, alignItems: 'center', gap: 4 },
  dateNavTxt:    { fontSize: 15, fontWeight: '700', color: Colors.text },
  todayBadge:    { backgroundColor: Colors.mikveh + '18', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 2 },
  todayBadgeTxt: { fontSize: 11, fontWeight: '700', color: Colors.mikveh },

  // Stats bar
  statsBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               Spacing.lg,
    backgroundColor:   Colors.cardBackground,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  statItem:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot:     { width: 9, height: 9, borderRadius: 5 },
  statTxt:     { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  statDivider: { width: 1, height: 18, backgroundColor: Colors.border },

  // Empty state
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },

  // Appointment rows
  apptRow: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   Colors.cardBackground,
    borderRadius:      Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical:   13,
    marginBottom:      Spacing.sm,
    borderLeftWidth:   3, borderLeftColor: Colors.mikveh,
    ...Shadow.card,
    gap: 10,
  },
  apptDot:  { width: 10, height: 10, borderRadius: 5 },
  apptTime: { fontSize: 18, fontWeight: '800', color: Colors.text, flex: 1 },
  apptBadge: {
    borderRadius:      Radius.full,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderWidth:       1,
    borderColor:       Colors.border,
    backgroundColor:   Colors.background,
  },
  apptBadgeQuick:    { backgroundColor: Colors.mikveh + '15', borderColor: Colors.mikveh + '50' },
  apptBadgePrep:     { backgroundColor: Colors.success + '12', borderColor: Colors.success + '40' },
  apptBadgeTxt:      { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  apptBadgeTxtQuick: { color: Colors.mikveh },
  apptBadgeTxtPrep:  { color: Colors.success },

  // Settings
  settSection:       { marginBottom: Spacing.lg },
  settSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  settSectionTitle:  { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  settSectionLink:   { fontSize: 12, color: Colors.mikveh, fontWeight: '600' },
  settCard:          { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.card },
  settHint:          { fontSize: 11, color: Colors.textMuted, marginTop: 8, textAlign: 'center' },

  // Read-only opening-hours summary
  hoursSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 },
  dayRowBorder:    { borderBottomWidth: 1, borderBottomColor: Colors.border },
  hoursSummaryDay: { fontSize: 14, fontWeight: '700', color: Colors.text },
  hoursSummaryTxt: { fontSize: 13, color: Colors.textSecondary },

  // Duration/capacity steppers:  [−]  20 / דקות לתור  [+]
  stepperRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: Spacing.sm },
  stepperBtn:    { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: Colors.mikveh, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.mikveh + '0D' },
  stepperBtnOff: { borderColor: Colors.border, backgroundColor: Colors.background },
  stepperValue:  { alignItems: 'center', minWidth: 90 },
  stepperNum:    { fontSize: 40, fontWeight: '800', color: Colors.mikveh, lineHeight: 46 },
  stepperUnit:   { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  // Prep multiplier segmented control
  multiplierRow: { flexDirection: 'row', gap: 8 },
  multiplierBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  multiplierBtnActive:  { backgroundColor: Colors.mikveh, borderColor: Colors.mikveh },
  multiplierBtnTxt:     { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  multiplierBtnTxtActive: { color: Colors.white },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.mikveh,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginTop: Spacing.sm,
  },
  saveBtnTxt: { fontSize: 16, fontWeight: '800', color: Colors.white },
});
