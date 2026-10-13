import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow, CardShell } from '../utils/theme';
import { useNavigateTo } from '../hooks/useNavigateTo';
import { Business } from '../types';
import { updateBusiness, businessCategories, CATEGORY_ICONS, CATEGORY_LABELS } from '../services/businesses';
import LocationEditModal from './LocationEditModal';
import {
  businessHoursForDay, openStatus, openStatusLabel, type OpenStatus,
} from '../utils/appointmentSlots';
import { useTodayZmanim } from '../hooks/useTodayZmanim';
import { useAppForegroundTick } from '../hooks/useAppForegroundTick';
import { DayKey } from '../types';
import type { ZmanimResult } from '../utils/zmanim';

const KOSHER_LABELS: Record<string, string> = {
  mehadrin: 'מהדרין', regular: 'רגיל', chalav_israel: 'חלב ישראל',
  bishul_israel: 'בישול ישראל', glatt: 'גלאט',
};

interface Props {
  business: Business;
  distLabel?: string;
  canManage?: boolean;
  onPress?: () => void;
  cardStyle?: any;
}

function getTodayHours(business: Business, zmanim: ZmanimResult | null): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()] as DayKey;
  return businessHoursForDay(business, today, zmanim);
}

/** Dot and text colour per status: open green, opening later today gold,
 *  closed red, and grey when there is nothing to go on. */
function statusTone(st: OpenStatus) {
  switch (st.kind) {
    case 'open':           return { dot: styles.dotOpen,    text: styles.hoursOpen };
    case 'opensLater':     return { dot: styles.dotLater,   text: styles.hoursLater };
    case 'closedForToday':
    case 'closedToday':    return { dot: styles.dotClosed,  text: styles.hoursClosed };
    default:               return { dot: styles.dotUnknown, text: styles.hoursUnknown };
  }
}

export default function BusinessCard({ business, distLabel, canManage, onPress, cardStyle }: Props) {
  const { go: navigateTo, sheet: navSheet } = useNavigateTo();
  useAppForegroundTick(); // re-read the clock when the app comes back
  const zmanim        = useTodayZmanim(business.cityId);
  const todayHours    = getTodayHours(business, zmanim);
  const status        = openStatus(business, new Date(), zmanim);
  const tone          = statusTone(status);
  // Today's ranges after the status when they add something — mostly split
  // hours, where "until 13:00" alone hides the evening opening. 'unclear'
  // has no status to show, so the hours text stands on its own.
  const statusText    = status.kind === 'unclear' ? todayHours
    : status.kind === 'open' || status.kind === 'opensLater' || status.kind === 'closedForToday'
      ? `${openStatusLabel(status)} · ${todayHours}`
      : openStatusLabel(status);
  const activeCert    = business.kosherCertificates.find((c) => c.isActive);
  const cats          = businessCategories(business);
  const bizTypeLabel  = business.businessType === 'factory' ? '🏭 מפעל' : '🍴 בית אוכל';
  const [editingLoc, setEditingLoc] = useState(false);

  return (
    <>
      <TouchableOpacity style={[styles.card, cardStyle]} onPress={onPress} activeOpacity={0.85}>
        {business.activeAlert && (
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={14} color={Colors.white} />
            <Text style={styles.alertText}>{business.activeAlert}</Text>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.emoji}>{CATEGORY_ICONS[cats[0]] ?? '🍽️'}</Text>
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{business.name}</Text>
            <Text style={styles.address}>{business.address}</Text>
            <Text style={styles.tags} numberOfLines={1}>
              {[bizTypeLabel, ...cats.map((c) => `${CATEGORY_ICONS[c] ?? ''} ${CATEGORY_LABELS[c] ?? c}`)].join(' · ')}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {distLabel && (
              <View style={styles.distBadge}>
                <Ionicons name="navigate-outline" size={10} color={Colors.primaryLight} />
                <Text style={styles.distTxt}>{distLabel}</Text>
              </View>
            )}
            <View style={[styles.statusDot, tone.dot]} />
          </View>
        </View>

        <View style={styles.row}>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={[styles.hours, tone.text]} numberOfLines={1}>
            {statusText}
          </Text>
        </View>

        {activeCert && (
          <View style={styles.certRow}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
            <Text style={styles.certText}>
              {activeCert.kosherLevel.map((l) => KOSHER_LABELS[l] ?? l).join(' · ')}
              {' — '}{activeCert.issuedBy}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {business.phone && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${business.phone}`)}>
              <Ionicons name="call-outline" size={16} color={Colors.kosher} />
              <Text style={styles.actionText}>חייג</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.mapsBtn} onPress={() => navigateTo({ latitude: business.latitude, longitude: business.longitude, address: business.address })}>
            <Ionicons name="map-outline" size={16} color={Colors.kosher} />
            <Text style={styles.mapsText}>ניווט</Text>
          </TouchableOpacity>
          {business.website && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(business.website!)}>
              <Ionicons name="globe-outline" size={16} color={Colors.kosher} />
              <Text style={styles.actionText}>אתר</Text>
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity style={styles.pinBtn} onPress={() => setEditingLoc(true)}>
              <Ionicons name={business.latitude ? 'location' : 'location-outline'} size={16} color={Colors.warning} />
              <Text style={styles.pinText}>{business.latitude ? 'עריכת מיקום' : 'הוסף מיקום'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      <LocationEditModal
        visible={editingLoc}
        name={business.name}
        address={business.address}
        latitude={business.latitude}
        longitude={business.longitude}
        onSave={(lat, lon) => updateBusiness(business.id, { latitude: lat, longitude: lon })}
        onClear={() => updateBusiness(business.id, { latitude: undefined, longitude: undefined })}
        onClose={() => setEditingLoc(false)}
      />
      {navSheet}
    </>
  );
}

const styles = StyleSheet.create({
  card:          { ...CardShell },
  alertBanner:   { backgroundColor: Colors.warning, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: Spacing.sm },
  alertText:     { color: Colors.white, fontSize: 12, fontWeight: '600', flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  emoji:         { fontSize: 28 },
  headerInfo:    { flex: 1 },
  name:          { fontSize: 16, fontWeight: '700', color: Colors.text },
  address:       { fontSize: 12, color: Colors.textSecondary },
  tags:          { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  headerRight:   { alignItems: 'flex-end', gap: 4 },
  distBadge:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  distTxt:       { fontSize: 11, fontWeight: '700', color: Colors.kosher },
  statusDot:     { width: 10, height: 10, borderRadius: 5 },
  dotOpen:       { backgroundColor: Colors.success },
  dotClosed:     { backgroundColor: Colors.danger },
  dotUnknown:    { backgroundColor: Colors.border },
  dotLater:      { backgroundColor: Colors.goldDeep },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hours:         { fontSize: 13, color: Colors.textSecondary },
  hoursClosed:   { color: Colors.danger },
  hoursUnknown:  { color: Colors.textMuted },
  hoursOpen:     { color: Colors.success },
  hoursLater:    { color: Colors.goldDeep },
  certRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: '#EAF7EE', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5 },
  certText:      { fontSize: 12, color: Colors.success, fontWeight: '500', flex: 1 },
  actions:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.kosher },
  actionText:    { fontSize: 13, color: Colors.kosher, fontWeight: '600' },
  mapsBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.kosher, backgroundColor: Colors.kosher + '14' },
  mapsText:      { fontSize: 13, color: Colors.kosher, fontWeight: '700' },
  pinBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.warning, borderStyle: 'dashed' },
  pinText:       { fontSize: 13, color: Colors.warning, fontWeight: '600' },
});
