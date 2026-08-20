import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius } from '../utils/theme';
import MapPickerModal from './MapPickerModal';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';

interface Props {
  visible: boolean;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  onSave: (lat: number, lon: number) => Promise<void>;
  onClear: () => Promise<void>;
  onClose: () => void;
}

export default function LocationEditModal({
  visible, name, address, latitude, longitude, onSave, onClear, onClose,
}: Props) {
  // The city scopes the address lookup and bounds how far a hit may land from
  // the centre — without it, a bare street name can resolve in another town.
  const cityId = useCityId();
  const { city } = useCity(cityId);
  const [lat, setLat]           = useState('');
  const [lon, setLon]           = useState('');
  const [saving,   setSaving]   = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapOpen,  setMapOpen]  = useState(false);

  useEffect(() => {
    if (visible) {
      setLat(latitude?.toString() ?? '');
      setLon(longitude?.toString() ?? '');
    }
  }, [visible, latitude, longitude]);

  async function useGPS() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('הרשאת מיקום', 'יש לאפשר גישה למיקום בהגדרות');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(pos.coords.latitude.toFixed(6));
      setLon(pos.coords.longitude.toFixed(6));
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לקבל מיקום GPS');
    } finally {
      setLocating(false);
    }
  }

  function handleMapConfirm(pickedLat: number, pickedLon: number) {
    setLat(pickedLat.toFixed(6));
    setLon(pickedLon.toFixed(6));
    setMapOpen(false);
  }

  async function handleSave() {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      Alert.alert('שגיאה', 'יש להזין קואורדינטות תקינות');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsedLat, parsedLon);
      onClose();
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור מיקום');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    Alert.alert('מחיקת מיקום', `למחוק את המיקום של ${name}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive', onPress: async () => {
          setSaving(true);
          try { await onClear(); onClose(); }
          catch { Alert.alert('שגיאה', 'לא ניתן למחוק מיקום'); }
          finally { setSaving(false); }
        },
      },
    ]);
  }

  const parsedLat = parseFloat(lat);
  const parsedLon = parseFloat(lon);

  return (
    <>
      <BottomSheetModal
        visible={visible}
        onClose={onClose}
        maxHeight="90%"
        dimOpacity={0.45}
        sheetStyle={s.sheetPad}
        avoidKeyboard
        header={
          <View style={s.header}>
            <Text style={s.title}>עריכת מיקום</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        }
      >
        <Text style={s.subtitle}>{name}</Text>

        {/* Option 1 — GPS */}
        <TouchableOpacity style={s.gpsBtn} onPress={useGPS} disabled={locating}>
          {locating
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name="navigate" size={16} color={Colors.white} />}
          <Text style={s.gpsBtnText}>{locating ? 'מאתר מיקום...' : 'השתמש במיקום הנוכחי (GPS)'}</Text>
        </TouchableOpacity>

        <View style={s.orRow}>
          <View style={s.orLine} />
          <Text style={s.orText}>או</Text>
          <View style={s.orLine} />
        </View>

        {/* Option 2 — In-app map */}
        <TouchableOpacity style={s.mapPickerBtn} onPress={() => setMapOpen(true)}>
          <Ionicons name="map" size={18} color={Colors.primary} />
          <Text style={s.mapPickerText}>איתור כתובת ובחירה על המפה</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* Coordinate inputs */}
        <View style={s.inputRow}>
          <View style={s.inputGroup}>
            <Text style={s.label}>Latitude</Text>
            <TextInput scrollEnabled={false}
              style={s.input}
              value={lat}
              onChangeText={setLat}
              placeholder="31.776710"
              keyboardType="numbers-and-punctuation"
              textAlign="left"
              autoCorrect={false}
            />
          </View>
          <View style={s.inputGroup}>
            <Text style={s.label}>Longitude</Text>
            <TextInput scrollEnabled={false}
              style={s.input}
              value={lon}
              onChangeText={setLon}
              placeholder="35.298800"
              keyboardType="numbers-and-punctuation"
              textAlign="left"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          {(latitude || longitude) && (
            <TouchableOpacity style={s.clearBtn} onPress={handleClear} disabled={saving}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={s.clearText}>מחק מיקום</Text>
            </TouchableOpacity>
          )}
          <View style={s.spacer} />
          <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={s.cancelText}>ביטול</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={s.saveText}>{saving ? 'שומר...' : 'שמור'}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      <MapPickerModal
        visible={mapOpen}
        initialLat={!isNaN(parsedLat) ? parsedLat : undefined}
        initialLon={!isNaN(parsedLon) ? parsedLon : undefined}
        address={address}
        cityName={city?.name}
        cityLat={city?.latitude}
        cityLon={city?.longitude}
        onConfirm={handleMapConfirm}
        onClose={() => setMapOpen(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  sheetPad:       { paddingHorizontal: Spacing.lg, paddingBottom: 36 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title:          { fontSize: 18, fontWeight: '800', color: Colors.text },
  subtitle:       { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  gpsBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 13, marginBottom: Spacing.md },
  gpsBtnText:     { fontSize: 14, color: Colors.white, fontWeight: '700' },
  orRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.md },
  orLine:         { flex: 1, height: 1, backgroundColor: Colors.border },
  orText:         { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  mapPickerBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.background, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.primary, padding: 13, marginBottom: Spacing.md },
  mapPickerText:  { flex: 1, fontSize: 14, color: Colors.primary, fontWeight: '700' },
  inputRow:       { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  inputGroup:     { flex: 1 },
  label:          { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  input:          { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  actions:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer:         { flex: 1 },
  clearBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearText:      { fontSize: 13, color: Colors.danger, fontWeight: '600' },
  cancelBtn:      { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText:     { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn:        { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 24, paddingVertical: 10 },
  saveBtnDisabled:{ opacity: 0.5 },
  saveText:       { fontSize: 14, color: Colors.white, fontWeight: '700' },
});
