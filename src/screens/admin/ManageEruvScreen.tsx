import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, ActivityIndicator, Modal, Image,
} from 'react-native';
import MapView, { Polygon, Marker, MapPressEvent, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEruvStatus, useEruvReports } from '../../hooks/useEruv';
import { useCityId } from '../../hooks/useCityId';
import { useCity } from '../../hooks/useCity';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { setEruvStatus, setEruvPolygon, resolveEruvReport, getEruvPolygons } from '../../services/eruv';
import { sendPushToCity } from '../../services/pushNotifications';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { EruvCoordinate } from '../../types';

const DEFAULT_REGION: Region = {
  latitude: 31.7767, longitude: 35.2988, latitudeDelta: 0.03, longitudeDelta: 0.03,
};

type Tab          = 'status' | 'polygon' | 'reports';
type SegmentMode  = 'off' | 'selectA' | 'selectB' | 'addPoints' | 'deletePoint' | 'bridgeA' | 'bridgeB';

// Colors for each polygon (active polygon uses gold)
const POLY_COLORS = ['#1B3A6B', '#E07B00', '#2e7d32', '#7b1fa2', '#c62828'];

function areAdjacent(a: number, b: number, count: number): boolean {
  return Math.abs(a - b) === 1 || (Math.min(a, b) === 0 && Math.max(a, b) === count - 1);
}

function EditMarker({ coordinate, onPress, children }: {
  coordinate: { latitude: number; longitude: number };
  onPress: () => void;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={!ready}
      onPress={(e: any) => { e.stopPropagation?.(); onPress(); }}
    >
      {children}
    </Marker>
  );
}

