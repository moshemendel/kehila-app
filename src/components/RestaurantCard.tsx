import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { Restaurant } from '../types';
import { updateRestaurant, restaurantCategories, CATEGORY_ICONS, CATEGORY_LABELS } from '../services/restaurants';
import LocationEditModal from './LocationEditModal';

const KOSHER_LABELS: Record<string, string> = {
  mehadrin: 'מהדרין', regular: 'רגיל', chalav_israel: 'חלב ישראל',
  bishul_israel: 'בישול ישראל', glatt: 'גלאט',
};

interface Props {
  restaurant: Restaurant;
  distLabel?: string;
  canManage?: boolean;
  onPress?: () => void;
  cardStyle?: any;
}

function getTodayHours(restaurant: Restaurant): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()] as keyof typeof restaurant.openingHours;
  return restaurant.openingHours[today] ?? '—';
}

function openMaps(address: string, lat?: number, lon?: number) {
  const url = lat && lon
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  Linking.openURL(url);
}

export default function RestaurantCard({ restaurant, distLabel, canManage, onPress, cardStyle }: Props) {
  const todayHours    = getTodayHours(restaurant);
  const isClosedToday = todayHours.toLowerCase() === 'closed' || todayHours === 'סגור';
  const activeCert    = restaurant.kosherCertificates.find((c) => c.isActive);
  const cats          = restaurantCategories(restaurant);
  const bizTypeLabel  = restaurant.businessType === 'factory' ? '🏭 מפעל' : '🍴 בית אוכל';
  const [editingLoc, setEditingLoc] = useState(false);

  return (
    <>
      <TouchableOpacity style={[styles.card, cardStyle]} onPress={onPress} activeOpacity={0.85}>
        {restaurant.activeAlert && (
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={14} color={Colors.white} />
            <Text style={styles.alertText}>{restaurant.activeAlert}</Text>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.emoji}>{CATEGORY_ICONS[cats[0]] ?? '🍽️'}</Text>
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{restaurant.name}</Text>
            <Text style={styles.address}>{restaurant.address}</Text>
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
            <View style={[styles.statusDot, isClosedToday ? styles.dotClosed : styles.dotOpen]} />
          </View>
        </View>

        <View style={styles.row}>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={[styles.hours, isClosedToday && styles.hoursClosed]}>
            {isClosedToday ? 'סגור היום' : todayHours}
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
          {restaurant.phone && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}>
              <Ionicons name="call-outline" size={16} color={Colors.kosher} />
              <Text style={styles.actionText}>חייג</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.mapsBtn} onPress={() => openMaps(restaurant.address, restaurant.latitude, restaurant.longitude)}>
            <Ionicons name="map-outline" size={16} color={Colors.kosher} />
            <Text style={styles.mapsText}>ניווט</Text>
          </TouchableOpacity>
          {restaurant.website && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(restaurant.website!)}>
              <Ionicons name="globe-outline" size={16} color={Colors.kosher} />
              <Text style={styles.actionText}>אתר</Text>
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity style={styles.pinBtn} onPress={() => setEditingLoc(true)}>
              <Ionicons name={restaurant.latitude ? 'location' : 'location-outline'} size={16} color={Colors.warning} />
              <Text style={styles.pinText}>{restaurant.latitude ? 'עריכת מיקום' : 'הוסף מיקום'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      <LocationEditModal
        visible={editingLoc}
        name={restaurant.name}
        address={restaurant.address}
        latitude={restaurant.latitude}
        longitude={restaurant.longitude}
        onSave={(lat, lon) => updateRestaurant(restaurant.id, { latitude: lat, longitude: lon })}
        onClear={() => updateRestaurant(restaurant.id, { latitude: undefined, longitude: undefined })}
        onClose={() => setEditingLoc(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card:          { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.card },
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
  row:           { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hours:         { fontSize: 13, color: Colors.textSecondary },
  hoursClosed:   { color: Colors.danger },
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
