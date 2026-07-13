import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform,
} from 'react-native';
import MapView, { Marker, MapPressEvent, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius } from '../utils/theme';

// Default center: Ma'ale Adumim
const DEFAULT_REGION: Region = {
  latitude: 31.7767,
  longitude: 35.2988,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

interface Props {
  visible: boolean;
  initialLat?: number;
  initialLon?: number;
  onConfirm: (lat: number, lon: number) => void;
  onClose: () => void;
}

export default function MapPickerModal({ visible, initialLat, initialLon, onConfirm, onClose }: Props) {
  const mapRef = useRef<MapView>(null);
  const [pin, setPin]         = useState<{ lat: number; lon: number } | null>(
    initialLat && initialLon ? { lat: initialLat, lon: initialLon } : null
  );
  const [locating, setLocating] = useState(false);

  // When modal opens, re-sync with incoming props
  useEffect(() => {
    if (visible) {
      const next = initialLat && initialLon ? { lat: initialLat, lon: initialLon } : null;
      setPin(next);
      if (next) {
        mapRef.current?.animateToRegion({
          latitude: next.lat, longitude: next.lon,
          latitudeDelta: 0.01, longitudeDelta: 0.01,
        }, 400);
      }
    }
  }, [visible]);

  function handleMapPress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPin({ lat: latitude, lon: longitude });
  }

  async function goToMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setPin({ lat: latitude, lon: longitude });
      mapRef.current?.animateToRegion({
        latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005,
      }, 500);
    } finally {
      setLocating(false);
    }
  }

  function handleConfirm() {
    if (pin) onConfirm(pin.lat, pin.lon);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={s.title}>בחר מיקום</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={s.hint}>לחץ על המפה להצבת סיכה</Text>

        {/* Map */}
        <View style={s.mapContainer}>
          <MapView
            ref={mapRef}
            style={s.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={
              initialLat && initialLon
                ? { latitude: initialLat, longitude: initialLon, latitudeDelta: 0.01, longitudeDelta: 0.01 }
                : DEFAULT_REGION
            }
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {pin && (
              <Marker
                coordinate={{ latitude: pin.lat, longitude: pin.lon }}
                draggable
                onDragEnd={(e) => {
                  const { latitude, longitude } = e.nativeEvent.coordinate;
                  setPin({ lat: latitude, lon: longitude });
                }}
              />
            )}
          </MapView>

          {/* My location button */}
          <TouchableOpacity style={s.myLocBtn} onPress={goToMyLocation} disabled={locating}>
            {locating
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="navigate" size={20} color={Colors.primary} />}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {pin ? (
            <Text style={s.coords}>
              {pin.lat.toFixed(6)},  {pin.lon.toFixed(6)}
            </Text>
          ) : (
            <Text style={s.coordsEmpty}>לא נבחר מיקום</Text>
          )}
          <TouchableOpacity
            style={[s.confirmBtn, !pin && s.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!pin}
          >
            <Ionicons name="checkmark" size={18} color={Colors.white} />
            <Text style={s.confirmText}>אשר מיקום</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.background },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.sm, backgroundColor: Colors.cardBackground, borderBottomWidth: 1, borderBottomColor: Colors.border },
  closeBtn:         { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:            { fontSize: 17, fontWeight: '800', color: Colors.text },
  hint:             { textAlign: 'center', fontSize: 13, color: Colors.textSecondary, paddingVertical: 8, backgroundColor: Colors.cardBackground },
  mapContainer:     { flex: 1 },
  map:              { flex: 1 },
  myLocBtn:         { position: 'absolute', bottom: 16, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardBackground, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  footer:           { backgroundColor: Colors.cardBackground, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  coords:           { flex: 1, fontSize: 13, color: Colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
  coordsEmpty:      { flex: 1, fontSize: 13, color: Colors.textMuted },
  confirmBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 20, paddingVertical: 12 },
  confirmBtnDisabled: { backgroundColor: Colors.border },
  confirmText:      { fontSize: 15, fontWeight: '700', color: Colors.white },
});