export default function ManageEruvScreen() {
  const { bottom } = useSafeAreaInsets();
  const cityId = useCityId();
  const { city } = useCity(cityId);
  const { appUser } = useAuth();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { status, loading } = useEruvStatus(cityId, focused);
  const { reports } = useEruvReports(cityId, focused);

  const [activeTab, setActiveTab] = useState<Tab>('status');

  // ── Status tab ────────────────────────────────────────────────────
  const [statusValue, setStatusValue] = useState<'valid' | 'invalid'>('valid');
  const [notes, setNotes] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // ── Polygon tab ───────────────────────────────────────────────────
  const [polygons,         setPolygons]         = useState<EruvCoordinate[][]>([[]]);
  const [activePolygonIdx, setActivePolygonIdx] = useState(0);
  const [savingPolygon,    setSavingPolygon]    = useState(false);
  const [editingPolygon,   setEditingPolygon]   = useState(false);

  // Segment editing state (applies to active polygon)
  const [segmentMode,  setSegmentMode]  = useState<SegmentMode>('off');
  const [segmentA,     setSegmentA]     = useState<number | null>(null);
  const [segmentB,     setSegmentB]     = useState<number | null>(null);
  const [origSegmentA, setOrigSegmentA] = useState<number | null>(null);

  const mapRef = useRef<MapView>(null);

  const activePoints = polygons[activePolygonIdx] ?? [];

  function updateActivePolygon(fn: (pts: EruvCoordinate[]) => EruvCoordinate[]) {
    setPolygons(prev => {
      const next = [...prev];
      next[activePolygonIdx] = fn(next[activePolygonIdx] ?? []);
      return next;
    });
  }

  const allEditPoints = useMemo(() => polygons.flat().filter(p => p?.latitude != null), [polygons]);

  const initialRegion = useMemo<Region>(() => {
    const savedPolys = getEruvPolygons(status);
    const allPoints = (editingPolygon ? allEditPoints : savedPolys.flat()).filter(p => p?.latitude != null);
    if (!allPoints.length) {
      if (city) return { latitude: city.latitude, longitude: city.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 };
      return DEFAULT_REGION;
    }
    const lats = allPoints.map((p) => p.latitude);
    const lons = allPoints.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    return {
      latitude:  (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta:  Math.max((maxLat - minLat) * 1.6, 0.02),
      longitudeDelta: Math.max((maxLon - minLon) * 1.6, 0.02),
    };
  }, [city, status, allEditPoints, editingPolygon]);

  // ── Segment helpers ───────────────────────────────────────────────

  function resetSegment() {
    setSegmentMode('off');
    setSegmentA(null);
    setSegmentB(null);
    setOrigSegmentA(null);
  }

  function handleMarkerPress(i: number) {
    if (segmentMode === 'bridgeA') {
      setSegmentA(i);
      setSegmentMode('bridgeB');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }
    if (segmentMode === 'bridgeB') {
      if (i === segmentA) { setSegmentA(null); setSegmentMode('bridgeA'); return; }
      const a = segmentA!;
      const b = i;
      const n = activePoints.length;
      const between = a < b ? b - a - 1 : (n - a - 1) + b;
      const remaining = n - between;
      if (between === 0) { Alert.alert('הנקודות צמודות', 'אין נקודות ביניהן למחיקה'); resetSegment(); return; }
      if (remaining < 3) { Alert.alert('לא ניתן', `מחיקת ${between} נקודות תשאיר פחות מ-3 נקודות`); return; }
      Alert.alert(
        'חיבור נקודות',
        `${between} נקודות יימחקו בין נקודה ${a + 1} לנקודה ${b + 1}.\nנקודה ${a + 1} ונקודה ${b + 1} יתחברו ישירות.`,
        [
          { text: 'ביטול', style: 'cancel' },
          {
            text: 'חבר', style: 'destructive',
            onPress: () => {
              const toDelete = new Set<number>();
              if (a < b) { for (let j = a + 1; j < b; j++) toDelete.add(j); }
              else { for (let j = a + 1; j < n; j++) toDelete.add(j); for (let j = 0; j < b; j++) toDelete.add(j); }
              updateActivePolygon(prev => prev.filter((_, idx) => !toDelete.has(idx)));
              resetSegment();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            },
          },
        ]
      );
      return;
    }
    if (segmentMode === 'deletePoint') {
      if (activePoints.length <= 3) { Alert.alert('לא ניתן', 'מצולע חייב להכיל לפחות 3 נקודות'); return; }
      updateActivePolygon(prev => prev.filter((_, idx) => idx !== i));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }
    if (segmentMode === 'selectA') {
      setSegmentA(i);
      setSegmentMode('selectB');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }
    if (segmentMode === 'selectB') {
      if (i === segmentA) { setSegmentA(null); setSegmentMode('selectA'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); return; }
      if (!areAdjacent(i, segmentA!, activePoints.length)) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); return; }
      setSegmentB(i);
      setOrigSegmentA(segmentA);
      setSegmentMode('addPoints');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    }
    if (segmentMode === 'addPoints' && i === segmentB) { resetSegment(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }
  }

  function handleMapPress(e: MapPressEvent) {
    if (!editingPolygon) return;
    const coord = e.nativeEvent.coordinate;
    if (!coord) return;

    if (segmentMode === 'addPoints' && segmentA !== null && segmentB !== null) {
      const insertAt = segmentA + 1;
      updateActivePolygon(prev => {
        const next = [...prev];
        next.splice(insertAt, 0, coord);
        return next;
      });
      const newB = segmentB > segmentA ? segmentB + 1 : segmentB;
      setSegmentA(insertAt);
      setSegmentB(newB);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (segmentMode === 'off') {
      updateActivePolygon(prev => [...prev, coord]);
    }
  }

  function removeLastPoint() {
    if (segmentMode === 'addPoints' && segmentA !== null && origSegmentA !== null) {
      if (segmentA === origSegmentA) { setSegmentB(null); setOrigSegmentA(null); setSegmentMode('selectB'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); return; }
      const prevA = segmentA - 1;
      const newB  = segmentB! > segmentA ? segmentB! - 1 : segmentB!;
      updateActivePolygon(prev => prev.filter((_, i) => i !== segmentA));
      setSegmentA(prevA);
      setSegmentB(newB);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    updateActivePolygon(prev => prev.slice(0, -1));
  }

  // ── Multi-polygon helpers ─────────────────────────────────────────

  function startEditPolygon() {
    const loaded = getEruvPolygons(status);
    setPolygons(loaded.length > 0 ? loaded.map(p => [...p]) : [[]]);
    setActivePolygonIdx(0);
    resetSegment();
    setEditingPolygon(true);
  }

  function addPolygon() {
    setPolygons(prev => [...prev, []]);
    setActivePolygonIdx(polygons.length);
    resetSegment();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function deleteActivePolygon() {
    if (polygons.length <= 1) {
      setPolygons([[]]); resetSegment(); return;
    }
    Alert.alert('מחיקת מצולע', 'למחוק את המצולע הנבחר?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: () => {
          const next = polygons.filter((_, i) => i !== activePolygonIdx);
          setPolygons(next);
          setActivePolygonIdx(Math.max(0, activePolygonIdx - 1));
          resetSegment();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        },
      },
    ]);
  }

  async function handleSaveStatus() {
    setSavingStatus(true);
    try {
      await setEruvStatus(cityId, statusValue, notes, appUser?.uid ?? '');
      Alert.alert('נשמר', 'מצב העירוב עודכן בהצלחה');
      const label = statusValue === 'valid' ? 'כשר ✓' : 'פגום ⚠️';
      sendPushToCity(
        cityId,
        `עירוב ${city?.name ?? ''} — ${label}`,
        notes.trim() || (statusValue === 'valid' ? 'העירוב תקין' : 'העירוב אינו תקין'),
      ).catch(() => {});
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSavePolygon() {
    const valid = polygons.filter(p => p.length >= 3);
    if (valid.length === 0) { Alert.alert('שגיאה', 'יש לסמן לפחות מצולע אחד עם 3 נקודות'); return; }
    setSavingPolygon(true);
    try {
      await setEruvPolygon(cityId, valid);
      setEditingPolygon(false);
      resetSegment();
      Alert.alert('נשמר', 'גבולות העירוב עודכנו בהצלחה');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSavingPolygon(false);
    }
  }

  async function handleResolve(reportId: string) {
    try {
      await resolveEruvReport(reportId, appUser?.uid ?? '');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    }
  }

  const openReports     = reports.filter((r) => r.status === 'open');
  const resolvedReports = reports.filter((r) => r.status === 'resolved');

  function markerRole(i: number): 'A' | 'B' | 'new' | 'bridge' | 'delete' | 'normal' {
    if (segmentMode === 'deletePoint') return 'delete';
    if (segmentMode === 'bridgeB' && segmentA !== null) { if (i === segmentA) return 'A'; return 'bridge'; }
    if (i === segmentA) return 'A';
    if (i === segmentB) return 'B';
    if (segmentMode === 'addPoints' && origSegmentA !== null && segmentA !== null && i > origSegmentA && i <= segmentA) return 'new';
    return 'normal';
  }

  const MARKER_DOT_STYLE: Record<ReturnType<typeof markerRole>, object> = {
    normal: s.markerDot,
    A:      s.markerDotA,
    B:      s.markerDotB,
    new:    s.markerDotNew,
    bridge: s.markerDotBridge,
    delete: s.markerDotB,
  };

  const hintText = (() => {
    if (segmentMode === 'selectA')    return 'בחר נקודת התחלה (א\') לעריכת קטע גבול';
    if (segmentMode === 'selectB')    return `נקודה ${segmentA! + 1} נבחרה כ-א' — בחר נקודה צמודה כ-ב'`;
    if (segmentMode === 'addPoints')  return `א'=${segmentA! + 1}  ב'=${segmentB! + 1} — לחץ מפה להוסיף · ב' לסיום`;
    if (segmentMode === 'deletePoint') return 'לחץ על נקודה למחיקתה — שכניה יתחברו ישירות';
    if (segmentMode === 'bridgeA')    return 'בחר נקודת התחלה לחיבור ישיר (א\')';
    if (segmentMode === 'bridgeB')    return `נקודה ${segmentA! + 1} נבחרה — בחר נקודת סיום (ב')`;
    return activePoints.length === 0
      ? 'לחץ על המפה להוסיף נקודות לגבול'
      : 'לחץ "ערוך קטע" לעריכה · ✂ למחיקת נקודה · לחץ מפה להוסיף';
  })();

  const savedPolygons = useMemo(() => getEruvPolygons(status), [status]);

  return (
    <View style={s.container}>
      {/* Tabs */}
      <View style={s.tabs}>
        {(['status', 'polygon', 'reports'] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = { status: 'מצב', polygon: 'גבולות', reports: 'דיווחים' };
          const icons:  Record<Tab, string> = { status: 'shield-checkmark-outline', polygon: 'map-outline', reports: 'flag-outline' };
          const active = activeTab === tab;
          return (
            <TouchableOpacity key={tab} style={[s.tab, active && s.tabActive]} onPress={() => setActiveTab(tab)} activeOpacity={0.7}>
              <Ionicons name={icons[tab] as any} size={18} color={active ? Colors.gold : Colors.textSecondary} />
              <Text style={[s.tabText, active && s.tabTextActive]}>
                {labels[tab]}{tab === 'reports' && openReports.length > 0 ? ` (${openReports.length})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.gold} style={{ marginTop: 60 }} size="large" />
      ) : activeTab === 'status' ? (
        /* ── STATUS TAB ── */
        <ScrollView contentContainerStyle={[s.tabContent, { paddingBottom: bottom + 24 }]}>
          <Text style={s.sectionTitle}>מצב נוכחי</Text>
          {status ? (
            <View style={[s.statusCard, { borderColor: status.status === 'valid' ? Colors.success : Colors.danger }]}>
              <Ionicons name={status.status === 'valid' ? 'checkmark-circle' : 'alert-circle'} size={28}
                color={status.status === 'valid' ? Colors.success : Colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={s.statusCardLabel}>{status.status === 'valid' ? 'העירוב כשר' : 'העירוב פגום'}</Text>
                {status.notes ? <Text style={s.statusCardNotes}>{status.notes}</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={s.emptyText}>מצב לא הוגדר עדיין</Text>
          )}
          <Text style={[s.sectionTitle, { marginTop: Spacing.lg }]}>עדכן מצב</Text>
          <View style={s.toggleRow}>
            <TouchableOpacity style={[s.toggleBtn, statusValue === 'valid' && s.toggleBtnValid]} onPress={() => setStatusValue('valid')}>
              <Ionicons name="checkmark-circle-outline" size={20} color={statusValue === 'valid' ? Colors.white : Colors.success} />
              <Text style={[s.toggleBtnText, statusValue === 'valid' && s.toggleBtnTextActive]}>כשר</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toggleBtn, statusValue === 'invalid' && s.toggleBtnInvalid]} onPress={() => setStatusValue('invalid')}>
              <Ionicons name="alert-circle-outline" size={20} color={statusValue === 'invalid' ? Colors.white : Colors.danger} />
              <Text style={[s.toggleBtnText, statusValue === 'invalid' && s.toggleBtnTextActive]}>פגום</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.fieldLabel}>הערות (אופציונלי)</Text>
          <TextInput scrollEnabled={false} style={s.textInput} placeholder="הסבר קצר למשתמשים..." value={notes} onChangeText={setNotes}
            multiline numberOfLines={3} textAlign="right" textAlignVertical="top" placeholderTextColor={Colors.textMuted} />
          <TouchableOpacity style={[s.saveBtn, savingStatus && s.saveBtnDisabled]} onPress={handleSaveStatus} disabled={savingStatus}>
            {savingStatus ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={s.saveBtnText}>שמור מצב</Text>}
          </TouchableOpacity>
        </ScrollView>

      ) : activeTab === 'polygon' ? (
        /* ── POLYGON TAB ── */
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={initialRegion}
            showsUserLocation
            customMapStyle={[
              { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            ]}
            onPress={editingPolygon ? handleMapPress : undefined}
          >
            {/* Saved polygons (view mode) */}
            {!editingPolygon && savedPolygons.filter(p => p.length > 2).map((poly, i) => (
              <Polygon key={i} coordinates={poly}
                strokeColor={status?.status === 'valid' ? Colors.success : Colors.danger}
                fillColor={(status?.status === 'valid' ? Colors.success : Colors.danger) + '22'}
                strokeWidth={3} />
            ))}

            {/* Edit mode: non-active polygons shown as solid fills */}
            {editingPolygon && polygons.map((poly, polyIdx) => {
              if (polyIdx === activePolygonIdx || poly.length < 3) return null;
              const color = POLY_COLORS[polyIdx % POLY_COLORS.length];
              return (
                <Polygon key={polyIdx} coordinates={poly}
                  strokeColor={color} fillColor={color + '33'} strokeWidth={2} />
              );
            })}

            {/* Edit mode: active polygon with markers */}
            {editingPolygon && activePoints.length > 2 && (
              <Polygon coordinates={activePoints} strokeColor={Colors.gold}
                fillColor={Colors.gold + '22'} strokeWidth={3} lineDashPattern={[8, 4]} />
            )}
            {editingPolygon && activePoints.map((p, i) => {
              const role = markerRole(i);
              return (
                <EditMarker key={`${i}-${role}`} coordinate={p} onPress={() => handleMarkerPress(i)}>
                  <View style={s.markerTouchTarget}>
                    <View style={MARKER_DOT_STYLE[role] as any} />
                  </View>
                </EditMarker>
              );
            })}
          </MapView>

          {/* ── Edit controls ── */}
          <View style={[s.polygonControls, { bottom: bottom + 16 }]}>
            {!editingPolygon ? (
              <TouchableOpacity style={s.polyBtn} onPress={startEditPolygon}>
                <Ionicons name="pencil-outline" size={18} color={Colors.white} />
                <Text style={s.polyBtnText}>{savedPolygons.length ? `ערוך גבולות (${savedPolygons.length})` : 'צייר גבולות'}</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* Polygon selector row */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 8 }} contentContainerStyle={s.polyTabRow}>
                  {polygons.map((poly, i) => (
                    <TouchableOpacity key={i} style={[s.polyTabBtn, i === activePolygonIdx && s.polyTabBtnActive]}
                      onPress={() => { setActivePolygonIdx(i); resetSegment(); }}>
                      <View style={[s.polyTabDot, { backgroundColor: i === activePolygonIdx ? Colors.gold : POLY_COLORS[i % POLY_COLORS.length] }]} />
                      <Text style={[s.polyTabText, i === activePolygonIdx && s.polyTabTextActive]}>
                        {`מצולע ${i + 1}`}{poly.length > 0 ? ` (${poly.length})` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {polygons.length < 5 && (
                    <TouchableOpacity style={s.polyTabAddBtn} onPress={addPolygon}>
                      <Ionicons name="add" size={16} color={Colors.gold} />
                    </TouchableOpacity>
                  )}
                  {polygons.length > 1 && (
                    <TouchableOpacity style={s.polyTabDelBtn} onPress={deleteActivePolygon}>
                      <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </ScrollView>

                {/* Context-sensitive action buttons */}
                <View style={[s.polyEditRow, { marginBottom: 8, justifyContent: 'center' }]}>
                  {segmentMode === 'off' && (
                    <>
                      <TouchableOpacity style={s.polyBtnSm} onPress={removeLastPoint} disabled={activePoints.length === 0}>
                        <Ionicons name="arrow-undo-outline" size={18} color={Colors.white} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.polyBtnSm} onPress={() => { updateActivePolygon(() => []); resetSegment(); }}>
                        <Ionicons name="trash-outline" size={18} color={Colors.white} />
                      </TouchableOpacity>
                      {activePoints.length >= 2 && (
                        <TouchableOpacity style={[s.polyBtnSm, { backgroundColor: Colors.primary }]}
                          onPress={() => setSegmentMode('selectA')}>
                          <Ionicons name="git-branch-outline" size={18} color={Colors.white} />
                        </TouchableOpacity>
                      )}
                      {activePoints.length > 3 && (
                        <TouchableOpacity style={[s.polyBtnSm, { backgroundColor: Colors.danger }]}
                          onPress={() => setSegmentMode('deletePoint')}>
                          <Ionicons name="cut-outline" size={18} color={Colors.white} />
                        </TouchableOpacity>
                      )}
                      {activePoints.length > 4 && (
                        <TouchableOpacity style={[s.polyBtnSm, { backgroundColor: '#E07B00' }]}
                          onPress={() => setSegmentMode('bridgeA')}>
                          <Ionicons name="link-outline" size={18} color={Colors.white} />
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {(segmentMode === 'selectA' || segmentMode === 'selectB') && (
                    <>
                      <TouchableOpacity style={[s.polyBtnSm, { backgroundColor: Colors.textSecondary }]} onPress={resetSegment}>
                        <Ionicons name="close-outline" size={18} color={Colors.white} />
                      </TouchableOpacity>
                      <View style={s.polySegLabel}>
                        <Text style={s.polySegText}>
                          {segmentMode === 'selectA' ? 'בחר נקודת א\'' : `א'=${segmentA! + 1} — בחר ב' (צמודה)`}
                        </Text>
                      </View>
                    </>
                  )}

                  {segmentMode === 'addPoints' && (
                    <>
                      <TouchableOpacity style={s.polyBtnSm} onPress={removeLastPoint}>
                        <Ionicons name="arrow-undo-outline" size={18} color={Colors.white} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.polyBtnSm, { backgroundColor: Colors.success }]} onPress={resetSegment}>
                        <Ionicons name="checkmark-outline" size={18} color={Colors.white} />
                      </TouchableOpacity>
                      <View style={s.polySegLabel}>
                        <Text style={s.polySegText}>א'={segmentA! + 1} → ב'={segmentB! + 1}</Text>
                      </View>
                    </>
                  )}

                  {segmentMode === 'deletePoint' && (
                    <>
                      <TouchableOpacity style={[s.polyBtnSm, { backgroundColor: Colors.textSecondary }]} onPress={resetSegment}>
                        <Ionicons name="close-outline" size={18} color={Colors.white} />
                      </TouchableOpacity>
                      <View style={s.polySegLabel}><Text style={s.polySegText}>בחר נקודה למחיקה</Text></View>
                    </>
                  )}

                  {(segmentMode === 'bridgeA' || segmentMode === 'bridgeB') && (
                    <>
                      <TouchableOpacity style={[s.polyBtnSm, { backgroundColor: Colors.textSecondary }]} onPress={resetSegment}>
                        <Ionicons name="close-outline" size={18} color={Colors.white} />
                      </TouchableOpacity>
                      <View style={s.polySegLabel}>
                        <Text style={s.polySegText}>
                          {segmentMode === 'bridgeA' ? 'בחר נקודת התחלה לחיבור' : `נקודה ${segmentA! + 1} — בחר נקודת סיום`}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Always-visible Cancel + Save */}
                <View style={s.polyEditRow}>
                  <TouchableOpacity style={s.polyBtnCancel}
                    onPress={() => { setEditingPolygon(false); setPolygons([[]]); setActivePolygonIdx(0); resetSegment(); }}>
                    <Text style={s.polyBtnText}>ביטול</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.polyBtnSave, savingPolygon && s.saveBtnDisabled]}
                    onPress={handleSavePolygon} disabled={savingPolygon}>
                    {savingPolygon
                      ? <ActivityIndicator size="small" color={Colors.white} />
                      : <Text style={s.polyBtnText}>
                          שמור ({polygons.filter(p => p.length >= 3).length} מצולעים)
                        </Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* Hint */}
          {editingPolygon && (
            <View style={s.polygonHint}>
              <Text style={s.polygonHintText}>{hintText}</Text>
            </View>
          )}
        </View>

      ) : (
        /* ── REPORTS TAB ── */
        <ScrollView contentContainerStyle={[s.tabContent, { paddingBottom: bottom + 24 }]}>
          {reports.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="flag-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>אין דיווחים</Text>
            </View>
          ) : (
            <>
              {openReports.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>דיווחים פתוחים ({openReports.length})</Text>
                  {openReports.map((r) => (
                    <View key={r.id} style={s.reportCard}>
                      <View style={s.reportHeader}>
                        <Ionicons name={r.type === 'breach' ? 'warning-outline' : 'help-circle-outline'} size={20}
                          color={r.type === 'breach' ? Colors.danger : Colors.gold} />
                        <Text style={s.reportType}>{r.type === 'breach' ? 'דיווח על פרצה' : 'שאלה'}</Text>
                        <Text style={s.reportUser}>{r.userDisplayName ?? 'משתמש'}</Text>
                      </View>
                      <Text style={s.reportDesc}>{r.description}</Text>
                      {r.imageUrl ? <Image source={{ uri: r.imageUrl }} style={s.reportImage} resizeMode="cover" /> : null}
                      {r.userLocation ? (
                        <Text style={s.reportCoords}>📍 {r.userLocation.latitude.toFixed(5)}, {r.userLocation.longitude.toFixed(5)}</Text>
                      ) : null}
                      <TouchableOpacity style={s.resolveBtn} onPress={() => handleResolve(r.id)}>
                        <Ionicons name="checkmark-outline" size={16} color={Colors.success} />
                        <Text style={s.resolveBtnText}>סמן כטופל</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
              {resolvedReports.length > 0 && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: Spacing.lg }]}>דיווחים שטופלו ({resolvedReports.length})</Text>
                  {resolvedReports.map((r) => (
                    <View key={r.id} style={[s.reportCard, s.reportCardResolved]}>
                      <View style={s.reportHeader}>
                        <Ionicons name={r.type === 'breach' ? 'warning-outline' : 'help-circle-outline'} size={18} color={Colors.textMuted} />
                        <Text style={[s.reportType, { color: Colors.textMuted }]}>{r.type === 'breach' ? 'פרצה' : 'שאלה'}</Text>
                        <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                      </View>
                      <Text style={[s.reportDesc, { color: Colors.textSecondary }]}>{r.description}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  tabs:          { flexDirection: 'row', backgroundColor: Colors.cardBackground, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabText:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.gold },

  tabContent: { padding: Spacing.md },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  fieldLabel:   { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: Spacing.sm },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1.5, backgroundColor: Colors.cardBackground,
    marginBottom: Spacing.sm,
  },
  statusCardLabel: { fontSize: 16, fontWeight: '700', color: Colors.text },
  statusCardNotes: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.sm },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  toggleBtnValid:      { backgroundColor: Colors.success, borderColor: Colors.success },
  toggleBtnInvalid:    { backgroundColor: Colors.danger,  borderColor: Colors.danger  },
  toggleBtnText:       { fontSize: 15, fontWeight: '700', color: Colors.text },
  toggleBtnTextActive: { color: Colors.white },

  textInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.md, fontSize: 14, color: Colors.text,
    backgroundColor: Colors.background, minHeight: 80,
  },

  saveBtn:         { marginTop: Spacing.md, paddingVertical: 14, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.gold },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { fontSize: 15, fontWeight: '700', color: Colors.white },

  // ── Polygon tab ───────────────────────────────────────────────────
  polygonControls: { position: 'absolute', left: Spacing.md, right: Spacing.md },
  polyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, paddingVertical: 13, borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  polyEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },

  // Polygon tab selector
  polyTabRow:     { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 2 },
  polyTabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'transparent',
  },
  polyTabBtnActive: { borderColor: Colors.gold, backgroundColor: 'rgba(0,0,0,0.75)' },
  polyTabDot:       { width: 8, height: 8, borderRadius: 4 },
  polyTabText:      { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  polyTabTextActive: { color: Colors.gold },
  polyTabAddBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: Colors.gold,
  },
  polyTabDelBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: Colors.danger,
  },

  polyBtnSm: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.textSecondary,
  },
  polySegLabel: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: Radius.full, paddingVertical: 10 },
  polySegText:  { fontSize: 12, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  polyBtnCancel: {
    flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: Radius.full,
    backgroundColor: Colors.border,
  },
  polyBtnSave: {
    flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: Radius.full,
    backgroundColor: Colors.gold,
  },
  polyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  polygonHint: {
    position: 'absolute', top: 12, left: Spacing.md, right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.md, padding: 10, alignItems: 'center',
  },
  polygonHintText: { fontSize: 13, color: Colors.white, fontWeight: '500', textAlign: 'center' },

  // Markers
  markerTouchTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  markerDot:    { width: 14, height: 14, borderRadius: 7,  backgroundColor: Colors.gold,    borderWidth: 2,   borderColor: Colors.white },
  markerDotA:   { width: 18, height: 18, borderRadius: 9,  backgroundColor: Colors.success, borderWidth: 2.5, borderColor: Colors.white },
  markerDotB:   { width: 18, height: 18, borderRadius: 9,  backgroundColor: Colors.danger,  borderWidth: 2.5, borderColor: Colors.white },
  markerDotNew:    { width: 14, height: 14, borderRadius: 7,  backgroundColor: Colors.primary, borderWidth: 2,   borderColor: Colors.white },
  markerDotBridge: { width: 14, height: 14, borderRadius: 7,  backgroundColor: '#E07B00',       borderWidth: 2,   borderColor: Colors.white },

  // ── Reports tab ───────────────────────────────────────────────────
  emptyState: { alignItems: 'center', gap: Spacing.sm, paddingTop: 60 },
  emptyText:  { fontSize: 15, color: Colors.textMuted },

  reportCard:         { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  reportCardResolved: { opacity: 0.65 },
  reportHeader:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reportType:         { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
  reportUser:         { fontSize: 12, color: Colors.textSecondary },
  reportDesc:         { fontSize: 14, color: Colors.text, lineHeight: 20 },
  reportImage:        { width: '100%', height: 160, borderRadius: Radius.sm, marginTop: 8 },
  reportCoords:       { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },
  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.success + '1A', borderWidth: 1, borderColor: Colors.success,
  },
  resolveBtnText: { fontSize: 13, fontWeight: '600', color: Colors.success },
});
