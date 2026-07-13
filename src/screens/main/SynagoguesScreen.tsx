import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Animated,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAnalyticsTrack } from '../../services/analytics';
import * as Location from 'expo-location';
import { useSynagogues } from '../../hooks/useSynagogues';
import { useCityId } from '../../hooks/useCityId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCity } from '../../hooks/useCity';
import { useTodayZmanim } from '../../hooks/useTodayZmanim';
import { useFavorites } from '../../context/FavoritesContext';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { haversineKm, formatDist } from '../../utils/location';
import { getSlotLabel } from '../../utils/prayerUtils';
import { Synagogue } from '../../types';
import FilterBar from '../../components/FilterBar';
import FavoritePrayerModal, { ModalOptions } from '../../components/FavoritePrayerModal';
import { collectShiurim } from '../../utils/prayerNotifications';
import { formatDays } from '../../utils/prayerUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function synNusachValues(syn: Synagogue): string[] {
  if (Array.isArray(syn.nusach)) return syn.nusach.filter(Boolean);
  return syn.nusach ? [syn.nusach as unknown as string] : [];
}

const DEFAULT_REGION: Region = {
  latitude: 31.7767, longitude: 35.2988, latitudeDelta: 0.018, longitudeDelta: 0.018,
};

const MAP_STYLE = [
  { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SynagoguesScreen() {
  useAnalyticsTrack('synagogues');
  const cityId     = useCityId();
  const { top, bottom } = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { synagogues, loading } = useSynagogues(cityId, focused);
  const { city }   = useCity(cityId);
  const navigation = useNavigation<any>();

  const [search,        setSearch]        = useState('');
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [sort,          setSort]          = useState<'alpha' | 'distance'>('alpha');
  const [filters,       setFilters]       = useState<Record<string, string[]>>({ nusach: [], neighborhood: [] });
  const [userLoc,       setUserLoc]       = useState<{ lat: number; lon: number } | null>(null);
  const [locLoading,    setLocLoading]    = useState(false);
  const [selectedSynId, setSelectedSynId] = useState<string | null>(null);
  const [viewMode,      setViewMode]      = useState<'list' | 'map'>('list');
  const [modalSyn,      setModalSyn]      = useState<Synagogue | null>(null);

  const mapRef    = useRef<MapView>(null);
  const regionRef = useRef<Region>(DEFAULT_REGION);
  // Sliding card animation — starts off-screen below
  const cardSlide = useRef(new Animated.Value(400)).current;

  const { isFavorite, getFavoriteSetting, setFavorite, removeFavorite } = useFavorites();
  const todayZmanim = useTodayZmanim(cityId);

  // ── Modal options ──────────────────────────────────────────────────────────
  const modalOptions = useMemo<ModalOptions>(() => {
    const empty: ModalOptions = { shacharit: [], mincha: [], maariv: [], shiurim: [] };
    if (!modalSyn) return empty;
    const buildSlots = (type: 'shacharit' | 'mincha' | 'maariv') =>
      (modalSyn.weeklySchedule?.[type] ?? []).map((slot, i) => ({
        index: i,
        label: getSlotLabel(slot, todayZmanim),
        notes: slot.notes ?? undefined,
      }));
    const shiurim = collectShiurim(modalSyn).map((sh, i) => ({
      index: i, title: sh.title, rabbi: sh.rabbi, time: sh.time,
      daysLabel: sh.days === 'daily' ? 'יומי' : formatDays(sh.days as number[]),
    }));
    return { shacharit: buildSlots('shacharit'), mincha: buildSlots('mincha'), maariv: buildSlots('maariv'), shiurim };
  }, [modalSyn, todayZmanim]);

  // ── Map region ─────────────────────────────────────────────────────────────
  const mapRegion = useMemo<Region>(() => {
    const wc = synagogues.filter((s) => s.latitude && s.longitude);
    if (!wc.length) {
      if (city) return { latitude: city.latitude, longitude: city.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 };
      return DEFAULT_REGION;
    }
    const lats = wc.map((s) => s.latitude!);
    const lons = wc.map((s) => s.longitude!);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.015),
      longitudeDelta: Math.max((maxLon - minLon) * 1.5, 0.015),
    };
  }, [city, synagogues]);

  useEffect(() => {
    if (!loading) {
      regionRef.current = mapRegion;
      if (viewMode === 'map') {
        const t = setTimeout(() => mapRef.current?.animateToRegion(mapRegion, 600), 400);
        return () => clearTimeout(t);
      }
    }
  }, [loading, viewMode, mapRegion]);

  // ── Pin press — animate card sliding up ────────────────────────────────────
  function handlePinPress(syn: Synagogue) {
    setSelectedSynId(syn.id);
    // Always slide card in from bottom (even when switching pins)
    cardSlide.setValue(400);
    Animated.spring(cardSlide, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();

    if (syn.latitude && syn.longitude) {
      const PIN_DELTA = 0.010;
      mapRef.current?.animateToRegion({
        latitude: syn.latitude - PIN_DELTA * 0.25,
        longitude: syn.longitude,
        latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA,
      }, 350);
    }
  }

  // ── Close card — slide back down ───────────────────────────────────────────
  function closeCard() {
    Animated.spring(cardSlide, {
      toValue: 400, useNativeDriver: true, bounciness: 0, speed: 22,
    }).start(() => setSelectedSynId(null));
  }

  // ── Location ───────────────────────────────────────────────────────────────
  async function requestLocation() {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('הרשאת מיקום', 'כדי למיין לפי מרחק, יש לאפשר גישה למיקום בהגדרות'); setSort('alpha'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch { Alert.alert('שגיאה', 'לא ניתן לקבל מיקום'); setSort('alpha'); }
    finally { setLocLoading(false); }
  }

  function handleSort(val: 'alpha' | 'distance') {
    setSort(val);
    if (val === 'distance' && !userLoc) requestLocation();
  }

  const getDist = (syn: Synagogue) => {
    if (!userLoc || !syn.latitude) return null;
    return haversineKm(userLoc.lat, userLoc.lon, syn.latitude, syn.longitude!);
  };

  // ── Filters ────────────────────────────────────────────────────────────────
  const availableNusachim = useMemo(() => {
    const set = new Set<string>();
    synagogues.forEach((s) => synNusachValues(s).forEach((v) => set.add(v)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [synagogues]);

  const availableNeighborhoods = useMemo(() => {
    const set = new Set<string>();
    synagogues.forEach((s) => { if (s.neighborhood) set.add(s.neighborhood); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [synagogues]);

  const visible = synagogues
    .filter((s) => filters.nusach.length === 0 || synNusachValues(s).some((n) => filters.nusach.includes(n)))
    .filter((s) => filters.neighborhood.length === 0 || filters.neighborhood.includes(s.neighborhood ?? ''))
    .filter((s) => !search || s.name.includes(search) || (s.address.he ?? s.address.en ?? '').includes(search))
    .sort((a, b) => {
      if (sort === 'distance') { const da = getDist(a), db = getDist(b); if (da !== null && db !== null) return da - db; }
      return a.name.localeCompare(b.name, 'he');
    });

  const selectedSyn = useMemo(() => visible.find((s) => s.id === selectedSynId) ?? null, [visible, selectedSynId]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: top + 16 }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>בתי כנסת</Text>
            <Text style={s.subtitle}>{loading ? '...' : `${visible.length} בתי כנסת`}</Text>
          </View>
          <View style={s.headerActions}>
            {/* Map / List toggle */}
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => { setViewMode((v) => v === 'list' ? 'map' : 'list'); setSelectedSynId(null); }}
              activeOpacity={0.8}
            >
              <Ionicons name={viewMode === 'list' ? 'map-outline' : 'list-outline'} size={20} color={Colors.white} />
            </TouchableOpacity>
            {/* Search toggle */}
            <TouchableOpacity
              style={[s.headerBtn, searchOpen && s.headerBtnActive]}
              onPress={() => { setSearchOpen((o) => !o); if (searchOpen) setSearch(''); }}
              activeOpacity={0.8}
            >
              <Ionicons name={searchOpen ? 'close' : 'search'} size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      {searchOpen && (
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput scrollEnabled={false}
            style={s.searchInput} placeholder="חפש שם או כתובת..." value={search}
            onChangeText={setSearch} textAlign="right" autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <FilterBar
        values={filters}
        onChange={(key, val) => setFilters((p) => ({ ...p, [key]: val }))}
        filters={[
          { key: 'nusach', label: 'נוסח', options: availableNusachim.map((n) => ({ key: n, label: n })), activeColor: Colors.primary },
          ...(availableNeighborhoods.length > 0
            ? [{ key: 'neighborhood', label: 'שכונה', options: availableNeighborhoods.map((n) => ({ key: n, label: n })), activeColor: Colors.kosher }]
            : []),
        ]}
        sortSlot={
          <View style={s.sortGroup}>
            <TouchableOpacity style={[s.sortBtn, sort === 'alpha' && s.sortBtnActive]} onPress={() => handleSort('alpha')}>
              <Ionicons name="text-outline" size={13} color={sort === 'alpha' ? Colors.white : Colors.primary} />
              <Text style={[s.sortTxt, sort === 'alpha' && s.sortTxtActive]}>א–ת</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sortBtn, sort === 'distance' && s.sortBtnActive]} onPress={() => handleSort('distance')}>
              {locLoading
                ? <ActivityIndicator size="small" color={sort === 'distance' ? Colors.white : Colors.primary} />
                : <Ionicons name="navigate-outline" size={13} color={sort === 'distance' ? Colors.white : Colors.primary} />}
              <Text style={[s.sortTxt, sort === 'distance' && s.sortTxtActive]}>מרחק</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} size="large" />
      ) : viewMode === 'list' ? (

        /* ── LIST MODE ── */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {visible.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>לא נמצאו בתי כנסת</Text>
            </View>
          )}
          {visible.map((syn) => {
            const dist       = getDist(syn);
            const fav        = isFavorite(syn.id);
            return (
              <TouchableOpacity
                key={syn.id}
                style={[s.card, fav && s.cardFav]}
                onPress={() => navigation.navigate('SynagogueDetail', { synagogue: syn })}
                activeOpacity={0.82}
              >
                <View style={s.cardRow}>
                  <View style={s.cardLeft}>
                    <Text style={s.cardName}>{syn.name}</Text>
                    <Text style={s.cardAddr}>{syn.address.he ?? syn.address.en ?? ''}</Text>
                    <View style={s.cardMeta}>
                      {syn.nusach && (
                        <View style={s.nusachBadge}><Text style={s.nusachBadgeTxt}>{synNusachValues(syn).join(' / ')}</Text></View>
                      )}
                      {syn.neighborhood && (
                        <View style={s.neighborhoodBadge}>
                          <Ionicons name="location-outline" size={10} color={Colors.textSecondary} />
                          <Text style={s.neighborhoodBadgeTxt}>{syn.neighborhood}</Text>
                        </View>
                      )}
                      {syn.rabbi && <Text style={s.cardRabbi}>רב: {syn.rabbi}</Text>}
                    </View>
                  </View>
                  <View style={s.cardRight}>
                    {dist !== null && (
                      <View style={s.distBadge}>
                        <Ionicons name="navigate-outline" size={10} color={Colors.primaryLight} />
                        <Text style={s.distTxt}>{formatDist(dist)}</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => setModalSyn(syn)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name={fav ? 'star' : 'star-outline'} size={26} color={fav ? Colors.goldBright : Colors.textMuted} />
                    </TouchableOpacity>
                    <Ionicons name="chevron-back-outline" size={22} color={Colors.textMuted} />
                  </View>
                </View>
                {/* {syn.shiurim && syn.shiurim.length > 0 && (
                  <View style={s.shiurPill}>
                    <Ionicons name="book-outline" size={11} color={Colors.primaryLight} />
                    <Text style={s.shiurPillTxt}>{syn.shiurim.length} שיעורים</Text>
                  </View>
                )} */}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

      ) : (

        /* ── MAP MODE ── */
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={mapRegion}
            showsUserLocation
            showsMyLocationButton
            customMapStyle={MAP_STYLE}
            onRegionChangeComplete={(r) => { regionRef.current = r; }}
            onPress={() => { if (selectedSynId) closeCard(); }}
          >
            {visible.filter((syn) => syn.latitude && syn.longitude).map((syn) => {
              const fav      = isFavorite(syn.id);
              const selected = syn.id === selectedSynId;
              const color = fav ? Colors.gold : selected ? Colors.primaryDark : Colors.primary;
              return (
                <Marker
                  key={`${syn.id}-${color}`}
                  coordinate={{ latitude: syn.latitude!, longitude: syn.longitude! }}
                  onPress={() => handlePinPress(syn)}
                  pinColor={color}
                  tracksViewChanges={false}
                />
              );
            })}
          </MapView>

          {/* ── Animated floating card ── */}
          <Animated.View style={[s.mapCard, { bottom: 10, transform: [{ translateY: cardSlide }] }]}>
            {selectedSyn && (
              <TouchableOpacity
                style={s.mapCardInner}
                onPress={() => navigation.navigate('SynagogueDetail', { synagogue: selectedSyn })}
                activeOpacity={0.85}
              >
                <View style={s.mapCardContent}>
                  <View style={s.mapCardBody}>
                    <Text style={s.mapCardName}>{selectedSyn.name}</Text>
                    <Text style={s.mapCardAddr}>{selectedSyn.address.he ?? selectedSyn.address.en ?? ''}</Text>
                    <View style={s.mapCardMeta}>
                      {selectedSyn.nusach && (
                        <View style={s.nusachBadge}><Text style={s.nusachBadgeTxt}>{synNusachValues(selectedSyn).join(' / ')}</Text></View>
                      )}
                      {selectedSyn.neighborhood && (
                        <View style={s.neighborhoodBadge}>
                          <Ionicons name="location-outline" size={10} color={Colors.textSecondary} />
                          <Text style={s.neighborhoodBadgeTxt}>{selectedSyn.neighborhood}</Text>
                        </View>
                      )}
                      {(() => { const d = getDist(selectedSyn); return d !== null ? (
                        <View style={s.distBadge}>
                          <Ionicons name="navigate-outline" size={10} color={Colors.primaryLight} />
                          <Text style={s.distTxt}>{formatDist(d)}</Text>
                        </View>
                      ) : null; })()}
                    </View>
                    {selectedSyn.shiurim && selectedSyn.shiurim.length > 0 && (
                      <View style={[s.shiurPill, { marginTop: 6 }]}>
                        <Ionicons name="book-outline" size={11} color={Colors.primaryLight} />
                        <Text style={s.shiurPillTxt}>{selectedSyn.shiurim.length} שיעורים</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.mapCardActions}>
                    <TouchableOpacity
                      onPress={() => setModalSyn(selectedSyn)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons
                        name={isFavorite(selectedSyn.id) ? 'star' : 'star-outline'}
                        size={24}
                        color={isFavorite(selectedSyn.id) ? Colors.goldBright : Colors.textMuted}
                      />
                    </TouchableOpacity>
                    <Ionicons name="chevron-back" size={20} color={Colors.textMuted} />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      )}

      {/* Favourite modal — always present */}
      <FavoritePrayerModal
        visible={modalSyn !== null}
        synName={modalSyn?.name ?? ''}
        current={modalSyn ? getFavoriteSetting(modalSyn.id) : null}
        options={modalOptions}
        onSave={(setting) => { if (modalSyn) setFavorite(modalSyn.id, setting); setModalSyn(null); }}
        onRemove={() => { if (modalSyn) removeFavorite(modalSyn.id); setModalSyn(null); }}
        onClose={() => setModalSyn(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ── Header ──────────────────────────────────────────────────────────────
  header: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  headerRow:     { flexDirection: 'row', alignItems: 'flex-end' },
  title:         { fontSize: 26, fontWeight: '800', color: Colors.white },
  subtitle:      { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerBtnActive: { backgroundColor: 'rgba(255,255,255,0.30)' },

  // ── Search ───────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.cardBackground,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },

  // ── Sort buttons ─────────────────────────────────────────────────────────
  sortGroup:     { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primary, overflow: 'hidden' },
  sortBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
  sortBtnActive: { backgroundColor: Colors.primary },
  sortTxt:       { fontSize: 12, fontWeight: '700', color: Colors.primary },
  sortTxtActive: { color: Colors.white },

  // ── List cards ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.card,
  },
  cardFav: { borderWidth: 1.5, borderColor: Colors.goldBright + '55', backgroundColor: '#FFFDF0' },
  cardRow:  { flexDirection: 'row', alignItems: 'center' },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  cardAddr: { fontSize: 13, color: Colors.textSecondary},
  cardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 5 },

  nusachBadge:          { backgroundColor: Colors.primary + '18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  nusachBadgeTxt:       { fontSize: 11, color: Colors.primary, fontWeight: '700' },
  neighborhoodBadge:    { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  neighborhoodBadgeTxt: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  cardRabbi:            { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },

  cardRight: { alignItems: 'flex-end', gap: 4, marginRight: Spacing.sm },
  distBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  distTxt:   { fontSize: 12, fontWeight: '700', color: Colors.primaryLight },

  shiurPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6 },
  shiurPillTxt: { fontSize: 12, color: Colors.primaryLight, fontWeight: '600' },

  empty:     { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: 80 },
  emptyText: { fontSize: 16, color: Colors.textMuted },

  // ── Map ───────────────────────────────────────────────────────────────────

  // ── Animated floating card ────────────────────────────────────────────────
  // Transparent positioning container
  mapCard: {
    position: 'absolute', left: 16, right: 16,
  },
  // Inner card with visual styling (separate from the Animated container)
  mapCardInner: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22, shadowRadius: 24, elevation: 28,
  },
  mapCardContent: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  mapCardBody:    { flex: 1 },
  mapCardActions: { alignItems: 'center', gap: 10 },
  mapCardName:    { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 3 },
  mapCardAddr:    { fontSize: 13, color: Colors.textSecondary },
  mapCardMeta:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },

});
