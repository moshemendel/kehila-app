import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, Keyboard,
} from 'react-native';
import MapView, { Marker, MapPressEvent, PROVIDER_GOOGLE, Region, MapType } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius } from '../utils/theme';
import { geocodeAddress, GeocodeUnavailable } from '../utils/geocodeAddress';

// Last-resort centre when neither an existing pin nor a city centre is known.
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
  /** Prefills the search box, so the usual case is one tap on "אתר". */
  address?: string;
  /** City name and centre — scopes the search and rejects far-away hits. */
  cityName?: string;
  cityLat?: number;
  cityLon?: number;
  onConfirm: (lat: number, lon: number) => void;
  onClose: () => void;
}

export default function MapPickerModal({
  visible, initialLat, initialLon, address, cityName, cityLat, cityLon, onConfirm, onClose,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [pin, setPin]         = useState<{ lat: number; lon: number } | null>(
    initialLat && initialLon ? { lat: initialLat, lon: initialLon } : null
  );
  const [locating, setLocating] = useState(false);
  // Satellite by default. The whole reason this picker exists is streets the
  // vector map doesn't have — opening on that empty map would hide the very
  // buildings the user is trying to point at. Hybrid rather than plain
  // satellite, so the streets that ARE mapped keep their labels.
  /**
   * The map type currently on screen. Starts as streets and is switched to
   * satellite shortly after opening — deliberately, in that order.
   *
   * Android ignores mapType when it arrives in the map's first render; it only
   * honours the value as a prop UPDATE. So the map must mount as 'standard' and
   * be changed afterwards. (Remounting with key= is no help — that just sets it
   * at mount again. onMapReady is no help either: it is unreliable on Android,
   * and gating on it strands devices where it never fires.)
   *
   * ONE piece of state, not two. An earlier version tracked "requested" and
   * "applied" separately, and the open-handler below reset "applied" — so every
   * re-run of that effect stomped the satellite back to streets a frame after it
   * appeared. The latch ref makes the switch happen once per opening and gives
   * nothing else a way to undo it.
   *
   * If satellite ever appears blank again, check the BUILD before touching this
   * code. Verified on-device 2026-08-14: logcat showed the SDK entering hybrid
   * correctly ("Indoor is no longer supported on satellite, hybrid and terrain
   * map types" is only emitted in those modes) with no authorization failure,
   * yet no imagery rendered — because the installed APK was three weeks old and
   * carried an API key from a previous Cloud project. The symptom of a stale or
   * wrong key is a working vector map with no imagery, NOT the blank grey grid
   * people expect, which is what makes it look like a rendering bug.
   */
  const [mapType, setMapType]     = useState<MapType>('standard');
  const primed                    = useRef(false);
  const [search, setSearch]       = useState('');
  const [seeking, setSeeking]     = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  // When modal opens, re-sync with incoming props
  useEffect(() => {
    if (visible) {
      const next = initialLat && initialLon ? { lat: initialLat, lon: initialLon } : null;
      setPin(next);
      setSearch(address ?? '');
      setSearchMsg(null);
      if (next) {
        mapRef.current?.animateToRegion({
          latitude: next.lat, longitude: next.lon,
          latitudeDelta: 0.01, longitudeDelta: 0.01,
        }, 400);
      }
    }
  }, [visible, address]);

  // Switch to satellite once per opening, a beat after the native map exists.
  // The ref latch means this cannot re-fire and cannot fight the user's toggle.
  useEffect(() => {
    if (!visible) { primed.current = false; return; }
    if (primed.current) return;
    primed.current = true;
    const t = setTimeout(() => setMapType('hybrid'), 300);
    return () => clearTimeout(t);
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

  /** Find the typed address and drop the pin on it. */
  async function locateAddress() {
    const q = search.trim();
    if (!q || seeking) return;
    Keyboard.dismiss();
    setSeeking(true);
    setSearchMsg(null);
    try {
      const hits = await geocodeAddress(q, { cityName, latitude: cityLat, longitude: cityLon });
      if (hits.length === 0) {
        // Routine, not exceptional: newer streets are in no address database
        // yet. Say what to do instead of only reporting failure.
        setSearchMsg('הכתובת לא נמצאה. אפשר ללחוץ ישירות על המפה — בתצוגת לוויין רואים את הבניינים.');
        return;
      }
      const best = hits[0];
      setPin({ lat: best.latitude, lon: best.longitude });
      mapRef.current?.animateToRegion({
        latitude: best.latitude, longitude: best.longitude,
        latitudeDelta: 0.004, longitudeDelta: 0.004,
      }, 500);
      setSearchMsg(hits.length > 1
        ? 'נמצאו כמה תוצאות — הוצגה הקרובה ביותר. אפשר לתקן בלחיצה על המפה.'
        : null);
    } catch (e) {
      setSearchMsg(e instanceof GeocodeUnavailable
        ? 'שירות איתור הכתובות אינו זמין במכשיר. יש לבחור מהמפה.'
        : 'שגיאה באיתור הכתובת. יש לבחור מהמפה.');
    } finally {
      setSeeking(false);
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

        {/* Address search — same affordance as the dashboard's "אתר" button */}
        <View style={s.searchBar}>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={(v) => { setSearch(v); setSearchMsg(null); }}
            placeholder="כתובת לאיתור"
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            returnKeyType="search"
            onSubmitEditing={locateAddress}
          />
          <TouchableOpacity
            style={[s.seekBtn, (!search.trim() || seeking) && s.seekBtnOff]}
            onPress={locateAddress}
            disabled={!search.trim() || seeking}
          >
            {seeking
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="search" size={16} color={Colors.primary} />}
            <Text style={s.seekTxt}>אתר</Text>
          </TouchableOpacity>
        </View>
        {searchMsg
          ? <Text style={s.searchMsg}>{searchMsg}</Text>
          : <Text style={s.hint}>לחץ על המפה להצבת סיכה</Text>}

        {/* Map */}
        <View style={s.mapContainer}>
          <MapView
            ref={mapRef}
            style={s.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={
              initialLat && initialLon
                ? { latitude: initialLat, longitude: initialLon, latitudeDelta: 0.01, longitudeDelta: 0.01 }
                // A new listing has no coordinates yet, so open on the city being
                // edited rather than the hardcoded pilot city — otherwise adding a
                // place in any other city starts the user 100km from the answer.
                : (cityLat != null && cityLon != null
                    ? { latitude: cityLat, longitude: cityLon, latitudeDelta: 0.05, longitudeDelta: 0.05 }
                    : DEFAULT_REGION)
            }
            onPress={handleMapPress}
            mapType={mapType}
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

          {/* Satellite <-> streets, mirroring the dashboard's toggle */}
          <TouchableOpacity
            style={s.layerBtn}
            onPress={() => setMapType((t) => (t === 'hybrid' ? 'standard' : 'hybrid'))}
          >
            <Ionicons name="layers-outline" size={15} color={Colors.text} />
            <Text style={s.layerTxt}>{mapType === 'hybrid' ? 'רחובות' : 'לוויין'}</Text>
          </TouchableOpacity>

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
  searchBar:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, backgroundColor: Colors.cardBackground },
  searchInput:      { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  seekBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 9 },
  seekBtnOff:       { opacity: 0.45 },
  seekTxt:          { fontSize: 13, fontWeight: '700', color: Colors.primary },
  searchMsg:        { fontSize: 12, color: Colors.warning, paddingHorizontal: Spacing.md, paddingVertical: 8, backgroundColor: Colors.cardBackground, lineHeight: 17 },
  layerBtn:         { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  layerTxt:         { fontSize: 12, fontWeight: '700', color: Colors.text },
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
