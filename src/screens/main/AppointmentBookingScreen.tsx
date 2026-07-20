import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, ScrollView, Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { getMikveh } from '../../services/mikvaot';
import {
  getSlotInfo, getUserUpcomingAppointments,
  bookAppointment, cancelAppointment,
} from '../../services/appointments';
import {
  generateSlots, dayKeyFromDate,
  formatDateHeLong, formatDateHeShort,
  todayString, isSlotInPast, addMinutesToTime,
} from '../../utils/appointmentSlots';
import { Mikveh, MikvehAppointment } from '../../types';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

// ─── Layout ───────────────────────────────────────────────────────────────────

const SW       = Dimensions.get('window').width;
const SLOT_GAP = 8;
const SLOT_W   = Math.floor((SW - 32 - SLOT_GAP * 2) / 3);
const SLOT_H   = 72;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AppointmentBookingScreen() {
  const route              = useRoute<any>();
  const navigation         = useNavigation<any>();
  const { mikvehId }       = route.params as { mikvehId: string };
  const { bottom }         = useSafeAreaInsets();
  const { firebaseUser, appUser, isDemo, isGuest } = useAuth();

  const userId = firebaseUser?.uid ?? (isDemo ? appUser?.uid : null);
  const today  = todayString();

  // ── State ──────────────────────────────────────────────────────────────────
  const [mikveh,       setMikveh]       = useState<Mikveh | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [bookedTimes,  setBookedTimes]  = useState<string[]>([]);
  const [userDateAppt, setUserDateAppt] = useState<MikvehAppointment | null>(null);
  const [upcoming,     setUpcoming]     = useState<MikvehAppointment[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [mode,         setMode]         = useState<'single' | 'double'>('single');
  const [confirmSlot,  setConfirmSlot]  = useState<{ time: string; end: string; slotsCount: number } | null>(null);
  const [booking,      setBooking]      = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MikvehAppointment | null>(null);
  const [cancelling,   setCancelling]   = useState(false);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = userId ?? 'anon';

    // Mikveh config is critical — load and show it even if the appointment
    // queries fail (e.g. Firestore rules block the appointments subcollection).
    getMikveh(mikvehId)
      .then((m) => setMikveh(m))
      .catch((e) => console.warn('[booking] getMikveh failed:', e?.message))
      .finally(() => setLoading(false));

    // Upcoming appointments are best-effort — never block the screen.
    getUserUpcomingAppointments(mikvehId, uid)
      .then(setUpcoming)
      .catch((e) => console.warn('[booking] upcoming failed:', e?.message));
  }, [mikvehId]);

  const slotDur = mikveh?.appointmentConfig?.slotDurationMin ?? 20;

  // ── Load today's booked slots ─────────────────────────────────────────────
  useEffect(() => {
    if (!mikveh?.appointmentConfig) return;
    setSlotsLoading(true);
    const uid = userId ?? 'anon';
    getSlotInfo(mikvehId, today, uid, slotDur).then(({ bookedTimes: bt, userAppt }) => {
      setBookedTimes(bt);
      setUserDateAppt(userAppt);
      setSlotsLoading(false);
    }).catch(() => setSlotsLoading(false));
  }, [mikveh?.appointmentConfig]);

  // ── Derive slots for today ────────────────────────────────────────────────
  const slots = useMemo(() => {
    if (!mikveh?.appointmentConfig) return [];
    const cfg = mikveh.appointmentConfig;
    const dc  = cfg.schedule[dayKeyFromDate(today)];
    if (!dc?.enabled) return [];
    return generateSlots(dc.start, dc.end, cfg.slotDurationMin);
  }, [mikveh?.appointmentConfig]);

  // Times occupied by the user's own booking today (both halves, if it's a
  // double/"tailing" booking — a double booking's second half isn't its own
  // document, so it isn't `userDateAppt.time` and needs to be derived here).
  const mineTimes = useMemo(() => {
    if (!userDateAppt) return new Set<string>();
    const n = userDateAppt.slotsCount ?? 1;
    const times: string[] = [];
    for (let i = 0; i < n; i++) times.push(i === 0 ? userDateAppt.time : addMinutesToTime(userDateAppt.time, i * slotDur));
    return new Set(times);
  }, [userDateAppt, slotDur]);

  type SlotStatus = 'available' | 'booked' | 'mine' | 'past';
  function slotStatus(time: string): SlotStatus {
    if (mineTimes.has(time))         return 'mine';
    if (bookedTimes.includes(time))  return 'booked';
    if (isSlotInPast(today, time))   return 'past';
    if (userDateAppt)                return 'booked'; // already has a slot today → lock rest
    return 'available';
  }

  // Double/"tailing" options: every pair of immediately-adjacent base slots
  // that are both free, merged into one bookable long slot. Slides one slot
  // at a time so e.g. both 18:00–18:40 and 18:20–19:00 show up if free.
  type PairStatus = 'available' | 'mine' | 'blocked';
  const doublePairs = useMemo(() => {
    const pairs: { start: string; end: string; status: PairStatus }[] = [];
    for (let i = 0; i < slots.length - 1; i++) {
      const start = slots[i];
      const end   = slots[i + 1];
      const a = slotStatus(start);
      const b = slotStatus(end);
      const status: PairStatus =
        a === 'mine' && b === 'mine' ? 'mine' :
        a === 'available' && b === 'available' ? 'available' :
        'blocked';
      if (status !== 'blocked') pairs.push({ start, end, status });
    }
    return pairs;
  }, [slots, bookedTimes, mineTimes, today]);

  // Firestore writes require a real signed-in account: demo mode has no
  // firebaseUser at all, and a guest has one (anonymous auth, needed so guests
  // can still receive eruv push) but must not be able to book a real
  // appointment under it — same firebaseUser-truthy pitfall fixed elsewhere
  // (ProfileScreen, AuthGate) once anonymous auth started producing a real user.
  const canWrite = !!firebaseUser && !isGuest;

  function describeError(e: any, fallback: string): string {
    const msg = (e?.message ?? '') as string;
    if (msg.includes('permission') || msg.includes('insufficient')) {
      return 'אין הרשאה לפעולה זו. ודא/י שכללי האבטחה של Firestore מאפשרים קביעת תורים, ושאת/ה מחובר/ת עם חשבון (לא מצב הדגמה).';
    }
    return msg || fallback;
  }

  // ── Book ──────────────────────────────────────────────────────────────────
  async function handleConfirmBook() {
    if (!confirmSlot) return;
    if (!canWrite) {
      setConfirmSlot(null);
      Alert.alert(
        'נדרשת התחברות',
        'כדי לקבוע תור יש להתחבר עם חשבון.',
        [
          { text: 'ביטול', style: 'cancel' },
          { text: 'התחבר', onPress: () => navigation.navigate('Auth') },
        ],
      );
      return;
    }
    setBooking(true);
    try {
      await bookAppointment(mikvehId, userId!, today, confirmSlot.time, confirmSlot.slotsCount);
      const [{ bookedTimes: bt, userAppt }, appts] = await Promise.all([
        getSlotInfo(mikvehId, today, userId!, slotDur),
        getUserUpcomingAppointments(mikvehId, userId!),
      ]);
      setBookedTimes(bt);
      setUserDateAppt(userAppt);
      setUpcoming(appts);
      setConfirmSlot(null);
    } catch (e: any) {
      Alert.alert('שגיאה', describeError(e, 'לא ניתן לקבוע תור'));
    } finally {
      setBooking(false);
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function handleCancel(appt: MikvehAppointment) {
    if (!canWrite) {
      Alert.alert('נדרשת התחברות', 'כדי לבטל תור יש להתחבר עם חשבון.');
      setCancelTarget(null);
      return;
    }
    setCancelling(true);
    try {
      await cancelAppointment(mikvehId, appt.id);
      const [{ bookedTimes: bt, userAppt }, appts] = await Promise.all([
        getSlotInfo(mikvehId, today, userId!, slotDur),
        getUserUpcomingAppointments(mikvehId, userId!),
      ]);
      setBookedTimes(bt);
      setUserDateAppt(userAppt);
      setUpcoming(appts);
      setCancelTarget(null);
    } catch (e: any) {
      Alert.alert('שגיאה', describeError(e, 'לא ניתן לבטל'));
    } finally {
      setCancelling(false);
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <View style={s.header} />
        <ActivityIndicator size="large" color={Colors.mikveh} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const hasConfig = !!mikveh?.appointmentConfig;
  const isDayOpen = !!mikveh?.appointmentConfig?.schedule[dayKeyFromDate(today)]?.enabled;
  const nextAppt  = upcoming[0] ?? null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>קביעת תור</Text>
        <Text style={s.headerSub} numberOfLines={1}>{mikveh?.name}</Text>
        {/* Today's date inside header */}
        <View style={s.headerDatePill}>
          <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.9)" />
          <Text style={s.headerDateTxt}>{formatDateHeLong(today)}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottom + 32 }}
      >
        {/* ── Upcoming appointment banner ─────────────────────────────── */}
        {nextAppt && (
          <View style={s.upcomingBanner}>
            <View style={s.upcomingLeft}>
              <View style={s.upcomingIconWrap}>
                <Ionicons name="checkmark-circle" size={22} color={Colors.mikveh} />
              </View>
              <View>
                <Text style={s.upcomingLabel}>התור הקרוב שלך</Text>
                <Text style={s.upcomingValue}>
                  {formatDateHeShort(nextAppt.date)} · שעה {nextAppt.time}
                  {(nextAppt.slotsCount ?? 1) > 1 ? `–${addMinutesToTime(nextAppt.time, (nextAppt.slotsCount ?? 1) * slotDur)}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.upcomingCancelBtn}
              onPress={() => setCancelTarget(nextAppt)}
            >
              <Text style={s.upcomingCancelTxt}>בטל תור</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Single / double mode toggle ─────────────────────────────── */}
        {hasConfig && isDayOpen && (
          <View style={s.modeRow}>
            {([
              { key: 'single', label: 'תור בודד' },
              { key: 'double', label: `תור כפול (${slotDur * 2} דק')` },
            ] as const).map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[s.modeBtn, mode === key && s.modeBtnActive]}
                onPress={() => setMode(key)}
                activeOpacity={0.8}
              >
                <Text style={[s.modeBtnTxt, mode === key && s.modeBtnTxtActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Slot grid ─────────────────────────────────────────────────── */}
        {!hasConfig ? (
          <View style={s.emptyBox}>
            <Ionicons name="calendar-outline" size={44} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>קביעת תורים טרם הוגדרה</Text>
            <Text style={s.emptySub}>פנה/י למנהל המקווה לפרטים</Text>
          </View>
        ) : !isDayOpen ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyEmoji}>🚫</Text>
            <Text style={s.emptyTitle}>אין תורים להיום</Text>
            <Text style={s.emptySub}>המקווה סגור היום לתורים</Text>
          </View>
        ) : slotsLoading ? (
          <ActivityIndicator color={Colors.mikveh} style={{ marginTop: 50 }} size="large" />
        ) : slots.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>אין תורים זמינים להיום</Text>
          </View>
        ) : mode === 'single' ? (
          <View style={s.slotsSection}>

            <View style={s.slotsGrid}>
              {slots.map((time) => {
                const st = slotStatus(time);
                return (
                  <TouchableOpacity
                    key={time}
                    style={[
                      s.slot,
                      st === 'available' && s.slotAvail,
                      st === 'booked'    && s.slotBooked,
                      st === 'mine'      && s.slotMine,
                      st === 'past'      && s.slotPast,
                    ]}
                    onPress={() => {
                      if (st === 'available') setConfirmSlot({ time, end: time, slotsCount: 1 });
                      if (st === 'mine')      setCancelTarget(userDateAppt!);
                    }}
                    disabled={st === 'booked' || st === 'past'}
                    activeOpacity={0.8}
                  >
                    {st === 'mine' ? (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                        <Text style={[s.slotTime, { color: Colors.success }]}>{time}</Text>
                        <Text style={s.slotMineLabel}>שלי · לחץ לביטול</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[
                          s.slotTime,
                          st === 'available' && { color: '#fff' },
                          (st === 'booked' || st === 'past') && { color: Colors.textMuted },
                        ]}>
                          {time}
                        </Text>
                        <Text style={[
                          s.slotLabel,
                          st === 'available' && { color: 'rgba(255,255,255,0.85)' },
                          (st === 'booked' || st === 'past') && { color: Colors.textMuted },
                        ]}>
                          {st === 'available' ? 'פנוי' : st === 'booked' ? 'תפוס' : 'עבר'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer */}
            <View style={s.slotFooter}>
              <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
              <Text style={s.slotFooterTxt}>
                משך כל תור: {slotDur} דקות · {slots.length} תורים היום
              </Text>
            </View>

            {/* Legend */}
            <View style={s.legend}>
              {[
                { color: Colors.mikveh,                  label: 'פנוי' },
                { color: Colors.border,                   label: 'תפוס' },
                { color: Colors.success + '40', border: Colors.success, label: 'שלי' },
              ].map(({ color, border, label }) => (
                <View key={label} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: color }, border ? { borderWidth: 1.5, borderColor: border } : {}]} />
                  <Text style={s.legendTxt}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : doublePairs.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>אין תורים כפולים פנויים היום</Text>
            <Text style={s.emptySub}>נסה/י תור בודד, או יום אחר</Text>
          </View>
        ) : (
          <View style={s.slotsSection}>
            <View style={s.pairList}>
              {doublePairs.map(({ start, end, status }) => (
                <TouchableOpacity
                  key={start}
                  style={[s.pairRow, status === 'mine' && s.pairRowMine]}
                  onPress={() => {
                    if (status === 'available') setConfirmSlot({ time: start, end, slotsCount: 2 });
                    if (status === 'mine')      setCancelTarget(userDateAppt!);
                  }}
                  activeOpacity={0.8}
                >
                  {status === 'mine' && <Ionicons name="checkmark-circle" size={18} color={Colors.success} />}
                  <Text style={[s.pairTime, status === 'mine' && { color: Colors.success }]}>
                    {start} – {addMinutesToTime(end, slotDur)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[s.pairHint, status === 'mine' && { color: Colors.success }]}>
                    {status === 'mine' ? 'שלי · לחץ לביטול' : `${slotDur * 2} דק'`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Footer */}
            <View style={s.slotFooter}>
              <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
              <Text style={s.slotFooterTxt}>
                תור כפול = שני תורים רצופים · {slotDur * 2} דקות · {doublePairs.length} אפשרויות פנויות
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Confirm booking modal ───────────────────────────────────────── */}
      <Modal visible={!!confirmSlot} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalIconWrap}>
              <Ionicons name="calendar" size={28} color={Colors.mikveh} />
            </View>
            <Text style={s.modalTitle}>אישור קביעת תור</Text>
            <View style={s.modalDetail}>
              <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
              <Text style={s.modalDetailTxt}>{formatDateHeLong(today)}</Text>
            </View>
            <View style={s.modalDetail}>
              <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
              <Text style={s.modalDetailTxt}>
                {confirmSlot?.slotsCount === 2
                  ? `שעה ${confirmSlot.time} – ${addMinutesToTime(confirmSlot.end, slotDur)} · ${slotDur * 2} דקות`
                  : `שעה ${confirmSlot?.time} · ${slotDur} דקות`}
              </Text>
            </View>
            <Text style={s.modalNote}>ניתן לבטל את התור בכל עת מתוך מסך זה.</Text>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnGhost} onPress={() => setConfirmSlot(null)} disabled={booking}>
                <Text style={s.modalBtnGhostTxt}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtnPrimary, booking && { opacity: 0.7 }]} onPress={handleConfirmBook} disabled={booking}>
                {booking
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.modalBtnPrimaryTxt}>קבע תור</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Confirm cancel modal ────────────────────────────────────────── */}
      <Modal visible={!!cancelTarget} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={[s.modalIconWrap, { backgroundColor: Colors.danger + '15' }]}>
              <Ionicons name="close-circle" size={28} color={Colors.danger} />
            </View>
            <Text style={s.modalTitle}>ביטול תור</Text>
            {cancelTarget && (
              <>
                <View style={s.modalDetail}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                  <Text style={s.modalDetailTxt}>{formatDateHeLong(cancelTarget.date)}</Text>
                </View>
                <View style={s.modalDetail}>
                  <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                  <Text style={s.modalDetailTxt}>
                    שעה {cancelTarget.time}
                    {(cancelTarget.slotsCount ?? 1) > 1 ? ` – ${addMinutesToTime(cancelTarget.time, (cancelTarget.slotsCount ?? 1) * slotDur)}` : ''}
                  </Text>
                </View>
              </>
            )}
            <Text style={s.modalNote}>האם לבטל את התור?</Text>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnGhost} onPress={() => setCancelTarget(null)} disabled={cancelling}>
                <Text style={s.modalBtnGhostTxt}>חזור</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtnDanger, cancelling && { opacity: 0.7 }]} onPress={() => cancelTarget && handleCancel(cancelTarget)} disabled={cancelling}>
                {cancelling
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.modalBtnPrimaryTxt}>בטל תור</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    backgroundColor:   Colors.mikveh,
    paddingHorizontal: Spacing.lg,
    paddingTop:        Spacing.lg,
    paddingBottom:     Spacing.md,
    alignItems:        'center',
    gap:               4,
  },
  headerTitle:   { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub:     { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  headerDatePill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   'rgba(255,255,255,0.15)',
    borderRadius:      Radius.full,
    paddingHorizontal: 12,
    paddingVertical:   5,
    marginTop:         4,
  },
  headerDateTxt: { fontSize: 12, color: '#fff', fontWeight: '600' },

  // Upcoming banner
  upcomingBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    backgroundColor:   Colors.mikveh + '10',
    borderBottomWidth: 1,
    borderBottomColor: Colors.mikveh + '25',
    paddingHorizontal: Spacing.md,
    paddingVertical:   12,
  },
  upcomingLeft:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  upcomingIconWrap:  { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.mikveh + '20', alignItems: 'center', justifyContent: 'center' },
  upcomingLabel:     { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 2 },
  upcomingValue:     { fontSize: 14, color: Colors.text, fontWeight: '700' },
  upcomingCancelBtn: { backgroundColor: Colors.danger + '15', borderWidth: 1, borderColor: Colors.danger + '50', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  upcomingCancelTxt: { fontSize: 12, color: Colors.danger, fontWeight: '700' },

  // Empty states
  emptyBox:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 70, paddingHorizontal: Spacing.xl, gap: 10 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  // Single/double mode toggle
  modeRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
  },
  modeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  modeBtnActive: { backgroundColor: Colors.mikveh, borderColor: Colors.mikveh },
  modeBtnTxt:    { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  modeBtnTxtActive: { color: '#fff' },

  // Double/"tailing" pair list
  pairList: { paddingHorizontal: Spacing.md, gap: 8 },
  pairRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.mikveh, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    ...Shadow.card,
  },
  pairRowMine: { backgroundColor: Colors.success + '15', borderWidth: 2, borderColor: Colors.success },
  pairTime:    { fontSize: 16, fontWeight: '800', color: '#fff' },
  pairHint:    { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  // Slots
  slotsSection: { paddingTop: Spacing.md },
  slotsGrid: {
    flexDirection:     'row',
    flexWrap:          'wrap',
    gap:               SLOT_GAP,
    paddingHorizontal: Spacing.md,
    paddingBottom:     Spacing.sm,
  },
  slot: {
    width:          SLOT_W,
    height:         SLOT_H,
    borderRadius:   Radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            3,
    ...Shadow.card,
  },
  slotAvail:  { backgroundColor: Colors.mikveh },
  slotBooked: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  slotPast:   { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, opacity: 0.45 },
  slotMine:   { backgroundColor: Colors.success + '15', borderWidth: 2, borderColor: Colors.success },

  slotTime:      { fontSize: 17, fontWeight: '800' },
  slotLabel:     { fontSize: 11, fontWeight: '600' },
  slotMineLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },

  slotFooter: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingHorizontal: Spacing.md,
    paddingTop:        4,
  },
  slotFooterTxt: { fontSize: 12, color: Colors.textMuted },

  legend: {
    flexDirection:     'row',
    gap:               Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop:        Spacing.sm,
    paddingBottom:     Spacing.lg,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 12, height: 12, borderRadius: 6 },
  legendTxt:  { fontSize: 12, color: Colors.textSecondary },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  modal: {
    width:           '100%',
    backgroundColor: Colors.cardBackground,
    borderRadius:    Radius.lg,
    padding:         Spacing.lg,
    alignItems:      'center',
    gap:             Spacing.sm,
    ...Shadow.card,
    shadowOpacity: 0.25,
    elevation:     12,
  },
  modalIconWrap:  { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.mikveh + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  modalTitle:     { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalDetail:    { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  modalDetailTxt: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  modalNote:      { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.sm },
  modalBtns:      { flexDirection: 'row', gap: Spacing.sm, marginTop: 4, alignSelf: 'stretch' },
  modalBtnGhost: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  modalBtnGhostTxt:   { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  modalBtnPrimary:    { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.mikveh, alignItems: 'center' },
  modalBtnDanger:     { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.danger,  alignItems: 'center' },
  modalBtnPrimaryTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
