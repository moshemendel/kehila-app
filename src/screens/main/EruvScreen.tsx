import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ScrollView, ActivityIndicator, Alert, Animated, Pressable, PanResponder,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Polygon, Region, MapPressEvent, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEruvStatus } from '../../hooks/useEruv';
import { useCityId } from '../../hooks/useCityId';
import { useCity } from '../../hooks/useCity';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { submitEruvReport, getEruvPolygons } from '../../services/eruv';
import { useAnalyticsTrack } from '../../services/analytics';
import { sendPushToRoles } from '../../services/pushNotifications';
import { uploadImage } from '../../utils/uploadImage';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { EruvCoordinate } from '../../types';

const DEFAULT_REGION: Region = {
  latitude: 31.7767, longitude: 35.2988, latitudeDelta: 0.03, longitudeDelta: 0.03,
};
const MAP_STYLE = [
  { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function EruvScreen() {
  useAnalyticsTrack('eruv');
  const { top, bottom } = useSafeAreaInsets();
  const cityId  = useCityId();
  const { city }    = useCity(cityId);
  const { appUser } = useAuth();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { status, loading } = useEruvStatus(cityId, focused);

  // ── Form state ────────────────────────────────────────────────────
  const [reportOpen,    setReportOpen]    = useState(false);
  const [reportType,    setReportType]    = useState<'breach' | 'question'>('breach');
  const [description,   setDescription]   = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);

  // ── Attachment state ──────────────────────────────────────────────
  const [userLocation, setUserLocation] = useState<EruvCoordinate | null>(null);
  const [locLoading,   setLocLoading]   = useState(false);
  const [photoUri,     setPhotoUri]     = useState<string | null>(null);

  // ── Popup state ───────────────────────────────────────────────────
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [photoPickerOpen,    setPhotoPickerOpen]    = useState(false);
  const [mapPinMode,         setMapPinMode]         = useState(false);
  const [mapPinPreview,      setMapPinPreview]      = useState<EruvCoordinate | null>(null);

  const mapRef   = useRef<MapView>(null);
  const cardAnim = useRef(new Animated.Value(600)).current;

  // ── PanResponder for swipe-to-dismiss ────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:       () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) cardAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 1) {
          // swipe far enough → close
          Animated.spring(cardAnim, { toValue: 600, useNativeDriver: true, bounciness: 0, speed: 20 })
            .start(() => {
              setReportOpen(false);
              resetForm();
            });
        } else {
          // snap back
          Animated.spring(cardAnim, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 18 }).start();
        }
      },
    })
  ).current;

  // ── Map initial region ────────────────────────────────────────────
  const eruvPolygons = useMemo(() => getEruvPolygons(status), [status]);

  const initialRegion = useMemo<Region>(() => {
    const allPoints = eruvPolygons.flat();
    if (!allPoints.length) {
      if (city) return { latitude: city.latitude, longitude: city.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 };
      return DEFAULT_REGION;
    }
    const lats = allPoints.map((p) => p.latitude);
    const lons = allPoints.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.02),
      longitudeDelta: Math.max((maxLon - minLon) * 1.6, 0.02),
    };
  }, [city, eruvPolygons]);

  useEffect(() => {
    const allPoints = eruvPolygons.flat();
    if (!allPoints.length) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(allPoints, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [eruvPolygons]);

  // ── Card open / close ─────────────────────────────────────────────
  function openReport() {
    cardAnim.setValue(600);
    setReportOpen(true);
  }

  useEffect(() => {
    if (reportOpen) {
      Animated.spring(cardAnim, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 14 }).start();
    }
  }, [reportOpen]);

  function resetForm() {
    setDescription('');
    setUserLocation(null);
    setPhotoUri(null);
    setPhotoProgress(null);
    setReportType('breach');
    setLocationPickerOpen(false);
    setPhotoPickerOpen(false);
  }

  function closeReport() {
    setLocationPickerOpen(false);
    setPhotoPickerOpen(false);
    Animated.spring(cardAnim, { toValue: 600, useNativeDriver: true, bounciness: 0, speed: 20 })
      .start(() => { setReportOpen(false); resetForm(); });
  }

  // ── Map pin mode ──────────────────────────────────────────────────
  function enterMapPinMode() {
    setLocationPickerOpen(false);
    setMapPinMode(true);
    setMapPinPreview(null);
  }

  function exitMapPinMode(coord?: EruvCoordinate) {
    setMapPinMode(false);
    setMapPinPreview(null);
    if (coord) setUserLocation(coord);
  }

  function handleMapPress(e: MapPressEvent) {
    if (!mapPinMode) return;
    const coord = e.nativeEvent.coordinate;
    if (!coord) return;
    setMapPinPreview(coord);
  }

  // ── Location: GPS ─────────────────────────────────────────────────
  async function getGPSLocation() {
    setLocationPickerOpen(false);
    setLocLoading(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') { Alert.alert('הרשאה נדחתה', 'יש לאפשר גישה למיקום'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לקבל מיקום');
    } finally {
      setLocLoading(false);
    }
  }

  // ── Photo picker ──────────────────────────────────────────────────
  async function pickPhoto(source: 'camera' | 'gallery') {
    setPhotoPickerOpen(false);
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('הרשאה נדחתה', source === 'camera' ? 'יש לאפשר גישה למצלמה' : 'יש לאפשר גישה לגלריה');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
    if (result.canceled || !result.assets?.[0]) return;
    setPhotoUri(result.assets[0].uri);
  }

  // ── Submit ────────────────────────────────────────────────────────
  async function handleSubmitReport() {
    if (!description.trim()) { Alert.alert('שגיאה', 'אנא הכנס תיאור'); return; }
    if (!appUser)             { Alert.alert('שגיאה', 'יש להתחבר כדי לדווח'); return; }
    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (photoUri) {
        setPhotoProgress(0);
        imageUrl = await uploadImage(
          photoUri,
          `eruvReports/${appUser.uid}/${Date.now()}.jpg`,
          (pct) => setPhotoProgress(pct),
        );
        setPhotoProgress(null);
      }
      await submitEruvReport({
        cityId,
        userId: appUser.uid,
        userDisplayName: appUser.displayName,
        type: reportType,
        description: description.trim(),
        ...(userLocation ? { userLocation } : {}),
        ...(imageUrl     ? { imageUrl }     : {}),
      });
      closeReport();
      Alert.alert('תודה', 'הדיווח נשלח למנהל העירוב');
      const typeLabel = reportType === 'breach' ? '⚠️ פרצה בעירוב' : '❓ שאלה על עירוב';
      sendPushToRoles(
        cityId,
        ['eruv_manager', 'city_admin'],
        typeLabel,
        description.trim().slice(0, 120),
      ).catch(() => {});
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────
  const isValid     = status?.status === 'valid';
  const isInvalid   = status?.status === 'invalid';
  const statusColor = isValid ? Colors.success : isInvalid ? Colors.danger : Colors.gold;
  const statusLabel = isValid ? 'העירוב כשר'  : isInvalid ? 'העירוב פגום'  : 'מצב לא ידוע';
  const statusIcon  = isValid ? 'checkmark-circle' : isInvalid ? 'alert-circle' : 'help-circle';

  // ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: top + 16, backgroundColor: statusColor }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>עירוב</Text>
            {!loading && (
              <View style={s.statusRow}>
                <Ionicons name={statusIcon as any} size={18} color={Colors.white} />
                <Text style={s.statusText}>{statusLabel}</Text>
              </View>
            )}
          </View>
          {!loading && status?.updatedAt && (
            <Text style={s.updatedText}>עודכן לאחרונה</Text>
          )}
        </View>
        {!loading && status?.notes ? <Text style={s.notesText}>{status.notes}</Text> : null}
      </View>

      {/* ── Map ─────────────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={Colors.gold} style={{ marginTop: 60 }} size="large" />
      ) : (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton={!mapPinMode}
            customMapStyle={MAP_STYLE}
            onPress={mapPinMode ? handleMapPress : undefined}
          >
            {eruvPolygons.filter(p => p.length > 2).map((poly, i) => (
              <Polygon
                key={i}
                coordinates={poly}
                strokeColor={statusColor}
                fillColor={statusColor + '22'}
                strokeWidth={3}
              />
            ))}
            {mapPinPreview && (
              <Marker coordinate={mapPinPreview} pinColor={Colors.primary} tracksViewChanges={false} />
            )}
          </MapView>

          {/* No polygon hint */}
          {eruvPolygons.every(p => p.length < 3) && !mapPinMode && !reportOpen && (
            <View style={s.noPolygon}>
              <Ionicons name="map-outline" size={36} color={Colors.textMuted} />
              <Text style={s.noPolygonText}>גבולות העירוב טרם הוגדרו</Text>
            </View>
          )}

          {/* Map pin mode hint banner */}
          {mapPinMode && (
            <View style={[s.mapPinBanner, { top: 14 }]}>
              <Ionicons name="location-outline" size={17} color={Colors.white} />
              <Text style={s.mapPinBannerText}>לחץ על המפה לסימון המיקום</Text>
            </View>
          )}

          {/* Report button */}
          {appUser && !reportOpen && !mapPinMode && (
            <View style={[s.reportBtnWrap, { bottom: bottom + 24 }]}>
              <TouchableOpacity style={s.reportBtn} onPress={openReport} activeOpacity={0.85}>
                <Ionicons name="flag-outline" size={20} color={Colors.white} />
                <Text style={s.reportBtnText}>דווח על בעיה / שאלה</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Backdrop — tap outside card to close */}
          {reportOpen && !mapPinMode && (
            <Pressable style={[StyleSheet.absoluteFillObject, s.backdrop]} onPress={closeReport} />
          )}

          {/* ── Floating report card ─────────────────────────────── */}
          {reportOpen && (
            <Animated.View
              style={[s.card, { bottom: bottom + 12, transform: [{ translateY: cardAnim }] }]}
            >
              {/* Map-pin confirm/cancel strip */}
              {mapPinMode ? (
                <View style={s.mapPinStrip}>
                  <TouchableOpacity
                    style={s.mapPinConfirmBtn}
                    onPress={() => mapPinPreview && exitMapPinMode(mapPinPreview)}
                    disabled={!mapPinPreview}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.mapPinConfirmText, !mapPinPreview && { opacity: 0.4 }]}>
                      {mapPinPreview ? 'אשר מיקום' : 'לחץ על המפה...'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.mapPinCancelBtn} onPress={() => exitMapPinMode()} activeOpacity={0.8}>
                    <Text style={s.mapPinCancelText}>ביטול</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* ── Full form ────────────────────────────────────── */
                <>
                  {/* Drag handle — gesture lives here only */}
                  <View {...panResponder.panHandlers} style={s.dragArea}>
                    <View style={s.handle} />
                    <Text style={s.cardTitle}>דיווח לממונה על העירוב</Text>
                  </View>

                  {/* Scrollable: type selector + description + photo preview */}
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    contentContainerStyle={s.scrollContent}
                  >
                    {/* Type selector */}
                    <View style={s.typeRow}>
                      <TouchableOpacity
                        style={[s.typeBtn, reportType === 'breach' && s.typeBtnBreach]}
                        onPress={() => setReportType('breach')}
                      >
                        <Ionicons name="warning-outline" size={15}
                          color={reportType === 'breach' ? Colors.white : Colors.danger} />
                        <Text style={[s.typeBtnText, reportType === 'breach' && s.typeBtnTextActive]}>
                          דיווח על פרצה
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.typeBtn, s.typeBtnQ, reportType === 'question' && s.typeBtnQActive]}
                        onPress={() => setReportType('question')}
                      >
                        <Ionicons name="help-circle-outline" size={15}
                          color={reportType === 'question' ? Colors.white : Colors.gold} />
                        <Text style={[s.typeBtnText, reportType === 'question' && s.typeBtnTextActive]}>
                          שאלה
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Description */}
                    <TextInput scrollEnabled={false}
                      style={s.descInput}
                      placeholder={reportType === 'breach' ? 'תאר את מיקום הפרצה או הבעיה...' : 'כתוב את שאלתך...'}
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      textAlign="right"
                      placeholderTextColor={Colors.textMuted}
                    />

                    {/* Photo preview */}
                    {photoUri && (
                      <View style={s.photoWrap}>
                        <Image source={{ uri: photoUri }} style={s.photoThumb} resizeMode="cover" />
                        {photoProgress !== null && (
                          <View style={s.photoOverlay}>
                            <ActivityIndicator color={Colors.white} />
                            <Text style={s.photoProgressTxt}>{photoProgress}%</Text>
                          </View>
                        )}
                        <TouchableOpacity style={s.photoRemove} onPress={() => setPhotoUri(null)}>
                          <Ionicons name="close-circle" size={22} color={Colors.white} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>

                  {/* ── Fixed bottom: attach row + submit ─────────── */}
                  <View style={s.fixedBottom}>
                    {/* Attach row */}
                    <View style={s.attachRow}>
                      <TouchableOpacity
                        style={[s.attachBtn,
                          userLocation  && s.attachBtnDone,
                          locationPickerOpen && !userLocation && s.attachBtnOpen]}
                        onPress={() => {
                          if (userLocation) { setUserLocation(null); return; }
                          setLocationPickerOpen((v) => !v);
                          setPhotoPickerOpen(false);
                        }}
                        disabled={locLoading}
                        activeOpacity={0.75}
                      >
                        {locLoading
                          ? <ActivityIndicator size="small" color={Colors.primary} />
                          : <Ionicons
                              name={userLocation ? 'location' : 'location-outline'}
                              size={17}
                              color={userLocation ? Colors.white : Colors.primary}
                            />}
                        <Text style={[s.attachBtnText, userLocation && s.attachBtnTextDone]}>
                          {userLocation ? 'מיקום ✓' : 'הוסף מיקום'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[s.attachBtn,
                          photoUri  && s.attachBtnDone,
                          photoPickerOpen && !photoUri && s.attachBtnOpen]}
                        onPress={() => {
                          if (photoUri) { setPhotoUri(null); return; }
                          setPhotoPickerOpen((v) => !v);
                          setLocationPickerOpen(false);
                        }}
                        activeOpacity={0.75}
                      >
                        <Ionicons
                          name={photoUri ? 'image' : 'camera-outline'}
                          size={17}
                          color={photoUri ? Colors.white : Colors.primary}
                        />
                        <Text style={[s.attachBtnText, photoUri && s.attachBtnTextDone]}>
                          {photoUri ? 'תמונה ✓' : 'הוסף תמונה'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Submit / cancel */}
                    <View style={s.actions}>
                      <TouchableOpacity style={s.cancelBtn} onPress={closeReport} activeOpacity={0.8}>
                        <Text style={s.cancelBtnText}>ביטול</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.submitBtn, submitting && s.submitBtnOff]}
                        onPress={handleSubmitReport}
                        disabled={submitting}
                        activeOpacity={0.85}
                      >
                        {submitting && photoProgress !== null
                          ? <Text style={s.submitBtnText}>מעלה… {photoProgress}%</Text>
                          : submitting
                          ? <ActivityIndicator size="small" color={Colors.white} />
                          : <Text style={s.submitBtnText}>שלח דיווח</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* ── Floating option popups (absolute, above fixedBottom) ── */}
                  {locationPickerOpen && (
                    <View style={s.optionPopup}>
                      <TouchableOpacity style={s.optionRow} onPress={getGPSLocation} activeOpacity={0.75}>
                        <View style={[s.optionIcon, { backgroundColor: Colors.primary + '18' }]}>
                          <Ionicons name="navigate-outline" size={17} color={Colors.primary} />
                        </View>
                        <Text style={s.optionText}>מיקום נוכחי</Text>
                        <Ionicons name="chevron-back-outline" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                      <View style={s.optionDivider} />
                      <TouchableOpacity style={s.optionRow} onPress={enterMapPinMode} activeOpacity={0.75}>
                        <View style={[s.optionIcon, { backgroundColor: Colors.gold + '18' }]}>
                          <Ionicons name="map-outline" size={17} color={Colors.gold} />
                        </View>
                        <Text style={s.optionText}>סמן על המפה</Text>
                        <Ionicons name="chevron-back-outline" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {photoPickerOpen && (
                    <View style={s.optionPopup}>
                      <TouchableOpacity style={s.optionRow} onPress={() => pickPhoto('camera')} activeOpacity={0.75}>
                        <View style={[s.optionIcon, { backgroundColor: Colors.primary + '18' }]}>
                          <Ionicons name="camera-outline" size={17} color={Colors.primary} />
                        </View>
                        <Text style={s.optionText}>מצלמה</Text>
                        <Ionicons name="chevron-back-outline" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                      <View style={s.optionDivider} />
                      <TouchableOpacity style={s.optionRow} onPress={() => pickPhoto('gallery')} activeOpacity={0.75}>
                        <View style={[s.optionIcon, { backgroundColor: Colors.gold + '18' }]}>
                          <Ionicons name="images-outline" size={17} color={Colors.gold} />
                        </View>
                        <Text style={s.optionText}>גלריה</Text>
                        <Ionicons name="chevron-back-outline" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </Animated.View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FIXED_BOTTOM_H = 114; // attachRow (~44) + gap (10) + actions (~50) + padding top (10)

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header:      { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  headerRow:   { flexDirection: 'row', alignItems: 'flex-end' },
  title:       { fontSize: 26, fontWeight: '800', color: Colors.white },
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusText:  { fontSize: 15, fontWeight: '700', color: Colors.white },
  updatedText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', paddingBottom: 4 },
  notesText:   { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 18 },

  // Map overlays
  noPolygon:     { position: 'absolute', bottom: 140, left: 0, right: 0, alignItems: 'center', gap: 8 },
  noPolygonText: { fontSize: 14, color: Colors.textMuted, fontWeight: '500' },

  mapPinBanner: {
    position: 'absolute', left: Spacing.lg, right: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: Radius.full,
    paddingVertical: 10, paddingHorizontal: Spacing.lg,
  },
  mapPinBannerText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // Report button
  reportBtnWrap: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, alignItems: 'center' },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingVertical: 14,
    borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
  },
  reportBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // Backdrop
  backdrop: { backgroundColor: 'rgba(0,0,0,0.32)' },

  // ── Floating card ──────────────────────────────────────────────────
  card: {
    position: 'absolute', left: Spacing.sm, right: Spacing.sm,
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 18,
    maxHeight: '82%',
    overflow: 'hidden',
  },

  // Drag handle area (receives panHandlers)
  dragArea: {
    paddingTop: 10, paddingBottom: 6,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'center' },

  // Scrollable content
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 8 },

  // Type selector
  typeRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 12 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.danger,
  },
  typeBtnBreach:    { backgroundColor: Colors.danger,  borderColor: Colors.danger },
  typeBtnQ:         { borderColor: Colors.gold },
  typeBtnQActive:   { backgroundColor: Colors.gold,    borderColor: Colors.gold },
  typeBtnText:      { fontSize: 13, fontWeight: '600', color: Colors.text },
  typeBtnTextActive:{ color: Colors.white },

  // Description
  descInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.md, fontSize: 14, color: Colors.text,
    minHeight: 88, backgroundColor: Colors.background,
  },

  // Photo preview
  photoWrap: {
    marginTop: 10, height: 120, borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  photoThumb:       { width: '100%', height: '100%' },
  photoOverlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoProgressTxt: { fontSize: 12, color: Colors.white, fontWeight: '700' },
  photoRemove:      { position: 'absolute', top: 6, left: 6 },

  // Fixed bottom
  fixedBottom: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },

  // Attach row
  attachRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  attachBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '08',
  },
  attachBtnOpen: { borderColor: Colors.primary, backgroundColor: Colors.primary + '14' },
  attachBtnDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  attachBtnText:     { fontSize: 13, fontWeight: '600', color: Colors.primary },
  attachBtnTextDone: { color: Colors.white },

  // Submit row
  actions:       { flexDirection: 'row', gap: 10 },
  cancelBtn:     { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  submitBtn:     { flex: 2, paddingVertical: 13, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.primary },
  submitBtnOff:  { opacity: 0.6 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // Option popup — floats above fixedBottom
  optionPopup: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: FIXED_BOTTOM_H + 4,
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  optionRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  optionIcon:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optionText:    { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  optionDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },

  // Map-pin confirm strip
  mapPinStrip: { flexDirection: 'row', gap: 10, padding: Spacing.md },
  mapPinConfirmBtn: {
    flex: 2, paddingVertical: 14, alignItems: 'center',
    borderRadius: Radius.md, backgroundColor: Colors.primary,
  },
  mapPinConfirmText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  mapPinCancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  mapPinCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
});
