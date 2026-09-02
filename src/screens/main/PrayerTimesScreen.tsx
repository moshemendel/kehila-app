import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAnalyticsTrack } from '../../services/analytics';
import * as Location from 'expo-location';
import { useSynagoguesFeed } from '../../context/SynagoguesContext';
import { useCityId } from '../../hooks/useCityId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTodayZmanim } from '../../hooks/useTodayZmanim';
import { Colors, Spacing, Radius, Shadow, CardShellFlush } from '../../utils/theme';
import { Synagogue } from '../../types';
import {
  parseTimeToMinutes, nowInMinutes, hebrewDayOfWeek, tomorrowDayOfWeek,
  todayDayNumber, tomorrowDayNumber, resolveSlotTime,
} from '../../utils/prayerUtils';
import FilterBar from '../../components/FilterBar';
import { reachInTime, formatMinutes } from '../../utils/travel';

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
/**
 * One prayer-time row, memoised.
 *
 * A weekday resolves to roughly 176 of these across the city's 69 synagogues,
 * and each card is a couple of dozen native views. Built inline they were all
 * constructed in one synchronous pass; behind a FlatList only the handful on
 * screen exist, and memo lets a re-render skip any row whose slot, clock
 * minute and day are unchanged.
 */
const PrayerSlotRow = React.memo(function PrayerSlotRow({
  slot, nowMin, viewDay, onOpen,
}: {
  slot:    PrayerSlot;
  nowMin:  number;
  viewDay: 'today' | 'tomorrow';
  onOpen:  (syn: Synagogue) => void;
}) {
  const color       = PRAYER_COLOR[slot.type];
  const minutesLeft = slot.timeMinutes - nowMin;
  // Don't show countdowns for tomorrow — they'd show "עוד 14 שעות" which is useless
  const countdown   = viewDay === 'today' && !slot.isPast ? formatCountdown(minutesLeft) : '';
  const isVeryClose = viewDay === 'today' && !slot.isPast && minutesLeft <= 15;
  // Only meaningful for today's upcoming slots — a countdown to
  // tomorrow's shacharit says nothing about whether you can walk there.
  const reach = (viewDay === 'today' && !slot.isPast)
    ? reachInTime(slot.distanceKm, minutesLeft)
    : { kind: 'unknown' as const, walkMin: 0, driveMin: 0 };
  const cantWalk = reach.kind === 'drive-only' || reach.kind === 'late';

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => onOpen(slot.synagogue)}
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

        {/* Travel row — both modes, so the choice is the reader's.
            For short hops these come out level: driving carries a
            fixed overhead for reaching the car and parking, which is
            real and usually forgotten. The walking figure greys out
            when there isn't time to walk, so the icons carry the
            state and the badge below only has to name it once. */}
        {reach.kind !== 'unknown' && (
          <View style={s.travelRow}>
            <Ionicons name="walk-outline" size={12}
              color={cantWalk ? Colors.textMuted : Colors.textSecondary} />
            <Text style={[s.travelTxt, cantWalk && s.travelTxtOff]}>
              {formatMinutes(reach.walkMin)}
            </Text>
            <Text style={s.travelSep}>·</Text>
            <Ionicons name="car-outline" size={12}
              color={reach.kind === 'late' ? Colors.textMuted : Colors.textSecondary} />
            <Text style={[s.travelTxt, reach.kind === 'late' && s.travelTxtOff]}>
              {formatMinutes(reach.driveMin)}
            </Text>
          </View>
        )}

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

          {/* Flagged, never filtered out. The distance is a straight
              line and the estimate can be wrong — the congregant may
              know a shortcut, or be driving. Warning respects that;
              hiding the row would not. */}
          {reach.kind === 'late' && (
            <View style={s.reachLate}>
              <Ionicons name="alert-circle-outline" size={11} color={Colors.danger} />
              <Text style={s.reachLateTxt}>לא תספיק</Text>
            </View>
          )}
          {reach.kind === 'drive-only' && (
            <View style={s.reachTight}>
              <Ionicons name="car-outline" size={11} color={Colors.warning} />
              <Text style={s.reachTightTxt}>ברכב בלבד</Text>
            </View>
          )}
          {reach.kind === 'walk-tight' && (
            <View style={s.reachTight}>
              <Ionicons name="walk-outline" size={11} color={Colors.warning} />
              <Text style={s.reachTightTxt}>בקושי תספיק</Text>
            </View>
          )}
        </View>
      </View>

      <Ionicons name="chevron-back-outline" size={16} color={Colors.textMuted}
        style={{ marginRight: 4 }} />
    </TouchableOpacity>
  );
});

