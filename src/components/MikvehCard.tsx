import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { Mikveh } from '../types';
import { updateMikveh } from '../services/mikvaot';
import LocationEditModal from './LocationEditModal';

const TYPE_LABELS: Record<string, string> = {
  women: 'נשים', men: 'גברים', both: 'גברים ונשים',
};

interface Props {
  mikveh: Mikveh;
  distLabel?: string;
  canManage?: boolean;
  onPress?: () => void;
  cardStyle?: any;
}

function getTodayHours(mikveh: Mikveh): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()] as keyof typeof mikveh.openingHours;
  return mikveh.openingHours[today] ?? '—';
}

function openMaps(address: string, lat?: number, lon?: number) {
  const url = lat && lon
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  Linking.openURL(url);
}

export default function MikvehCard({ mikveh, distLabel, canManage, onPress, cardStyle }: Props) {
  const todayHours = getTodayHours(mikveh);
  const [editingLoc, setEditingLoc] = useState(false);

  return (
    <>
      <TouchableOpacity style={[styles.card, cardStyle]} onPress={onPress} activeOpacity={0.85}>
        <View style={styles.header}>
          <Text style={styles.emoji}>💧</Text>
          <View style={styles.info}>
            <Text style={styles.name}>{mikveh.name}</Text>
            <Text style={styles.type}>{TYPE_LABELS[mikveh.type]}</Text>
            <Text style={styles.address}>{mikveh.address}</Text>
          </View>
          {distLabel && (
            <View style={styles.distBadge}>
              <Ionicons name="navigate-outline" size={10} color={Colors.mikveh} />
              <Text style={styles.distTxt}>{distLabel}</Text>
            </View>
          )}
        </View>

        <View style={styles.row}>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.hours}>היום: {todayHours}</Text>
        </View>

        {mikveh.requiresAppointment && (
          <View style={styles.apptRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.warning} />
            <Text style={styles.apptText}>נדרשת הזמנה מראש</Text>
          </View>
        )}

        {mikveh.notes && <Text style={styles.notes}>{mikveh.notes}</Text>}

        <View style={styles.actions}>
          {mikveh.phone && (
            <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${mikveh.phone}`)}>
              <Ionicons name="call-outline" size={16} color={Colors.white} />
              <Text style={styles.callText}>{mikveh.phone}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.mapsBtn} onPress={() => openMaps(mikveh.address, mikveh.latitude, mikveh.longitude)}>
            <Ionicons name="map-outline" size={16} color="#1A73E8" />
            <Text style={styles.mapsText}>ניווט</Text>
          </TouchableOpacity>
          {canManage && (
            <TouchableOpacity style={styles.pinBtn} onPress={() => setEditingLoc(true)}>
              <Ionicons name={mikveh.latitude ? 'location' : 'location-outline'} size={16} color={Colors.warning} />
              <Text style={styles.pinText}>{mikveh.latitude ? 'עריכת מיקום' : 'הוסף מיקום'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      <LocationEditModal
        visible={editingLoc}
        name={mikveh.name}
        address={mikveh.address}
        latitude={mikveh.latitude}
        longitude={mikveh.longitude}
        onSave={(lat, lon) => updateMikveh(mikveh.id, { latitude: lat, longitude: lon })}
        onClear={() => updateMikveh(mikveh.id, { latitude: undefined, longitude: undefined })}
        onClose={() => setEditingLoc(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card:      { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.card },
  header:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  emoji:     { fontSize: 30 },
  info:      { flex: 1 },
  name:      { fontSize: 16, fontWeight: '700', color: Colors.text },
  type:      { fontSize: 12, color: Colors.mikveh, fontWeight: '600', marginBottom: 2 },
  address:   { fontSize: 12, color: Colors.textSecondary },
  distBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  distTxt:   { fontSize: 11, fontWeight: '700', color: Colors.mikveh },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hours:     { fontSize: 13, color: Colors.textSecondary },
  apptRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF5E7', borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 5, marginTop: 4 },
  apptText:  { fontSize: 12, color: Colors.warning, fontWeight: '600' },
  notes:     { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.sm, fontStyle: 'italic' },
  actions:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  callBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.mikveh, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  callText:  { color: Colors.white, fontWeight: '700', fontSize: 14 },
  mapsBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: '#1A73E8', backgroundColor: '#E8F0FE' },
  mapsText:  { fontSize: 13, color: '#1A73E8', fontWeight: '700' },
  pinBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.warning, borderStyle: 'dashed' },
  pinText:   { fontSize: 13, color: Colors.warning, fontWeight: '600' },
});
