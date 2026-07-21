import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Linking, Dimensions, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { Mikveh, DayKey } from '../../types';
import { getMikveh } from '../../services/mikvaot';
import { hoursTextForDay } from '../../utils/appointmentSlots';

// ─── Layout constants (identical to RestaurantDetailScreen) ───────────────────

const MOOD_H        = 186;
const CIRCLE_D      = 72;
const CBORDER       = 3;
const CIRCLE_OUTER  = CIRCLE_D + CBORDER * 2;
const CIRCLE_OVERLAP = CIRCLE_OUTER / 2;

// ─── Lookup tables ────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  women: '👩', men: '👨', both: '♾',
};
const TYPE_LABELS: Record<string, string> = {
  women: 'נשים', men: 'גברים', both: 'גברים ונשים',
};

const DAY_KEYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_HE   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openMaps(address: string, lat?: number, lon?: number) {
  const url = lat && lon
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  Linking.openURL(url);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MikvehDetailScreen() {
  const route           = useRoute<any>();
  const navigation      = useNavigation<any>();
  const { top, bottom } = useSafeAreaInsets();
  const { mikvehId }    = route.params as { mikvehId: string };

  const [mikveh,  setMikveh]  = useState<Mikveh | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMikveh(mikvehId)
      .then((m) => { setMikveh(m); setLoading(false); })
      .catch(() => setLoading(false));
  }, [mikvehId]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={Colors.mikveh} />
      </View>
    );
  }
  if (!mikveh) {
    return (
      <View style={styles.loader}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={52} color={Colors.textMuted} />
        <Text style={styles.notFound}>המקווה לא נמצא</Text>
      </View>
    );
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const todayIdx      = new Date().getDay();
  const todayKey      = DAY_KEYS[todayIdx];
  const todayHours    = hoursTextForDay(mikveh.hoursSchedule, todayKey);
  const isClosedToday = todayHours === 'סגור';

  const allImages: string[] = [
    ...(mikveh.imageUrl ? [mikveh.imageUrl] : []),
    ...(mikveh.images ?? []),
  ].filter(Boolean);

  const moodImage   = allImages[0];
  const extraImages = allImages.slice(1, 4);
  const hasCircles  = extraImages.length > 0;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: top + 8, paddingBottom: bottom + 32 }}
      >

        {/* ══ Main card ═══════════════════════════════════════════════════════ */}
        <View style={styles.card}>

          {/* ── Mood / cover image ──────────────────────────────────────── */}
          <View style={styles.moodWrap}>
            {moodImage ? (
              <Image
                source={{ uri: moodImage }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.moodPlaceholder}>
                <Text style={styles.moodEmoji}>
                  {TYPE_ICONS[mikveh.type] ?? '💧'}
                </Text>
                <Text style={styles.moodTypeLabel}>
                  מקווה {TYPE_LABELS[mikveh.type] ?? mikveh.type}
                </Text>
              </View>
            )}
          </View>

          {/* ── Extra-image circles ─────────────────────────────────────── */}
          {hasCircles && (
            <View style={styles.circlesRow}>
              {extraImages.map((uri, i) => (
                <View key={i} style={styles.circleWrap}>
                  <Image source={{ uri }} style={styles.circleImg} resizeMode="cover" />
                </View>
              ))}
            </View>
          )}

          {/* ── Card body ───────────────────────────────────────────────── */}
          <View style={[styles.cardBody, hasCircles && { paddingTop: CIRCLE_OVERLAP + 12 }]}>

            {/* Name + type badge */}
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.typeRow}>
                  <Text style={styles.typeIcon}>{TYPE_ICONS[mikveh.type] ?? '💧'}</Text>
                  <Text style={styles.typeLabel}>
                    מקווה {TYPE_LABELS[mikveh.type] ?? mikveh.type}
                  </Text>
                </View>
                <Text style={styles.name}>{mikveh.name}</Text>
                {mikveh.neighborhood && (
                  <Text style={styles.neighborhood}>{mikveh.neighborhood}</Text>
                )}
              </View>

              {/* Open/closed pill */}
              <View style={[
                styles.statusPill,
                isClosedToday ? styles.statusPillClosed : styles.statusPillOpen,
              ]}>
                <View style={[styles.statusDot, isClosedToday ? styles.dotClosed : styles.dotOpen]} />
                <Text style={[
                  styles.statusText,
                  isClosedToday ? styles.statusTxtClosed : styles.statusTxtOpen,
                ]}>
                  {isClosedToday ? 'סגור' : 'פתוח'}
                </Text>
              </View>
            </View>

            {/* Appointment required banner */}
            {mikveh.requiresAppointment && (
              <View style={styles.apptBanner}>
                <Ionicons name="calendar-outline" size={14} color={Colors.warning} />
                <Text style={styles.apptBannerTxt}>נדרשת הזמנה מראש</Text>
                {mikveh.appointmentPhone && (
                  <TouchableOpacity
                    style={styles.apptPhoneBtn}
                    onPress={() => Linking.openURL(`tel:${mikveh.appointmentPhone}`)}
                  >
                    <Text style={styles.apptPhoneTxt}>{mikveh.appointmentPhone}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Address → maps */}
            <TouchableOpacity
              style={styles.metaRow}
              onPress={() => openMaps(mikveh.address, mikveh.latitude, mikveh.longitude)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={15} color={Colors.mikveh} />
              <Text style={styles.metaText}>{mikveh.address}</Text>
              <Ionicons name="chevron-back" size={13} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Today's hours */}
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={15} color={Colors.textSecondary} />
              <Text style={styles.metaLabel}>שעות היום:</Text>
              <Text style={[styles.metaValue, isClosedToday && { color: Colors.danger }]}>
                {isClosedToday ? 'סגור היום' : todayHours}
              </Text>
            </View>

            {/* Phone */}
            {!!mikveh.phone && (
              <TouchableOpacity
                style={styles.metaRow}
                onPress={() => Linking.openURL(`tel:${mikveh.phone}`)}
                activeOpacity={0.7}
              >
                <Ionicons name="call-outline" size={15} color={Colors.textSecondary} />
                <Text style={[styles.metaText, { color: Colors.mikveh }]}>{mikveh.phone}</Text>
              </TouchableOpacity>
            )}

            {/* Description */}
            {!!mikveh.description && (
              <Text style={styles.description}>{mikveh.description}</Text>
            )}

            {/* Notes */}
            {!!mikveh.notes && (
              <View style={styles.notesBox}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.notesText}>{mikveh.notes}</Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              {mikveh.phone && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL(`tel:${mikveh.phone}`)}
                >
                  <Ionicons name="call-outline" size={18} color={Colors.mikveh} />
                  <Text style={styles.actionBtnTxt}>חייג</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => openMaps(mikveh.address, mikveh.latitude, mikveh.longitude)}
              >
                <Ionicons name="navigate" size={18} color="#fff" />
                <Text style={[styles.actionBtnTxt, { color: '#fff' }]}>ניווט</Text>
              </TouchableOpacity>
              {mikveh.requiresAppointment && mikveh.appointmentPhone && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL(`tel:${mikveh.appointmentPhone}`)}
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.mikveh} />
                  <Text style={styles.actionBtnTxt}>הזמנה</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Online appointment booking button — always visible */}
            <TouchableOpacity
              style={styles.bookingBtn}
              onPress={() => navigation.navigate('AppointmentBooking', { mikvehId: mikveh.id })}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar" size={20} color="#fff" />
              <Text style={styles.bookingBtnTxt}>קביעת תור אונליין</Text>
              <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Full-week opening hours ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHdr}>
            <Ionicons name="calendar-outline" size={18} color={Colors.mikveh} />
            <Text style={styles.sectionTitle}>שעות פעילות</Text>
          </View>
          <View style={styles.hoursCard}>
            {DAY_KEYS.map((key, i) => {
              const isToday = i === todayIdx;
              const hours   = hoursTextForDay(mikveh.hoursSchedule, key);
              const closed  = hours === 'סגור';
              return (
                <View key={key} style={[styles.hoursRow, isToday && styles.hoursRowToday]}>
                  <View style={styles.hoursLeft}>
                    {isToday && <View style={styles.todayDot} />}
                    <Text style={[styles.hoursDay, isToday && styles.hoursDayToday]}>
                      יום {DAY_HE[i]}
                    </Text>
                  </View>
                  {closed ? (
                    <Text style={[styles.hoursValue, styles.hoursClosed, isToday && styles.hoursValueToday]}>
                      סגור
                    </Text>
                  ) : hours.includes(',') ? (
                    <View style={{ alignItems: 'flex-start' }}>
                      {hours.split(',').map((r, i) => (
                        <Text key={i} style={[styles.hoursValue, isToday && styles.hoursValueToday]}>
                          {r.trim()}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.hoursValue, isToday && styles.hoursValueToday]}>
                      {hours}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: Colors.background },
  loader:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, gap: 12 },
  notFound:  { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor:  Colors.cardBackground,
    marginHorizontal: Spacing.md,
    borderRadius:     Radius.lg,
    ...Shadow.card,
    shadowOpacity: 0.13,
    elevation:     6,
    marginBottom:  Spacing.md,
  },

  // Cover photo
  moodWrap: {
    height:               MOOD_H,
    borderTopLeftRadius:  Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow:             'hidden',
    backgroundColor:      Colors.mikveh + '20',
  },
  moodPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  moodEmoji:     { fontSize: 64 },
  moodTypeLabel: { fontSize: 16, fontWeight: '700', color: Colors.mikveh },

  // Extra-image circles
  circlesRow: {
    position:       'absolute',
    top:            MOOD_H - CIRCLE_OVERLAP,
    left:           0,
    right:          0,
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            10,
    zIndex:         10,
  },
  circleWrap: {
    width:           CIRCLE_OUTER,
    height:          CIRCLE_OUTER,
    borderRadius:    CIRCLE_OUTER / 2,
    borderWidth:     CBORDER,
    borderColor:     Colors.cardBackground,
    overflow:        'hidden',
    backgroundColor: Colors.cardBackground,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.22,
    shadowRadius:    4,
    elevation:       5,
  },
  circleImg: { width: CIRCLE_D, height: CIRCLE_D, borderRadius: CIRCLE_D / 2 },

  cardBody: { padding: Spacing.md },

  // ── Name / type row ───────────────────────────────────────────────────────
  nameRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  typeRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  typeIcon:     { fontSize: 14 },
  typeLabel:    { fontSize: 12, color: Colors.mikveh, fontWeight: '700' },
  name:         { fontSize: 22, fontWeight: '800', color: Colors.text },
  neighborhood: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Open/closed pill
  statusPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      Radius.full,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderWidth:       1,
    marginTop:         4,
  },
  statusPillOpen:   { backgroundColor: Colors.success + '14', borderColor: Colors.success + '50' },
  statusPillClosed: { backgroundColor: Colors.danger  + '14', borderColor: Colors.danger  + '50' },
  statusDot:        { width: 7, height: 7, borderRadius: 4 },
  dotOpen:          { backgroundColor: Colors.success },
  dotClosed:        { backgroundColor: Colors.danger  },
  statusText:       { fontSize: 12, fontWeight: '700' },
  statusTxtOpen:    { color: Colors.success },
  statusTxtClosed:  { color: Colors.danger  },

  // Appointment banner
  apptBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   Colors.warning + '15',
    borderRadius:      Radius.sm,
    borderWidth:       1,
    borderColor:       Colors.warning + '50',
    paddingHorizontal: Spacing.sm,
    paddingVertical:   8,
    marginBottom:      Spacing.sm,
    flexWrap:          'wrap',
  },
  apptBannerTxt: { flex: 1, fontSize: 13, color: Colors.warning, fontWeight: '600' },
  apptPhoneBtn:  { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  apptPhoneTxt:  { fontSize: 12, color: '#fff', fontWeight: '700' },

  // Meta rows
  metaRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingVertical:   5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  metaText:  { flex: 1, fontSize: 13, color: Colors.textSecondary },
  metaLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  metaValue: { fontSize: 13, color: Colors.text, fontWeight: '600', flex: 1 },

  description: {
    fontSize:    13,
    color:       Colors.textSecondary,
    lineHeight:  20,
    marginTop:   Spacing.sm,
  },

  notesBox: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             6,
    backgroundColor: Colors.accentLight,
    borderRadius:    Radius.sm,
    padding:         Spacing.sm,
    marginTop:       Spacing.sm,
  },
  notesText: { flex: 1, fontSize: 13, color: Colors.primaryDark, lineHeight: 18 },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    marginTop:     Spacing.md,
    flexWrap:      'wrap',
  },
  actionBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    paddingVertical: 10,
    borderRadius:    Radius.md,
    borderWidth:     1.5,
    borderColor:     Colors.mikveh,
    backgroundColor: Colors.mikveh + '0D',
    minWidth:        80,
  },
  actionBtnPrimary: { backgroundColor: Colors.mikveh, borderColor: Colors.mikveh },
  actionBtnTxt:     { fontSize: 14, fontWeight: '700', color: Colors.mikveh },

  bookingBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    backgroundColor: Colors.mikveh,
    borderRadius:    Radius.md,
    paddingVertical: 14,
    marginTop:       Spacing.sm,
  },
  bookingBtnTxt: { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionHdr: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  Spacing.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1 },

  // ── Hours card ────────────────────────────────────────────────────────────
  hoursCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius:    Radius.md,
    overflow:        'hidden',
    ...Shadow.card,
  },
  hoursRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: Spacing.md,
    paddingVertical:   11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hoursRowToday:   { backgroundColor: Colors.mikveh + '0F' },
  hoursLeft:       { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  todayDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.mikveh },
  hoursDay:        { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  hoursDayToday:   { color: Colors.mikveh, fontWeight: '700' },
  hoursValue:      { fontSize: 14, color: Colors.text, fontWeight: '600', textAlign: 'left' },
  hoursValueToday: { color: Colors.mikveh, fontWeight: '700' },
  hoursClosed:     { color: Colors.textMuted },
});
