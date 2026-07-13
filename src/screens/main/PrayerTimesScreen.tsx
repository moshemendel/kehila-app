import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAnalyticsTrack } from '../../services/analytics';
import * as Location from 'expo-location';
import { useSynagogues } from '../../hooks/useSynagogues';
import { useCityId } from '../../hooks/useCityId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTodayZmanim } from '../../hooks/useTodayZmanim';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { Synagogue } from '../../types';
import {
  parseTimeToMinutes, nowInMinutes, hebrewDayOfWeek, tomorrowDayOfWeek,
  todayDayNumber, tomorrowDayNumber, resolveSlotTime,
} from '../../utils/prayerUtils';
import FilterBar from '../../components/FilterBar';

// ─── Types ────────────────────────────────────────────────────────────────────
type PrayerType = 'shacharit' | 'mincha' | 'maariv';

interface PrayerSlot {
  synagogue: Synagogue;
  type: PrayerType;
  time: string;
  timeMinutes: number;
  distanceKm: number | null;
  isPast: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PRAYER_HE: Record<PrayerType, string> = {
  shacharit: 'שחרית', mincha: 'מנחה', maariv: 'ערבית',
};

const PRAYER_COLOR: Record<PrayerType, string> = {
  shacharit: Colors.shacharit,
  mincha:    Colors.primary,
  maariv:    Colors.maariv,
};

function synNusachValues(syn: Synagogue): string[] {
  if (Array.isArray(syn.nusach)) return syn.nusach.filter(Boolean);
  return syn.nusach ? [syn.nusach as unknown as string] : [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} מ'` : `${km.toFixed(1)} ק"מ`;
}

function formatCountdown(minutesLeft: number): string {
  if (minutesLeft <= 0) return '';
  if (minutesLeft < 60) {
    return `עוד ${minutesLeft} דקות`;
  }
  const h = Math.floor(minutesLeft / 60);
  const m = minutesLeft % 60;
  if (h >= 2) {
    return m > 0 ? `עוד ${h} שעות ו${m} דקות` : `עוד ${h} שעות`;
  }
  // 1–2 hours: digital "עוד 01:MM"
  const mm = String(m).padStart(2, '0');
  return `עוד 01:${mm}`;
}

function currentTimeString(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PrayerTimesScreen() {
  useAnalyticsTrack('prayer_times');
  const cityId = useCityId();
  const { top } = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { synagogues, loading } = useSynagogues(cityId, focused);
  const todayZmanim = useTodayZmanim(cityId);
  const navigation = useNavigation<any>();

  const [sort,         setSort]         = useState<'earliest' | 'closest'>('earliest');
  const [userLoc,      setUserLoc]      = useState<{ lat: number; lon: number } | null>(null);
  const [locLoading,   setLocLoading]   = useState(false);
  const [manualFilter, setManualFilter] = useState<'all' | PrayerType | null>(null);
  const [subFilters,   setSubFilters]   = useState<Record<string, string[]>>({ nusach: [], neighborhood: [] });
  const [nowMin,       setNowMin]       = useState(nowInMinutes());
  const [viewDay,      setViewDay]      = useState<'today' | 'tomorrow'>('today');

  // Tick every minute to refresh countdowns
  useEffect(() => {
    const id = setInterval(() => setNowMin(nowInMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function requestLocation() {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('הרשאת מיקום', 'כדי למיין לפי מרחק, יש לאפשר גישה למיקום בהגדרות');
        setSort('earliest');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לקבל מיקום');
      setSort('earliest');
    } finally {
      setLocLoading(false);
    }
  }

  function handleSort(s: 'earliest' | 'closest') {
    setSort(s);
    if (s === 'closest' && !userLoc) requestLocation();
  }

  // Build flat list of prayer slots for the active day
  const allSlots = useMemo<PrayerSlot[]>(() => {
    const dayNum = viewDay === 'today' ? todayDayNumber() : tomorrowDayNumber();
    const isTomorrow = viewDay === 'tomorrow';
    const slots: PrayerSlot[] = [];
    for (const syn of synagogues) {
      const distKm = userLoc && syn.latitude && syn.longitude
        ? haversineKm(userLoc.lat, userLoc.lon, syn.latitude, syn.longitude)
        : null;
      const ws = syn.weeklySchedule;
      if (!ws) continue;
      for (const type of ['shacharit', 'mincha', 'maariv'] as PrayerType[]) {
        for (const slot of ws[type] ?? []) {
          if (!(slot.days ?? []).includes(dayNum)) continue;
          const resolvedTime = resolveSlotTime(slot, todayZmanim); // today's zmanim ≈ tomorrow's (±2 min)
          if (!resolvedTime) continue;
          const minutes = parseTimeToMinutes(resolvedTime);
          if (minutes < 0) continue;
          slots.push({
            synagogue: syn, type, time: resolvedTime, timeMinutes: minutes,
            distanceKm: distKm,
            isPast: isTomorrow ? false : minutes <= nowMin, // tomorrow's slots are never "past"
          });
        }
      }
    }
    return slots;
  }, [synagogues, userLoc, nowMin, todayZmanim, viewDay]);

  // Auto-advance to tomorrow once all of today's prayers are past
  const todayAllDone = useMemo(
    () => viewDay === 'today' && allSlots.length > 0 && allSlots.every((s) => s.isPast),
    [viewDay, allSlots],
  );
  useEffect(() => {
    if (todayAllDone) {
      setViewDay('tomorrow');
      setManualFilter(null);
    }
  }, [todayAllDone]);

  // Auto-select the prayer type that has upcoming prayers
  const smartFilter = useMemo<'all' | PrayerType>(() => {
    for (const type of ['shacharit', 'mincha', 'maariv'] as PrayerType[]) {
      if (allSlots.some((s) => s.type === type && !s.isPast)) return type;
    }
    return 'all';
  }, [allSlots]);

  // Clear manual override when the auto filter advances to the next prayer type
  useEffect(() => {
    setManualFilter(null);
  }, [smartFilter]);

  const filter = manualFilter ?? smartFilter;

  // Build available nusach and neighborhood values from synagogues in today's slots
  const availableNusachim = useMemo(() => {
    const set = new Set<string>();
    synagogues.forEach((syn) => synNusachValues(syn).forEach((v) => set.add(v)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [synagogues]);

  const availableNeighborhoods = useMemo(() => {
    const set = new Set<string>();
    synagogues.forEach((syn) => { if (syn.neighborhood) set.add(syn.neighborhood); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [synagogues]);

  // Only show prayer types that have upcoming (non-past) slots
  const availablePrayerTypes = useMemo(() =>
    (['shacharit', 'mincha', 'maariv'] as PrayerType[]).filter(
      (t) => allSlots.some((s) => s.type === t && !s.isPast)
    ), [allSlots]);

  const selNusach       = subFilters.nusach;
  const selNeighborhood = subFilters.neighborhood;

  const sorted = useMemo(() => {
    const list = allSlots
      .filter((s) => !s.isPast)
      .filter((s) => filter === 'all' || s.type === filter)
      .filter((s) => selNusach.length === 0 || synNusachValues(s.synagogue).some((n) => selNusach.includes(n)))
      .filter((s) => selNeighborhood.length === 0 || selNeighborhood.includes(s.synagogue.neighborhood ?? ''));
    return [...list].sort((a, b) => {
      if (sort === 'closest' && a.distanceKm !== null && b.distanceKm !== null) {
        if (Math.abs(a.distanceKm - b.distanceKm) > 0.01) return a.distanceKm - b.distanceKm;
      }
      return a.timeMinutes - b.timeMinutes;
    });
  }, [allSlots, filter, sort, selNusach, selNeighborhood]);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: top + 16 }]}>
        <View>
          <Text style={s.title}>תפילות</Text>
          <Text style={s.subtitle}>
            {viewDay === 'today'
              ? `יום ${hebrewDayOfWeek()} · ${currentTimeString()}`
              : `מחר · יום ${tomorrowDayOfWeek()}`}
          </Text>
        </View>
        {/* Day toggle */}
        <View style={s.dayToggle}>
          <TouchableOpacity
            style={[s.dayBtn, viewDay === 'today' && s.dayBtnActive]}
            onPress={() => { setViewDay('today'); setManualFilter(null); }}
          >
            <Text style={[s.dayBtnTxt, viewDay === 'today' && s.dayBtnTxtActive]}>היום</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.dayBtn, viewDay === 'tomorrow' && s.dayBtnActive]}
            onPress={() => { setViewDay('tomorrow'); setManualFilter(null); }}
          >
            <Text style={[s.dayBtnTxt, viewDay === 'tomorrow' && s.dayBtnTxtActive]}>מחר</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FilterBar
        values={{
          prayer:       filter === 'all' ? [] : [filter],
          nusach:       selNusach,
          neighborhood: selNeighborhood,
        }}
        onChange={(key, val) => {
          if (key === 'prayer') {
            if (val.length === 0) setManualFilter('all');
            else { const v = val[0] as PrayerType; setManualFilter(v === smartFilter ? null : v); }
          } else {
            setSubFilters((p) => ({ ...p, [key]: val }));
          }
        }}
        filters={[
          {
            key: 'prayer',
            label: 'תפילה',
            options: availablePrayerTypes.map((t) => ({ key: t, label: PRAYER_HE[t] })),
            multiSelect: false,
            activeColor: filter !== 'all' ? PRAYER_COLOR[filter as PrayerType] : Colors.primary,
          },
          {
            key: 'nusach',
            label: 'נוסח',
            options: availableNusachim.map((n) => ({ key: n, label: n })),
            activeColor: Colors.primary,
          },
          ...(availableNeighborhoods.length > 0 ? [{
            key: 'neighborhood',
            label: 'שכונה',
            options: availableNeighborhoods.map((n) => ({ key: n, label: n })),
            activeColor: Colors.kosher,
          }] : []),
        ]}
        sortSlot={
          <View style={s.sortGroup}>
            <TouchableOpacity style={[s.sortBtn, sort === 'earliest' && s.sortBtnActive]} onPress={() => handleSort('earliest')}>
              <Ionicons name="timer-outline" size={14} color={sort === 'earliest' ? Colors.white : Colors.primary} />
              <Text style={[s.sortTxt, sort === 'earliest' && s.sortTxtActive]}>מוקדם</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sortBtn, sort === 'closest' && s.sortBtnActive]} onPress={() => handleSort('closest')}>
              {locLoading
                ? <ActivityIndicator size="small" color={sort === 'closest' ? Colors.white : Colors.primary} />
                : <Ionicons name="navigate-outline" size={14} color={sort === 'closest' ? Colors.white : Colors.primary} />}
              <Text style={[s.sortTxt, sort === 'closest' && s.sortTxtActive]}>קרוב</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* List */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} size="large" />
      ) : sorted.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="moon-outline" size={52} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>
            {viewDay === 'today' ? 'כל התפילות הסתיימו' : 'אין תפילות למחר'}
          </Text>
          <Text style={s.emptySubtitle}>
            {viewDay === 'today' ? 'לא נותרו תפילות להיום' : 'לא נמצאו זמני תפילה ליום זה'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
          {sorted.map((slot, i) => {
            const color       = PRAYER_COLOR[slot.type];
            const minutesLeft = slot.timeMinutes - nowMin;
            // Don't show countdowns for tomorrow — they'd show "עוד 14 שעות" which is useless
            const countdown   = viewDay === 'today' && !slot.isPast ? formatCountdown(minutesLeft) : '';
            const isVeryClose = viewDay === 'today' && !slot.isPast && minutesLeft <= 15;

            return (
              <TouchableOpacity
                key={`${slot.synagogue.id}-${slot.type}-${slot.time}-${i}`}
                style={s.card}
                onPress={() => navigation.navigate('SynagogueDetail', { synagogue: slot.synagogue })}
                activeOpacity={0.82}
              >
                {/* Left color bar */}
                <View style={[s.colorBar, { backgroundColor: color }]} />

                <View style={s.cardBody}>
                  {/* Top row: name + prayer chip */}
                  <View style={s.cardTop}>
                    <Text style={s.synName} numberOfLines={1}>{slot.synagogue.name}</Text>
                    <View style={[s.prayerChip, { backgroundColor: color + '20', borderColor: color + '50' }]}>
                      <Text style={[s.prayerChipTxt, { color }]}>{PRAYER_HE[slot.type]}</Text>
                    </View>
                  </View>

                  {/* Middle row: address + distance */}
                  <View style={s.cardMid}>
                    <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                    <Text style={s.synAddr} numberOfLines={1}>{slot.synagogue.address.he ?? slot.synagogue.address.en ?? ''}</Text>
                    {slot.distanceKm !== null && (
                      <Text style={s.distTxt}>{formatDist(slot.distanceKm)}</Text>
                    )}
                  </View>

                  {/* Bottom row: time + countdown */}
                  <View style={s.cardBottom}>
                    <Text style={[s.timeText, { color }]}>{slot.time}</Text>
                    {countdown !== '' && (
                      <View style={[s.countdownBadge, isVeryClose && { backgroundColor: color + '18', borderColor: color }]}>
                        <Ionicons name="time-outline" size={11}
                          color={isVeryClose ? color : Colors.textMuted} />
                        <Text style={[s.countdownTxt, isVeryClose && { color, fontWeight: '800' }]}>
                          {countdown}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <Ionicons name="chevron-back-outline" size={16} color={Colors.textMuted}
                  style={{ marginRight: 4 }} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.background },
  header:       { backgroundColor: Colors.primary, paddingTop: 56, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title:        { fontSize: 26, fontWeight: '800', color: Colors.white },
  subtitle:     { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  slotCount:    { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  dayToggle:      { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' },
  dayBtn:         { paddingHorizontal: 16, paddingVertical: 6 },
  dayBtnActive:   { backgroundColor: Colors.white },
  dayBtnTxt:      { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  dayBtnTxtActive:{ color: Colors.primary },

  sortGroup:    { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primary, overflow: 'hidden' },
  sortBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7 },
  sortBtnActive:{ backgroundColor: Colors.primary },
  sortTxt:      { fontSize: 12, fontWeight: '700', color: Colors.primary },
  sortTxtActive:{ color: Colors.white },

  emptyState:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: Colors.textSecondary },
  emptySubtitle:{ fontSize: 14, color: Colors.textMuted },

  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBackground, borderRadius: Radius.md, marginBottom: 10, overflow: 'hidden', ...Shadow.card },
  colorBar:     { width: 4, alignSelf: 'stretch' },
  cardBody:     { flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: 10, gap: 4 },

  cardTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  synName:      { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  prayerChip:   { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 1 },
  prayerChipTxt:{ fontSize: 11, fontWeight: '700' },

  cardMid:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  synAddr:      { flex: 1, fontSize: 11, color: Colors.textMuted },
  distTxt:      { fontSize: 11, fontWeight: '700', color: Colors.primaryLight },

  cardBottom:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  timeText:     { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  countdownBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  countdownTxt: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
});
