import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSynagoguesFeed } from '../../context/SynagoguesContext';
import { useCityId } from '../../hooks/useCityId';
import { useTodayZmanim } from '../../hooks/useTodayZmanim';
import { useAnalyticsTrack } from '../../services/analytics';
import FilterBar, { type FilterConfig } from '../../components/FilterBar';
import { collectSelichot, type SelichotOccurrence } from '../../utils/selichotSlots';
import { selichotDayLabel } from '../../utils/selichot';
import { reachInTime, formatMinutes } from '../../utils/travel';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} מ'` : `${km.toFixed(1)} ק"מ`;
}

export default function SelichotScreen() {
  useAnalyticsTrack('selichot');
  const navigation = useNavigation<any>();
  const cityId = useCityId();
  const { top, bottom } = useSafeAreaInsets();
  const { synagogues, loading } = useSynagoguesFeed();
  const zmanim = useTodayZmanim(cityId);

  const [sort, setSort] = useState<'earliest' | 'closest'>('earliest');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [subFilters, setSubFilters] = useState<Record<string, string[]>>({ nusach: [], neighborhood: [] });
  /** Which night's list is on screen. Null until the nights load. */
  const [activeNight, setActiveNight] = useState<string | null>(null);
  /** Ticks every minute so "can I still get there" doesn't go stale on screen. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const requestLocation = useCallback(async () => {
    if (userLoc || locLoading) return;
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch {
      /* keep the earliest-first ordering */
    } finally {
      setLocLoading(false);
    }
  }, [userLoc, locLoading]);

  useEffect(() => {
    if (sort === 'closest') requestLocation();
  }, [sort, requestLocation]);

  /**
   * Read position on mount when permission was ALREADY granted.
   *
   * Distances used to be needed only by the "הקרוב" sort, so they were fetched
   * only when that sort was picked. The travel estimates need them in the
   * default (earliest-first) view too — otherwise the feature is invisible
   * exactly where someone deciding "can I still make it" is looking.
   *
   * getForegroundPermissionsAsync, never request: nobody opening a selichot
   * list asked to be prompted for location, and an unprompted dialog is how
   * apps teach people to hit deny. Without permission the screen is unchanged.
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
        // Distances stay hidden; the list still works without them.
      }
    })();
    return () => { live = false; };
  }, []);

  // All upcoming selichot, grouped by the evening they belong to.
  const nights = useMemo(
    () => collectSelichot(synagogues, zmanim, userLoc),
    [synagogues, zmanim, userLoc],
  );

  const nusachOptions = useMemo(() => {
    const set = new Set<string>();
    nights.forEach((n) => n.occurrences.forEach((o) => o.synagogue.nusach?.forEach((v) => v && set.add(v))));
    return [...set].sort((a, b) => a.localeCompare(b, 'he')).map((v) => ({ key: v, label: v }));
  }, [nights]);

  const neighborhoodOptions = useMemo(() => {
    const set = new Set<string>();
    nights.forEach((n) => n.occurrences.forEach((o) => {
      if (o.synagogue.neighborhood) set.add(o.synagogue.neighborhood);
    }));
    return [...set].sort((a, b) => a.localeCompare(b, 'he')).map((v) => ({ key: v, label: v }));
  }, [nights]);

  const filters: FilterConfig[] = useMemo(() => {
    const out: FilterConfig[] = [];
    if (nusachOptions.length > 1) out.push({ key: 'nusach', label: 'נוסח', options: nusachOptions });
    if (neighborhoodOptions.length > 1) out.push({ key: 'neighborhood', label: 'שכונה', options: neighborhoodOptions });
    return out;
  }, [nusachOptions, neighborhoodOptions]);

  const visibleNights = useMemo(() => {
    const nus = subFilters.nusach ?? [];
    const hoods = subFilters.neighborhood ?? [];
    return nights
      .map((night) => {
        let occ = night.occurrences.filter((o) => {
          if (nus.length && !(o.synagogue.nusach ?? []).some((v) => nus.includes(v))) return false;
          if (hoods.length && !hoods.includes(o.synagogue.neighborhood ?? '')) return false;
          return true;
        });
        occ = [...occ].sort((a, b) =>
          sort === 'closest' && a.distanceKm != null && b.distanceKm != null
            ? a.distanceKm - b.distanceKm
            // whenMs, not timeMinutes: the 00:30 minyan closes the day it
            // belongs to, so ordering by clock time would hoist it to the top.
            : a.whenMs - b.whenMs);
        return { ...night, occurrences: occ };
      })
      .filter((n) => n.occurrences.length > 0);
  }, [nights, subFilters, sort]);

  // Default to the soonest night, and fall back to it if the chosen night
  // disappears (filtered out, or it has simply passed).
  useEffect(() => {
    if (visibleNights.length === 0) { setActiveNight(null); return; }
    if (!activeNight || !visibleNights.some((n) => n.key === activeNight)) {
      setActiveNight(visibleNights[0].key);
    }
  }, [visibleNights, activeNight]);

  const shownNight = visibleNights.find((n) => n.key === activeNight) ?? visibleNights[0] ?? null;

  if (loading) {
    return <ActivityIndicator color={Colors.gold} size="large" style={{ marginTop: 60 }} />;
  }

  return (
    <View style={s.container}>
      {/* Own header: this screen used to be a root-stack screen and inherited
          one, but that also covered the bottom tab bar and left no way back
          except the header arrow. As a tab it keeps the bar and brings its
          own title. */}
      <View style={[s.header, { paddingTop: top + 12 }]}>
        <Ionicons name="moon" size={18} color={Colors.white} />
        <Text style={s.headerTitle}>סליחות</Text>
      </View>

      {filters.length > 0 && (
        <FilterBar
          filters={filters}
          values={{ nusach: subFilters.nusach, neighborhood: subFilters.neighborhood }}
          onChange={(key, val) => setSubFilters((p) => ({ ...p, [key]: val }))}
          sortSlot={
            <TouchableOpacity
              style={s.sortBtn}
              onPress={() => setSort((v) => (v === 'earliest' ? 'closest' : 'earliest'))}
            >
              <Ionicons
                name={sort === 'closest' ? 'location' : 'time-outline'}
                size={14}
                color={Colors.gold}
              />
              <Text style={s.sortTxt}>{sort === 'closest' ? 'הקרוב' : 'המוקדם'}</Text>
            </TouchableOpacity>
          }
        />
      )}

      {visibleNights.length > 1 && (
        // One day at a time. With every shul publishing, a week of nights
        // stacked together is hundreds of rows to scroll past.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.dayStripWrap}
          contentContainerStyle={s.dayStrip}
        >
          {visibleNights.map((night) => {
            const active = night.key === shownNight?.key;
            return (
              <TouchableOpacity
                key={night.key}
                style={[s.dayTab, active && s.dayTabOn]}
                onPress={() => setActiveNight(night.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.dayTabTxt, active && s.dayTabTxtOn]} numberOfLines={1}>
                  {night.label.split(' · ')[0]}
                </Text>
                <Text style={[s.dayTabSub, active && s.dayTabTxtOn]}>
                  {night.label.split(' · ')[1] ?? `${night.occurrences.length} מניינים`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottom + 32 }]}>
        {visibleNights.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="moon-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTxt}>אין מניני סליחות להצגה</Text>
            <Text style={s.emptyHint}>
              בתי הכנסת מזינים את זמני הסליחות דרך מסך הניהול
            </Text>
          </View>
        ) : (
          shownNight && (
            <View key={shownNight.key} style={s.nightBlock}>
              <View style={s.nightHeader}>
                <Text style={s.nightTitle}>{shownNight.label}</Text>
                <Text style={s.nightCount}>
                  {shownNight.occurrences.length === 1 ? 'מניין אחד' : `${shownNight.occurrences.length} מניינים`}
                </Text>
              </View>

              {shownNight.occurrences.map((o: SelichotOccurrence, i: number) => {
                const minutesLeft = Math.round((o.whenMs - nowMs) / 60000);
                // Only judge reachability for minyanim still ahead. A slot that
                // already began would otherwise be stamped "לא תספיק", which is
                // true but useless — it isn't a travel problem any more.
                const reach = minutesLeft > 0
                  ? reachInTime(o.distanceKm, minutesLeft)
                  : { kind: 'unknown' as const, walkMin: 0, driveMin: 0 };
                const cantWalk = reach.kind === 'drive-only' || reach.kind === 'late';
                return (
                <TouchableOpacity
                  key={`${o.synagogue.id}-${i}`}
                  style={s.row}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('SynagogueDetail', { synagogue: o.synagogue })}
                >
                  <Text style={s.time}>{o.time}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.synName} numberOfLines={1}>{o.synagogue.name}</Text>
                    <Text style={s.synMeta} numberOfLines={1}>
                      {[
                        selichotDayLabel(o.dayNum, o.time),
                        o.synagogue.neighborhood,
                        (o.synagogue.nusach ?? []).join(' / '),
                      ].filter(Boolean).join(' · ')}
                    </Text>
                    {!!o.notes && <Text style={s.note} numberOfLines={1}>{o.notes}</Text>}
                    {reach.kind !== 'unknown' && (
                      <View style={s.travelRow}>
                        <Ionicons name="walk-outline" size={11}
                          color={cantWalk ? Colors.textMuted : Colors.textSecondary} />
                        <Text style={[s.travelTxt, cantWalk && s.travelTxtOff]}>
                          {formatMinutes(reach.walkMin)}
                        </Text>
                        <Text style={s.travelSep}>·</Text>
                        <Ionicons name="car-outline" size={11}
                          color={reach.kind === 'late' ? Colors.textMuted : Colors.textSecondary} />
                        <Text style={[s.travelTxt, reach.kind === 'late' && s.travelTxtOff]}>
                          {formatMinutes(reach.driveMin)}
                        </Text>
                        {reach.kind === 'late' && <Text style={s.reachLateTxt}>· לא תספיק</Text>}
                        {reach.kind === 'drive-only' && <Text style={s.reachTightTxt}>· ברכב בלבד</Text>}
                        {reach.kind === 'walk-tight' && <Text style={s.reachTightTxt}>· בקושי תספיק</Text>}
                      </View>
                    )}
                  </View>
                  {o.distanceKm != null && (
                    <Text style={s.dist}>{formatDist(o.distanceKm)}</Text>
                  )}
                </TouchableOpacity>
                );
              })}
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingBottom: 12, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.gold,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.white },
  content:   { padding: Spacing.md },

  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  sortTxt: { fontSize: 12, fontWeight: '700', color: Colors.gold },

  dayStripWrap: { flexGrow: 0, flexShrink: 0 },
  dayStrip: { gap: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  dayTab: {
    minWidth: 86, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  dayTabOn:     { backgroundColor: Colors.gold, borderColor: Colors.gold },
  dayTabTxt:    { fontSize: 13, fontWeight: '800', color: Colors.text },
  dayTabHeb:    { fontSize: 11.5, fontWeight: '700', color: Colors.gold, marginTop: 2 },
  dayTabSub:    { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  dayTabTxtOn:  { color: Colors.white },

  nightBlock: { marginBottom: Spacing.lg },
  nightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  nightTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  nightCount: { fontSize: 12, color: Colors.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: 8,
    ...Shadow.card,
  },
  time:    { fontSize: 18, fontWeight: '800', color: Colors.gold, minWidth: 56 },
  synName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  synMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  note:    { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  dist:    { fontSize: 12, color: Colors.textMuted },

  travelRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  travelTxt:    { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  travelTxtOff: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  travelSep:    { fontSize: 11, color: Colors.border, marginHorizontal: 1 },
  reachLateTxt:  { fontSize: 11, color: Colors.danger, fontWeight: '700' },
  reachTightTxt: { fontSize: 11, color: Colors.warning, fontWeight: '700' },

  empty:     { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt:  { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
});
