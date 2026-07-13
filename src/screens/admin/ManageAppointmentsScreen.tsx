import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { AppointmentConfig, DayKey, DaySlotConfig } from '../../types';
import { getMikveh, updateMikveh } from '../../services/mikvaot';
import { getAppointmentsForDay, managerCancelAppointment } from '../../services/appointments';
import { useAuth } from '../../context/AuthContext';
import {
  generateSlots, dayKeyFromDate, formatDateHeLong,
  todayString, addDays, isSlotInPast,
} from '../../utils/appointmentSlots';
import TimePicker from '../../components/TimePicker';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[]     = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_HE:   string[]     = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];


const DEFAULT_CONFIG: AppointmentConfig = {
  slotDurationMin: 20,
  schedule: {
    sunday:    { enabled: true,  start: '18:00', end: '22:00' },
    monday:    { enabled: true,  start: '18:00', end: '22:00' },
    tuesday:   { enabled: true,  start: '18:00', end: '22:00' },
    wednesday: { enabled: true,  start: '18:00', end: '22:00' },
    thursday:  { enabled: true,  start: '18:00', end: '22:00' },
    friday:    { enabled: false, start: '14:00', end: '17:00' },
    saturday:  { enabled: false, start: '20:00', end: '23:00' },
  },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ManageAppointmentsScreen() {
  const route            = useRoute<any>();
  const { bottom }       = useSafeAreaInsets();
  const { firebaseUser, isDemo } = useAuth();
  const { mikvehId, mikvehName } = route.params as { mikvehId: string; mikvehName: string };

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'appointments' | 'settings'>('appointments');

  // ── Settings state ────────────────────────────────────────────────────────
  const [config,       setConfig]      = useState<AppointmentConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving,       setSaving]       = useState(false);

  // ── Appointments state ────────────────────────────────────────────────────
  const [selectedDate,  setSelectedDate]  = useState(todayString());
  const [bookedTimes,   setBookedTimes]   = useState<string[]>([]);
  const [apptIds,       setApptIds]       = useState<Record<string, string>>({});  // time → appointmentId
  const [loadingAppts,  setLoadingAppts]  = useState(false);

  // ── Load mikveh config ────────────────────────────────────────────────────
  useEffect(() => {
    getMikveh(mikvehId).then((m) => {
      if (m?.appointmentConfig) setConfig(m.appointmentConfig);
      setConfigLoaded(true);
    });
  }, [mikvehId]);

  // ── Load appointments for selected date ───────────────────────────────────
  useEffect(() => {
    setLoadingAppts(true);
    getAppointmentsForDay(mikvehId, selectedDate).then((appts) => {
      setBookedTimes(appts.map((a) => a.time));
      const ids: Record<string, string> = {};
      appts.forEach((a) => { ids[a.time] = a.id; });
      setApptIds(ids);
      setLoadingAppts(false);
    }).catch(() => setLoadingAppts(false));
  }, [selectedDate, mikvehId]);

  // ── Derive slots for selected date ────────────────────────────────────────
  const slots = useMemo(() => {
    const dc = config.schedule[dayKeyFromDate(selectedDate)];
    if (!dc?.enabled) return [];
    return generateSlots(dc.start, dc.end, config.slotDurationMin);
  }, [config, selectedDate]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const bookedCount = bookedTimes.length;
  const pastCount   = slots.filter((t) => isSlotInPast(selectedDate, t)).length;
  const freeCount   = slots.filter((t) => !bookedTimes.includes(t) && !isSlotInPast(selectedDate, t)).length;

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

    // Validate all enabled days have parseable times
    for (const [key, dc] of Object.entries(config.schedule)) {
      if (!dc?.enabled) continue;
      const slots = generateSlots(dc.start, dc.end, config.slotDurationMin);
      if (slots.length === 0) {
        Alert.alert('שגיאה בהגדרות', `שעות יום ${DAY_HE[DAY_KEYS.indexOf(key as DayKey)]} אינן תקינות`);
        return;
      }
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

  // ── Update a single day's config ──────────────────────────────────────────
  function setDayField(day: DayKey, field: keyof DaySlotConfig, value: any) {
    setConfig((c) => ({
      ...c,
      schedule: {
        ...c.schedule,
        [day]: {
          enabled: c.schedule[day]?.enabled ?? false,
          start:   c.schedule[day]?.start   ?? '18:00',
          end:     c.schedule[day]?.end     ?? '22:00',
          [field]: value,
        },
      },
    }));
  }

  // ── Cancel from manager ───────────────────────────────────────────────────
  function handleManagerCancel(time: string) {
    const id = apptIds[time];
    if (!id) return;
    Alert.alert(
      'ביטול תור',
      `לבטל את התור בשעה ${time}?`,
      [
        { text: 'חזור', style: 'cancel' },
        {
          text: 'בטל תור', style: 'destructive',
          onPress: async () => {
            try {
              await managerCancelAppointment(mikvehId, id);
              const newTimes = bookedTimes.filter((t) => t !== time);
              const newIds   = { ...apptIds };
              delete newIds[time];
              setBookedTimes(newTimes);
              setApptIds(newIds);
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

          {/* Stats bar */}
          {slots.length > 0 && (
            <View style={s.statsBar}>
              <View style={s.statItem}>
                <View style={[s.statDot, { backgroundColor: Colors.mikveh }]} />
                <Text style={s.statTxt}>{bookedCount} קבועים</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <View style={[s.statDot, { backgroundColor: Colors.success }]} />
                <Text style={s.statTxt}>{freeCount} פנויים</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <View style={[s.statDot, { backgroundColor: Colors.border }]} />
                <Text style={s.statTxt}>{slots.length} סה"כ</Text>
              </View>
            </View>
          )}

          {loadingAppts ? (
            <ActivityIndicator color={Colors.mikveh} style={{ marginTop: 50 }} size="large" />
          ) : slots.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>אין תורים ביום זה</Text>
              <TouchableOpacity onPress={() => setTab('settings')}>
                <Text style={s.emptyLink}>הגדר לוח זמנים →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 32 }}>
              {slots.map((time) => {
                const booked = bookedTimes.includes(time);
                const past   = isSlotInPast(selectedDate, time);
                return (
                  <TouchableOpacity
                    key={time}
                    style={[
                      s.apptRow,
                      booked && s.apptRowBooked,
                      past   && s.apptRowPast,
                    ]}
                    onPress={() => booked && handleManagerCancel(time)}
                    activeOpacity={booked ? 0.75 : 1}
                  >
                    <View style={[
                      s.apptDot,
                      { backgroundColor: booked ? Colors.mikveh : past ? Colors.border : Colors.success },
                    ]} />

                    <Text style={[s.apptTime, past && s.apptTimePast]}>{time}</Text>

                    <View style={[
                      s.apptBadge,
                      booked && s.apptBadgeBooked,
                      (!booked && !past) && s.apptBadgeFree,
                      past && s.apptBadgePast,
                    ]}>
                      <Text style={[
                        s.apptBadgeTxt,
                        booked && s.apptBadgeTxtBooked,
                        (!booked && !past) && s.apptBadgeTxtFree,
                      ]}>
                        {booked ? 'נקבע' : past ? 'עבר' : 'פנוי'}
                      </Text>
                    </View>

                    {booked && (
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} style={{ marginLeft: 8 }} />
                    )}
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

              {/* ── Weekly schedule ── */}
              <View style={s.settSection}>
                <Text style={s.settSectionTitle}>לוח זמנים שבועי</Text>
                <View style={s.settCard}>
                  {DAY_KEYS.map((day, i) => {
                    const dc    = config.schedule[day] ?? { enabled: false, start: '18:00', end: '22:00' };
                    const count = dc.enabled
                      ? generateSlots(dc.start, dc.end, config.slotDurationMin).length
                      : 0;
                    const isLast = i === DAY_KEYS.length - 1;
                    return (
                      <View key={day} style={[s.dayRow, !isLast && s.dayRowBorder]}>
                        {/* Line 1: toggle + day name + count/closed */}
                        <TouchableOpacity
                          style={s.dayHeader}
                          onPress={() => setDayField(day, 'enabled', !dc.enabled)}
                          activeOpacity={0.7}
                        >
                          <View style={[s.toggle, dc.enabled && s.toggleOn]}>
                            <View style={[s.toggleThumb, dc.enabled && s.toggleThumbOn]} />
                          </View>
                          <Text style={[s.dayName, !dc.enabled && s.dayNameOff]}>
                            {DAY_HE[i]}
                          </Text>
                          <View style={{ flex: 1 }} />
                          {dc.enabled ? (
                            count > 0 && (
                              <View style={s.countPill}>
                                <Text style={s.countPillTxt}>{count} תורים</Text>
                              </View>
                            )
                          ) : (
                            <Text style={s.dayOffTxt}>סגור</Text>
                          )}
                        </TouchableOpacity>

                        {/* Line 2: full-width time range */}
                        {dc.enabled && (
                          <View style={s.timeRange}>
                            <View style={s.timeField}>
                              <Text style={s.timeFieldLabel}>פתיחה</Text>
                              <TimePicker
                                compact
                                value={dc.start}
                                onChange={(v) => setDayField(day, 'start', v)}
                              />
                            </View>
                            <Text style={s.timeDash}>—</Text>
                            <View style={s.timeField}>
                              <Text style={s.timeFieldLabel}>סגירה</Text>
                              <TimePicker
                                compact
                                value={dc.end}
                                onChange={(v) => setDayField(day, 'end', v)}
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
                <Text style={s.scheduleHint}>
                  * שינויים בלוח הזמנים ישפיעו על תורים עתידיים בלבד.
                </Text>
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
    justifyContent:    'space-around',
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
  emptyLink:  { fontSize: 14, color: Colors.mikveh, fontWeight: '700', marginTop: 4 },

  // Appointment rows
  apptRow: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   Colors.cardBackground,
    borderRadius:      Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical:   13,
    marginBottom:      Spacing.sm,
    ...Shadow.card,
    gap: 10,
  },
  apptRowBooked: { borderLeftWidth: 3, borderLeftColor: Colors.mikveh },
  apptRowPast:   { opacity: 0.55 },
  apptDot:       { width: 10, height: 10, borderRadius: 5 },
  apptTime:      { fontSize: 18, fontWeight: '800', color: Colors.text, flex: 1 },
  apptTimePast:  { color: Colors.textMuted },
  apptBadge: {
    borderRadius:      Radius.full,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderWidth:       1,
    borderColor:       Colors.border,
    backgroundColor:   Colors.background,
  },
  apptBadgeBooked:    { backgroundColor: Colors.mikveh + '15', borderColor: Colors.mikveh + '50' },
  apptBadgeFree:      { backgroundColor: Colors.success + '12', borderColor: Colors.success + '40' },
  apptBadgePast:      { backgroundColor: Colors.background },
  apptBadgeTxt:       { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  apptBadgeTxtBooked: { color: Colors.mikveh },
  apptBadgeTxtFree:   { color: Colors.success },

  // Settings
  settSection:      { marginBottom: Spacing.lg },
  settSectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  settCard:         { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.card },

  // Duration stepper:  [−]  20 / דקות לתור  [+]
  stepperRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: Spacing.sm },
  stepperBtn:    { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: Colors.mikveh, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.mikveh + '0D' },
  stepperBtnOff: { borderColor: Colors.border, backgroundColor: Colors.background },
  stepperValue:  { alignItems: 'center', minWidth: 90 },
  stepperNum:    { fontSize: 40, fontWeight: '800', color: Colors.mikveh, lineHeight: 46 },
  stepperUnit:   { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  // Day rows — two-line layout (header row + full-width time range row)
  dayRow:       { paddingVertical: 12 },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle:       { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.border, justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn:     { backgroundColor: Colors.mikveh },
  toggleThumb:  { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.white },
  toggleThumbOn:{ alignSelf: 'flex-end' },
  dayName:      { fontSize: 16, fontWeight: '700', color: Colors.text },
  dayNameOff:   { color: Colors.textMuted, fontWeight: '600' },
  dayOffTxt:    { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  countPill:    { backgroundColor: Colors.mikveh + '18', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  countPillTxt: { fontSize: 12, fontWeight: '700', color: Colors.mikveh },

  // Time range lives on its own full-width line → inputs are large and never clip
  timeRange:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 14, marginTop: 12 },
  timeField:      { flex: 1, maxWidth: 150, alignItems: 'center', gap: 4 },
  timeFieldLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  timeInput: {
    alignSelf: 'stretch', height: 44,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md,
    fontSize: 18, fontWeight: '700', color: Colors.text,
    backgroundColor: Colors.background,
    textAlign: 'center', writingDirection: 'ltr',
  },
  timeDash:  { fontSize: 18, color: Colors.textMuted, flexShrink: 0, marginBottom: 11 },

  scheduleHint: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.mikveh,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginTop: Spacing.sm,
  },
  saveBtnTxt: { fontSize: 16, fontWeight: '800', color: Colors.white },
});
