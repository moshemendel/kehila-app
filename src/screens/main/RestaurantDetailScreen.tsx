import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Linking, Modal, Dimensions, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { Restaurant, KosherCertificate } from '../../types';
import { getRestaurant, restaurantCategories, CATEGORY_ICONS, CATEGORY_LABELS } from '../../services/restaurants';

// ─── Layout constants ─────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');

// Card header: mood (cover) photo height
const MOOD_H    = 186;
// Extra-image circles
const CIRCLE_D  = 72;   // circle image diameter
const CBORDER   = 3;    // white border thickness around each circle
const CIRCLE_OUTER = CIRCLE_D + CBORDER * 2;
// How far each circle dips below the mood image
const CIRCLE_OVERLAP = CIRCLE_OUTER / 2;

// ─── Lookup tables ────────────────────────────────────────────────────────────

const KOSHER_LABELS: Record<string, string> = {
  mehadrin: 'מהדרין', regular: 'רגיל', chalav_israel: 'חלב ישראל',
  bishul_israel: 'בישול ישראל', glatt: 'גלאט',
};
const KOSHER_COLORS: Record<string, string> = {
  mehadrin: '#1A6B36', regular: Colors.success, chalav_israel: '#2563eb',
  bishul_israel: '#7c3aed', glatt: '#b45309',
};
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_HE   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isExpired(iso: string): boolean {
  try { return new Date(iso) < new Date(); } catch { return false; }
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—'; // toLocaleDateString would print "Invalid Date" otherwise
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function openMaps(address: string, lat?: number, lon?: number) {
  const url = lat && lon
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  Linking.openURL(url);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RestaurantDetailScreen() {
  const route           = useRoute<any>();
  const { top, bottom } = useSafeAreaInsets();

  const { restaurantId } = route.params as { restaurantId: string };

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [certModal,  setCertModal]  = useState<string | null>(null);

  useEffect(() => {
    getRestaurant(restaurantId)
      .then((r) => { setRestaurant(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [restaurantId]);

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loader}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={Colors.kosher} />
      </View>
    );
  }
  if (!restaurant) {
    return (
      <View style={styles.loader}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={52} color={Colors.textMuted} />
        <Text style={styles.notFound}>המסעדה לא נמצאה</Text>
      </View>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const todayIdx      = new Date().getDay();
  const todayKey      = DAY_KEYS[todayIdx] as keyof typeof restaurant.openingHours;
  const todayHours    = restaurant.openingHours[todayKey] ?? '—';
  const isClosedToday = todayHours.toLowerCase() === 'closed' || todayHours === 'סגור';

  // Flatten imageUrl + images[] → [moodImage, ...extraImages]
  const allImages: string[] = [
    ...(restaurant.imageUrl ? [restaurant.imageUrl] : []),
    ...(restaurant.images ?? []),
  ].filter(Boolean);

  const moodImage   = allImages[0];              // cover photo (full-width at top of card)
  const extraImages = allImages.slice(1, 4);     // up to 3 circles
  const hasCircles  = extraImages.length > 0;

  const certs       = restaurant.kosherCertificates ?? [];
  const activeCerts = certs.filter((c) => c.isActive && !isExpired(c.validUntil));

  // Tag line: businessType first, then the kashrut categories (each tag is its own
  // <Text> rendered in a flex-wrap row, so emoji + word always wrap together).
  const categoryTags = [
    restaurant.businessType === 'factory' ? '🏭 מפעל' : '🍴 בית אוכל',
    ...restaurantCategories(restaurant).map((c) => `${CATEGORY_ICONS[c] ?? '🍽️'} ${CATEGORY_LABELS[c] ?? c}`),
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Dark status-bar icons on this screen's light background */}
      <StatusBar style="dark" />

      {/* ── Certificate full-screen viewer ─────────────────────────────── */}
      <Modal
        visible={!!certModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCertModal(null)}
      >
        <View style={styles.certModalBg}>
          <TouchableOpacity
            style={[styles.certModalClose, { top: top + 10 }]}
            onPress={() => setCertModal(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close-circle" size={38} color="#fff" />
          </TouchableOpacity>
          {certModal && (
            <Image
              source={{ uri: certModal }}
              style={styles.certModalImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.certModalCaption}>גע לסגירה</Text>
        </View>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: top + 8, paddingBottom: bottom + 32 }}
      >

        {/* ══ Main info card ═══════════════════════════════════════════════ */}
        <View style={styles.card}>

          {/* ── Mood / cover photo ─────────────────────────────────────── */}
          <View style={styles.moodWrap}>
            {moodImage ? (
              <Image
                source={{ uri: moodImage }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="contain"
              />
            ) : (
              /* Emoji placeholder when no images exist */
              <View style={styles.moodPlaceholder}>
                <Text style={styles.moodEmoji}>
                  {CATEGORY_ICONS[restaurant.category] ?? '🍽️'}
                </Text>
                <Text style={styles.moodCategoryLabel}>
                  {CATEGORY_LABELS[restaurant.category] ?? restaurant.category}
                </Text>
              </View>
            )}
          </View>

          {/* ── Extra-image circles (Facebook-style profile pictures) ───── */}
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

            {/* Active alert */}
            {!!restaurant.activeAlert && (
              <View style={styles.alertBanner}>
                <Ionicons name="warning" size={15} color="#fff" />
                <Text style={styles.alertText}>{restaurant.activeAlert}</Text>
              </View>
            )}

            {/* Name + open/closed pill */}
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.categoryRow}>
                  {categoryTags.map((t, i) => (
                    <Text key={i} style={styles.categoryLabel}>{t}</Text>
                  ))}
                </View>
                <Text style={styles.name}>{restaurant.name}</Text>
              </View>
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

            {/* Address → maps */}
            <TouchableOpacity
              style={styles.metaRow}
              onPress={() => openMaps(restaurant.address, restaurant.latitude, restaurant.longitude)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={15} color={Colors.kosher} />
              <Text style={styles.metaText}>{restaurant.address}</Text>
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
            {!!restaurant.phone && (
              <TouchableOpacity
                style={styles.metaRow}
                onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}
                activeOpacity={0.7}
              >
                <Ionicons name="call-outline" size={15} color={Colors.textSecondary} />
                <Text style={[styles.metaText, { color: Colors.kosher }]}>{restaurant.phone}</Text>
              </TouchableOpacity>
            )}

            {/* Description */}
            {!!restaurant.description && (
              <Text style={styles.description}>{restaurant.description}</Text>
            )}

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              {restaurant.phone && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}
                >
                  <Ionicons name="call-outline" size={18} color={Colors.kosher} />
                  <Text style={styles.actionBtnTxt}>חייג</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => openMaps(restaurant.address, restaurant.latitude, restaurant.longitude)}
              >
                <Ionicons name="navigate" size={18} color="#fff" />
                <Text style={[styles.actionBtnTxt, { color: '#fff' }]}>ניווט</Text>
              </TouchableOpacity>
              {restaurant.website && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL(restaurant.website!)}
                >
                  <Ionicons name="globe-outline" size={18} color={Colors.kosher} />
                  <Text style={styles.actionBtnTxt}>אתר</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ── Kashrut: mashgiach contact + certificates ──────────────────── */}
        {(activeCerts.length > 0 || restaurant.mashgiachName || restaurant.mashgiachPhone) && (
          <View style={styles.section}>
            <View style={styles.sectionHdr}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
              <Text style={styles.sectionTitle}>כשרות</Text>
              {activeCerts.length > 0 && (
                <View style={styles.certCountBadge}>
                  <Text style={styles.certCountTxt}>{activeCerts.length}</Text>
                </View>
              )}
            </View>

            {/* Mashgiach (supervisor) contact */}
            {(restaurant.mashgiachName || restaurant.mashgiachPhone) && (
              <View style={styles.mashgiachCard}>
                <Ionicons name="person-outline" size={18} color={Colors.kosher} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mashgiachLabel}>משגיח כשרות</Text>
                  {!!restaurant.mashgiachName && (
                    <Text style={styles.mashgiachName}>{restaurant.mashgiachName}</Text>
                  )}
                </View>
                {!!restaurant.mashgiachPhone && (
                  <TouchableOpacity
                    style={styles.mashgiachCallBtn}
                    onPress={() => Linking.openURL(`tel:${restaurant.mashgiachPhone}`)}
                  >
                    <Ionicons name="call" size={13} color="#fff" />
                    <Text style={styles.mashgiachCallTxt}>{restaurant.mashgiachPhone}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {activeCerts.map((cert, i) => (
              <CertCard
                key={cert.id ?? String(i)}
                cert={cert}
                onViewImage={(url) => setCertModal(url)}
              />
            ))}
          </View>
        )}

        {/* ── Full-week opening hours ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHdr}>
            <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>שעות פעילות</Text>
          </View>
          <View style={styles.hoursCard}>
            {DAY_KEYS.map((key, i) => {
              const isToday = i === todayIdx;
              const hours   = restaurant.openingHours[key as keyof typeof restaurant.openingHours] ?? '—';
              const closed  = hours.toLowerCase() === 'closed' || hours === 'סגור';
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

// ─── CertCard sub-component ───────────────────────────────────────────────────

function CertCard({
  cert,
  onViewImage,
}: {
  cert: KosherCertificate;
  onViewImage: (url: string) => void;
}) {
  const expired  = cert.validUntil ? isExpired(cert.validUntil) : false;
  const isActive = cert.isActive && !expired;

  return (
    <View style={[styles.certCard, !isActive && styles.certCardDim]}>
      <View style={styles.certCardHdr}>
        <View style={[styles.certBadge, isActive ? styles.certBadgeActive : styles.certBadgeExpired]}>
          <Ionicons
            name={isActive ? 'shield-checkmark' : 'shield-outline'}
            size={11}
            color={isActive ? Colors.success : Colors.textMuted}
          />
          <Text style={[styles.certBadgeTxt, isActive ? styles.certBadgeTxtActive : styles.certBadgeTxtExpired]}>
            {isActive ? 'בתוקף' : expired ? 'פג תוקף' : 'לא פעיל'}
          </Text>
        </View>

        {cert.imageUrl && (
          <TouchableOpacity
            style={styles.viewCertBtn}
            onPress={() => onViewImage(cert.imageUrl!)}
            activeOpacity={0.75}
          >
            <Ionicons name="document-text-outline" size={14} color={Colors.primary} />
            <Text style={styles.viewCertTxt}>הצג תעודה</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.certIssuer}>{cert.issuedBy}</Text>
      {cert.certNumber && (
        <Text style={styles.certNumber}>מס׳ תעודה: {cert.certNumber}</Text>
      )}

      <View style={styles.levelRow}>
        {cert.kosherLevel.map((lvl) => (
          <View
            key={lvl}
            style={[styles.levelChip, { backgroundColor: (KOSHER_COLORS[lvl] ?? Colors.success) + '1A' }]}
          >
            <Text style={[styles.levelChipTxt, { color: KOSHER_COLORS[lvl] ?? Colors.success }]}>
              {KOSHER_LABELS[lvl] ?? lvl}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.datesRow}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>מתאריך</Text>
          <Text style={styles.dateVal}>{formatDate(cert.validFrom)}</Text>
        </View>
        <View style={styles.dateDivider} />
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>עד תאריך</Text>
          <Text style={[styles.dateVal, expired && { color: Colors.danger }]}>
            {formatDate(cert.validUntil)}
          </Text>
        </View>
      </View>

      {!!cert.notes && (
        <Text style={styles.certNotes}>{cert.notes}</Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: Colors.background },
  loader:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, gap: 12 },
  notFound:  { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },

  // ── Main card ─────────────────────────────────────────────────────────────

  card: {
    backgroundColor:  Colors.cardBackground,
    marginHorizontal: Spacing.md,
    borderRadius:     Radius.lg,
    ...Shadow.card,
    shadowOpacity:    0.13,
    elevation:        6,
    marginBottom:     Spacing.md,
    // No overflow:'hidden' — circles extend beyond moodWrap bounds
  },

  // Cover / mood photo at top of card
  moodWrap: {
    height:               MOOD_H,
    borderTopLeftRadius:  Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow:             'hidden',   // clips the image to rounded corners
    backgroundColor:      Colors.kosher + '20',
  },

  // Emoji placeholder when restaurant has no images
  moodPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  moodEmoji:         { fontSize: 64 },
  moodCategoryLabel: { fontSize: 16, fontWeight: '700', color: Colors.kosher },

  // Circles row — sits halfway over the mood image bottom edge
  circlesRow: {
    position:       'absolute',
    top:            MOOD_H - CIRCLE_OVERLAP,   // half the circle overlaps mood image
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
    // Shadow so circles appear lifted above the card surface
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.22,
    shadowRadius:    4,
    elevation:       5,
  },
  circleImg: {
    width:        CIRCLE_D,
    height:       CIRCLE_D,
    borderRadius: CIRCLE_D / 2,
  },

  // Body below mood image; paddingTop grows when circles are present
  cardBody: {
    padding: Spacing.md,
  },

  // ── Alert / name / meta rows (same as before) ─────────────────────────────

  alertBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   Colors.warning,
    borderRadius:      Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   8,
    marginBottom:      Spacing.sm,
  },
  alertText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },

  nameRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  categoryRow:   { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 },
  categoryEmoji: { fontSize: 14 },
  categoryLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  businessTypeLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  name:          { fontSize: 22, fontWeight: '800', color: Colors.text },

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
    fontSize:     13,
    color:        Colors.textSecondary,
    lineHeight:   20,
    marginTop:    Spacing.sm,
    marginBottom: Spacing.xs,
  },

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
    borderColor:     Colors.kosher,
    backgroundColor: Colors.kosher + '0D',
    minWidth:        80,
  },
  actionBtnPrimary: { backgroundColor: Colors.kosher, borderColor: Colors.kosher },
  actionBtnTxt:     { fontSize: 14, fontWeight: '700', color: Colors.kosher },

  // ── Sections ──────────────────────────────────────────────────────────────

  section: { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionHdr: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginBottom:  Spacing.sm,
  },
  sectionTitle:   { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1 },
  certCountBadge: {
    backgroundColor:  Colors.success + '20',
    borderRadius:     Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  certCountTxt: { fontSize: 11, fontWeight: '700', color: Colors.success },

  // ── Mashgiach contact ─────────────────────────────────────────────────────
  mashgiachCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: Colors.kosher + '0D',
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.kosher + '30',
    padding:         Spacing.md,
    marginBottom:    Spacing.sm,
  },
  mashgiachLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  mashgiachName:  { fontSize: 15, color: Colors.text, fontWeight: '700', marginTop: 1 },
  mashgiachCallBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   Colors.kosher,
    borderRadius:      Radius.full,
    paddingHorizontal: 12,
    paddingVertical:   7,
  },
  mashgiachCallTxt: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // ── Cert cards ────────────────────────────────────────────────────────────

  certCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    marginBottom:    Spacing.sm,
    borderWidth:     1.5,
    borderColor:     Colors.success + '40',
    ...Shadow.card,
  },
  certCardDim: { borderColor: Colors.border, opacity: 0.75 },

  certCardHdr: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   Spacing.sm,
  },
  certBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth:       1,
  },
  certBadgeActive:     { backgroundColor: Colors.success + '14', borderColor: Colors.success + '60' },
  certBadgeExpired:    { backgroundColor: Colors.border, borderColor: Colors.border },
  certBadgeTxt:        { fontSize: 11, fontWeight: '700' },
  certBadgeTxtActive:  { color: Colors.success },
  certBadgeTxtExpired: { color: Colors.textMuted },

  viewCertBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius:    Radius.full,
    borderWidth:     1,
    borderColor:     Colors.primary + '60',
    backgroundColor: Colors.primary + '0D',
  },
  viewCertTxt: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  certIssuer: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  certNumber: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.sm },
  certNotes:  { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm, fontStyle: 'italic' },

  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.sm },
  levelChip: {
    borderRadius:      Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  levelChipTxt: { fontSize: 12, fontWeight: '700' },

  datesRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dateBlock:   { flex: 1, alignItems: 'center' },
  dateDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  dateLabel:   { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
  dateVal:     { fontSize: 13, fontWeight: '700', color: Colors.text },

  // ── Opening hours ─────────────────────────────────────────────────────────

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
  hoursRowToday:   { backgroundColor: Colors.success + '0F' },
  hoursLeft:       { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  todayDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success },
  hoursDay:        { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  hoursDayToday:   { color: Colors.success, fontWeight: '700' },
  hoursValue:      { fontSize: 14, color: Colors.text, fontWeight: '600', textAlign: 'left' },
  hoursValueToday: { color: Colors.success, fontWeight: '700' },
  hoursClosed:     { color: Colors.textMuted },

  // ── Cert image modal ──────────────────────────────────────────────────────

  certModalBg: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  certModalClose: {
    position: 'absolute',
    right:    20,
    zIndex:   10,
  },
  certModalImage: {
    width:        SW - 32,
    height:       SW * 1.42,
    borderRadius: Radius.sm,
  },
  certModalCaption: {
    marginTop: 16,
    fontSize:  12,
    color:     'rgba(255,255,255,0.45)',
  },
});