/**
 * Narrowing presets, not a slider.
 *
 * Every other control on this screen is a chip — prayer type, nusach,
 * neighbourhood, sort — and nobody picking a walking distance needs 1.3km. A
 * handful of round numbers is faster to hit on a phone and says what it means.
 */
const RADIUS_OPTIONS: { key: string; label: string; km: number | null }[] = [
  { key: 'r500', label: '500 מ׳',  km: 0.5 },
  { key: 'r1',   label: '1 ק״מ',   km: 1 },
  { key: 'r2',   label: '2 ק״מ',   km: 2 },
];

const WINDOW_OPTIONS: { key: string; label: string; min: number | null }[] = [
  { key: 'w60',  label: 'בשעה הקרובה',   min: 60 },
  { key: 'w180', label: 'ב-3 השעות',     min: 180 },
];

export default function PrayerTimesScreen() {
  useAnalyticsTrack('prayer_times');
  const cityId = useCityId();
  const { top } = useSafeAreaInsets();
  const { synagogues, loading } = useSynagoguesFeed();
  const todayZmanim = useTodayZmanim(cityId);
  const navigation = useNavigation<any>();

  const [sort,         setSort]         = useState<'earliest' | 'closest'>('earliest');
  const [userLoc,      setUserLoc]      = useState<{ lat: number; lon: number } | null>(null);
  const [locLoading,   setLocLoading]   = useState(false);
  const [manualFilter, setManualFilter] = useState<'all' | PrayerType | null>(null);
  const [subFilters,   setSubFilters]   = useState<Record<string, string[]>>({ nusach: [], neighborhood: [] });
  const [nowMin,       setNowMin]       = useState(nowInMinutes());
  const [viewDay,      setViewDay]      = useState<'today' | 'tomorrow'>('today');
  const [radiusKm,     setRadiusKm]     = useState<number | null>(null);
  const [windowMin,    setWindowMin]    = useState<number | null>(null);

  // Tick every minute to refresh countdowns
  useEffect(() => {
    const id = setInterval(() => setNowMin(nowInMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  /**
   * Fetch position on mount when permission is ALREADY granted.
   *
   * Distances used to matter only to the "קרוב" sort, so they were fetched only
   * when that sort was chosen. The travel-time flags changed that: they belong
   * to the TIME-sorted view — "can I still get there" is the question you ask
   * while reading a list ordered by when things start — so gating them behind a
   * sort nobody taps made them invisible in the one place they were built for.
   *
   * Deliberately getForegroundPermissionsAsync, not request: throwing a
   * permission dialog at someone the moment they open a prayer-times list, for
   * something they never asked for, is how apps teach people to hit "deny".
   * If permission isn't granted the screen works exactly as before, and tapping
   * "קרוב" still asks properly.
   */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (live) setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      } catch {
        // Distances simply stay hidden — the screen is fully usable without them.
      }
    })();
    return () => { live = false; };
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

  // Everything the existing filters allow, before radius and time window. Kept
  // separate so the screen can say how many those two removed rather than
  // leaving someone to wonder where the rest went.
  const matching = useMemo(() => allSlots
    .filter((s) => !s.isPast)
    .filter((s) => filter === 'all' || s.type === filter)
    .filter((s) => selNusach.length === 0 || synNusachValues(s.synagogue).some((n) => selNusach.includes(n)))
    .filter((s) => selNeighborhood.length === 0 || selNeighborhood.includes(s.synagogue.neighborhood ?? '')),
    [allSlots, filter, selNusach, selNeighborhood]);

  const sorted = useMemo(() => {
    const list = matching
      // A synagogue with no coordinates is not far away, it is unknown — so a
      // radius narrows to what it can judge and leaves the rest visible rather
      // than hiding the one next door.
      .filter((s) => radiusKm === null || s.distanceKm === null || s.distanceKm <= radiusKm)
      // Meaningless on tomorrow's list, where everything is hours out.
      .filter((s) => windowMin === null || viewDay === 'tomorrow' || (s.timeMinutes - nowMin) <= windowMin);
    return [...list].sort((a, b) => {
      if (sort === 'closest' && a.distanceKm !== null && b.distanceKm !== null) {
        if (Math.abs(a.distanceKm - b.distanceKm) > 0.01) return a.distanceKm - b.distanceKm;
      }
      return a.timeMinutes - b.timeMinutes;
    });
  }, [matching, sort, radiusKm, windowMin, viewDay, nowMin]);

  // Stable identities, or React.memo on the row never holds.
  const slotKey = useCallback(
    (slot: PrayerSlot, i: number) => `${slot.synagogue.id}-${slot.type}-${slot.time}-${i}`,
    [],
  );
  const openSyn = useCallback(
    (syn: Synagogue) => navigation.navigate('SynagogueDetail', { synagogue: syn }),
    [navigation],
  );
  const renderSlot = useCallback(
    ({ item }: { item: PrayerSlot }) => (
      <PrayerSlotRow slot={item} nowMin={nowMin} viewDay={viewDay} onOpen={openSyn} />
    ),
    [nowMin, viewDay, openSyn],
  );

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

      {/* ── Narrowing: how far, and how soon ──────────────────────────────── */}
      <View style={s.narrowRow}>
        {RADIUS_OPTIONS.map((o) => {
          const active = radiusKm === o.km;
          return (
            <TouchableOpacity
              key={o.key}
              style={[s.narrowChip, active && s.narrowChipOn]}
              onPress={() => {
                setRadiusKm(active ? null : o.km);
                // Same prompt the "קרוב" sort uses — a radius without a
                // location would silently match nothing.
                if (!active && !userLoc) requestLocation();
              }}
            >
              <Ionicons name="navigate-outline" size={12}
                color={active ? Colors.white : Colors.primary} />
              <Text style={[s.narrowChipTxt, active && s.narrowChipTxtOn]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
        {viewDay === 'today' && WINDOW_OPTIONS.map((o) => {
          const active = windowMin === o.min;
          return (
            <TouchableOpacity
              key={o.key}
              style={[s.narrowChip, active && s.narrowChipOn]}
              onPress={() => setWindowMin(active ? null : o.min)}
            >
              <Ionicons name="time-outline" size={12}
                color={active ? Colors.white : Colors.primary} />
              <Text style={[s.narrowChipTxt, active && s.narrowChipTxtOn]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Says what the two narrowing chips removed, so a short list reads as
          "narrowed" rather than "there is nothing". */}
      {(radiusKm !== null || windowMin !== null) && matching.length > sorted.length && (
        <Text style={s.narrowHint}>
          {`מציג ${sorted.length} מתוך ${matching.length} תפילות`}
        </Text>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} size="large" />
      ) : sorted.length === 0 ? (
        <View style={s.emptyState}>
          {/* An empty list because the narrowing chips are set is a different
              thing from a day whose prayers are over, and saying the wrong one
              sends someone away believing there is nothing left. */}
          {matching.length > 0 ? (
            <>
              <Ionicons name="funnel-outline" size={52} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>אין תפילות בטווח שנבחר</Text>
              <Text style={s.emptySubtitle}>
                {`${matching.length} תפילות נמצאו מחוץ לטווח`}
              </Text>
              <TouchableOpacity
                style={s.clearNarrowBtn}
                onPress={() => { setRadiusKm(null); setWindowMin(null); }}
              >
                <Ionicons name="close-circle-outline" size={15} color={Colors.primary} />
                <Text style={s.clearNarrowTxt}>הצג הכל</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Ionicons name="moon-outline" size={52} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>
                {viewDay === 'today' ? 'כל התפילות הסתיימו' : 'אין תפילות למחר'}
              </Text>
              <Text style={s.emptySubtitle}>
                {viewDay === 'today' ? 'לא נותרו תפילות להיום' : 'לא נמצאו זמני תפילה ליום זה'}
              </Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={slotKey}
          renderItem={renderSlot}
          contentContainerStyle={{ padding: Spacing.md }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
        />
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

  card:         { ...CardShellFlush, flexDirection: 'row', alignItems: 'center' },
  colorBar:     { width: 4, alignSelf: 'stretch' },
  narrowRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  narrowChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.primary + '55', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  narrowChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  narrowChipTxt:   { fontSize: 12, fontWeight: '600', color: Colors.primary },
  narrowChipTxtOn: { color: Colors.white },
  narrowHint:   { fontSize: 12, color: Colors.textMuted, textAlign: 'right', paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },
  clearNarrowBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '55', borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  clearNarrowTxt: { fontSize: 13, fontWeight: '600', color: Colors.primary },
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

  travelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  travelTxt: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },
  travelTxtOff: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  travelSep: { fontSize: 11.5, color: Colors.border, marginHorizontal: 2 },

  reachLate: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
    backgroundColor: Colors.danger + '14', borderWidth: 1, borderColor: Colors.danger + '55',
  },
  reachLateTxt: { fontSize: 11.5, color: Colors.danger, fontWeight: '700' },

  reachTight: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
    backgroundColor: Colors.warning + '14', borderWidth: 1, borderColor: Colors.warning + '55',
  },
  reachTightTxt: { fontSize: 11.5, color: Colors.warning, fontWeight: '700' },
});
