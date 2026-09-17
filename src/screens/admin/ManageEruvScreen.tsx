import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, Modal,
  Image, Pressable,
} from 'react-native';
import { AppAlert as Alert } from '../../components/AppAlert';

import MapView, { Polygon, Marker, MapPressEvent, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEruvStatuses, useEruvReports } from '../../hooks/useEruv';
import { useCityId } from '../../hooks/useCityId';
import { useCity } from '../../hooks/useCity';
import { useAreas } from '../../hooks/useAreas';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import {
  setEruvStatus, setEruvPolygon, resolveEruvReport, getEruvPolygons,
  findEruvForArea, createEruv, updateEruvAreas,
} from '../../services/eruv';
import { sendPushToCity } from '../../services/pushNotifications';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { EruvCoordinate, EruvStatus } from '../../types';

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

  // Most tenants have exactly one eruv, and the settlement row below stays
  // hidden for them — see the "golden rule" in the architecture proposal. A
  // regional council can have several; an eruv_manager there is expected to
  // manage more than just their own settlement, so — unlike the read-only
  // EruvScreen — this always shows the full row rather than only a fallback.
  const { statuses, loading } = useEruvStatuses(cityId, focused);
  const { areas } = useAreas(cityId);
  const [selectedEruvId, setSelectedEruvId] = useState<string | null>(null);
  const ownEruv = useMemo(
    () => findEruvForArea(statuses, appUser?.homeAreaId),
    [statuses, appUser?.homeAreaId],
  );
  const activeEruv = useMemo(
    () => statuses.find((s) => s.id === selectedEruvId) ?? ownEruv ?? statuses[0] ?? null,
    [statuses, selectedEruvId, ownEruv],
  );
  const status = activeEruv;
  const eruvId = activeEruv?.id ?? null;

  // Areas not yet covered by any of this tenant's eruvin — offered as
  // one-tap "add a settlement" targets. A single-area city never has any,
  // since its one area became its one eruv's areaIds the day this migrated.
  const coveredAreaIds = useMemo(
    () => new Set(statuses.flatMap((s) => s.areaIds ?? [])),
    [statuses],
  );
  const uncoveredAreas = useMemo(
    () => areas.filter((a) => !coveredAreaIds.has(a.id)),
    [areas, coveredAreaIds],
  );

  // Create/edit picker — same UI for a brand-new eruv (checking one or more
  // uncovered settlements) and for editing an existing one's areaIds
  // (checking its own settlements plus any still-uncovered ones).
  type EruvPicker = { mode: 'create' } | { mode: 'edit'; eruv: EruvStatus };
  const [picker, setPicker] = useState<EruvPicker | null>(null);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerLabel, setPickerLabel] = useState('');
  const [pickerSaving, setPickerSaving] = useState(false);

  // Areas selectable in the picker: for a new eruv, whatever's uncovered;
  // for editing an existing one, that plus its own current areas (which read
  // as "covered" globally, but must stay checkable so they can be kept or
  // unchecked) — everything covered by ANOTHER eruv stays hidden either way.
  const pickerAvailableAreas = useMemo(() => {
    if (!picker) return [];
    if (picker.mode === 'create') return uncoveredAreas;
    const ownIds = new Set(picker.eruv.areaIds ?? []);
    return areas.filter((a) => ownIds.has(a.id) || !coveredAreaIds.has(a.id));
  }, [picker, areas, uncoveredAreas, coveredAreaIds]);

  function eruvLabel(e: typeof activeEruv): string {
    if (!e) return '';
    if (e.label) return e.label;
    const names = e.areaIds.map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean);
    return names.join(' + ') || 'עירוב';
  }

  function openCreatePicker() {
    setPicker({ mode: 'create' });
    setPickerSelected(new Set());
    setPickerLabel('');
  }

  function openEditPicker(eruv: EruvStatus) {
    setPicker({ mode: 'edit', eruv });
    setPickerSelected(new Set(eruv.areaIds ?? []));
    setPickerLabel(eruv.label ?? '');
  }

  function togglePickerArea(id: string) {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleConfirmPicker() {
    if (!picker || pickerSelected.size === 0) return;
    const areaIds = Array.from(pickerSelected);
    const label = pickerLabel.trim();
    setPickerSaving(true);
    try {
      if (picker.mode === 'create') {
        const newId = await createEruv(cityId, areaIds, label || undefined, appUser?.uid ?? '');
        setSelectedEruvId(newId);
      } else {
        await updateEruvAreas(picker.eruv.id, areaIds, label, appUser?.uid ?? '');
      }
      setPicker(null);
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setPickerSaving(false);
    }
  }

  const { reports } = useEruvReports(cityId, focused);

  // Opening from the profile badge means the user is coming for the reports —
  // landing them on 'status' shows an empty-looking screen and hides the very
  // thing the badge was counting.
  const route = useRoute<any>();
  const [activeTab, setActiveTab] = useState<Tab>(
    (route.params?.initialTab as Tab | undefined) ?? 'status',
  );

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
    if (!eruvId) return;
    setSavingStatus(true);
    try {
      await setEruvStatus(eruvId, statusValue, notes, appUser?.uid ?? '');
      Alert.alert('נשמר', 'מצב העירוב עודכן בהצלחה');
      const label = statusValue === 'valid' ? 'כשר ✓' : 'פגום ⚠️';
      // areaIds narrows this to residents of the settlement(s) this eruv
      // actually covers — on a single-eruv tenant that's everyone anyway,
      // since its one area is the whole city.
      sendPushToCity(
        cityId,
        `עירוב ${eruvLabel(activeEruv)} — ${label}`,
        notes.trim() || (statusValue === 'valid' ? 'העירוב תקין' : 'העירוב אינו תקין'),
        undefined,
        activeEruv?.areaIds,
      ).catch(() => {});
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSavePolygon() {
    if (!eruvId) return;
    const valid = polygons.filter(p => p.length >= 3);
    if (valid.length === 0) { Alert.alert('שגיאה', 'יש לסמן לפחות מצולע אחד עם 3 נקודות'); return; }
    setSavingPolygon(true);
    try {
      await setEruvPolygon(eruvId, valid);
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

      {/* Settlement row — hidden for a plain single-area tenant. Shown
          whenever there's more than one area at all (not just more than one
          eruv, or uncovered areas left) so a regional council whose
          settlements are already fully assigned into eruvin still has a way
          to reach the edit picker below — otherwise a council with e.g. 2
          settlements both already in one combined eruv would have no UI
          left to reach it. */}
      {!loading && areas.length > 1 && (
        <View style={s.settlementRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.settlementRowContent}
        >
          {statuses.map((e) => {
            const active = e.id === activeEruv?.id;
            return (
              <View key={e.id} style={[s.settlementChip, active && s.settlementChipActive]}>
                <TouchableOpacity
                  style={s.settlementChipMain}
                  onPress={() => setSelectedEruvId(e.id)}
                  activeOpacity={0.75}
                >
                  <View style={[s.settlementChipDot, {
                    backgroundColor: e.status === 'valid' ? Colors.success
                      : e.status === 'invalid' ? Colors.danger : Colors.gold,
                  }]} />
                  <Text style={[s.settlementChipText, active && s.settlementChipTextActive]}>{eruvLabel(e)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.settlementChipEditBtn}
                  onPress={() => openEditPicker(e)}
                  activeOpacity={0.6}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="pencil" size={12} color={active ? Colors.text : Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            );
          })}
          {uncoveredAreas.length > 0 && (
            <TouchableOpacity style={s.settlementAddChip} onPress={openCreatePicker} activeOpacity={0.75}>
              <Ionicons name="add" size={16} color={Colors.gold} />
              <Text style={s.settlementAddChipText}>עירוב חדש</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        </View>
      )}

      {/* Create/edit picker — which settlements this eruv covers */}
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>{picker?.mode === 'edit' ? 'עריכת יישובי העירוב' : 'עירוב חדש'}</Text>
            <TextInput
              style={s.modalLabelInput}
              placeholder="שם תצוגה (אופציונלי)"
              value={pickerLabel}
              onChangeText={setPickerLabel}
              textAlign="right"
              placeholderTextColor={Colors.textMuted}
            />
            <ScrollView style={{ maxHeight: 320 }}>
              {pickerAvailableAreas.map((a) => {
                const checked = pickerSelected.has(a.id);
                return (
                  <TouchableOpacity key={a.id} style={s.modalRow} onPress={() => togglePickerArea(a.id)} activeOpacity={0.7}>
                    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? Colors.gold : Colors.textMuted} />
                    <Text style={s.modalRowText}>{a.name}</Text>
                  </TouchableOpacity>
                );
              })}
              {pickerAvailableAreas.length === 0 && (
                <Text style={[s.emptyText, { textAlign: 'center', paddingVertical: Spacing.md }]}>אין יישובים זמינים</Text>
              )}
            </ScrollView>
            {pickerSelected.size === 0 && (
              <Text style={s.pickerHint}>בחר לפחות יישוב אחד</Text>
            )}
            <View style={s.modalBtnRow}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setPicker(null)}>
                <Text style={s.modalCancelText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, s.modalConfirmBtn, (pickerSelected.size === 0 || pickerSaving) && s.saveBtnDisabled]}
                onPress={handleConfirmPicker}
                disabled={pickerSelected.size === 0 || pickerSaving}
              >
                {pickerSaving
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={s.saveBtnText}>{picker?.mode === 'edit' ? 'שמור' : 'צור עירוב'}</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
          <TouchableOpacity style={[s.saveBtn, (savingStatus || !eruvId) && s.saveBtnDisabled]} onPress={handleSaveStatus} disabled={savingStatus || !eruvId}>
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

  // ── Settlement row (multi-eruv tenants only) ────────────────────────
  // height lives on this wrapping View, not on the ScrollView itself: an
  // explicit height directly on a horizontal ScrollView here proved
  // unreliable — it was inconsistently overridden per-tab (confirmed by
  // temporarily coloring it: ~190px on one tab, nearly the full screen on
  // another, same component and style both times), sized instead by
  // whatever flex space its sibling tab content left it. A plain View's
  // height is honored reliably, so the ScrollView now just fills this one.
  settlementRow: {
    height: 56,
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  // alignItems pinned explicitly: this row's chips carry no padding/height of
  // their own anymore (that moved to settlementChipMain/EditBtn so the two
  // touch targets inside one chip could differ), so with the flex row's
  // default 'stretch' they had nothing of their own to resist being stretched
  // to the ScrollView's own (unconstrained, and so surprisingly large) cross-
  // axis size — a short label hid this, a long one made it obvious.
  settlementRowContent: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.sm, paddingHorizontal: Spacing.md },
  settlementChip: {
    flexDirection: 'row', alignItems: 'center', borderRadius: Radius.full,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  settlementChipActive:     { backgroundColor: Colors.gold + '1A', borderColor: Colors.gold },
  settlementChipMain:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  settlementChipEditBtn:    { paddingHorizontal: 8, paddingVertical: 7 },
  settlementChipDot:        { width: 7, height: 7, borderRadius: 3.5 },
  settlementChipText:       { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
  settlementChipTextActive: { color: Colors.text },
  settlementAddChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.gold,
  },
  settlementAddChipText: { fontSize: 12.5, fontWeight: '600', color: Colors.gold },

  // ── Eruv create/edit modal ────────────────────────────────────────────
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  modalCard: {
    width: '100%', maxWidth: 380, backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg, padding: Spacing.lg,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  modalLabelInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 9, fontSize: 14, color: Colors.text,
    backgroundColor: Colors.background, marginBottom: Spacing.sm,
  },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalRowText: { fontSize: 15, color: Colors.text, fontWeight: '500' },
  pickerHint:   { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
  modalBtnRow:  { flexDirection: 'row', gap: 8, marginTop: Spacing.md },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText:  { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  modalConfirmBtn:  { flex: 1, marginTop: 0, paddingVertical: 12 },

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
