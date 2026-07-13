import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Animated,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAnalyticsTrack } from '../../services/analytics';
import MikvehCard from '../../components/MikvehCard';
import FilterBar from '../../components/FilterBar';
import { useMikvaot } from '../../hooks/useMikvaot';
import { useCityId } from '../../hooks/useCityId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCity } from '../../hooks/useCity';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { haversineKm, formatDist } from '../../utils/location';

const TYPE_LABELS: Record<string, string> = {
  women: '👩 נשים', men: '👨 גברים', both: '♾ שניהם',
};

const DEFAULT_REGION: Region = {
  latitude: 31.7767, longitude: 35.2988, latitudeDelta: 0.018, longitudeDelta: 0.018,
};

const MAP_STYLE = [
  { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MikvehScreen() {
  useAnalyticsTrack('mikveh');
  const navigation = useNavigation<any>();
  const cityId     = useCityId();
  const { top, bottom } = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { mikvaot, loading, error } = useMikvaot(cityId, focused);
  const { city } = useCity(cityId);

  const [filters,    setFilters]    = useState<Record<string, string[]>>({ type: [], neighborhood: [] });
  const [search,     setSearch]     = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort,       setSort]       = useState<'alpha' | 'distance'>('alpha');
  const [userLoc,    setUserLoc]    = useState<{ lat: number; lon: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode,   setViewMode]   = useState<'list' | 'map'>('list');

  const mapRef    = useRef<MapView>(null);
  const regionRef = useRef<Region>(DEFAULT_REGION);
  // Sliding card animation
  const cardSlide = useRef(new Animated.Value(400)).current;

  // ── Map region ─────────────────────────────────────────────────────────────
  const mapRegion = useMemo<Region>(() => {
    const wc = mikvaot.filter((m) => m.latitude && m.longitude);
    if (!wc.length) {
      if (city) return { latitude: city.latitude, longitude: city.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 };
      return DEFAULT_REGION;
    }
    const lats = wc.map((m) => m.latitude!);
    const lons = wc.map((m) => m.longitude!);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.015),
      longitudeDelta: Math.max((maxLon - minLon) * 1.5, 0.015),
    };
  }, [city, mikvaot]);

  useEffect(() => {
    if (!loading) {
      regionRef.current = mapRegion;
      if (viewMode === 'map') {
        const t = setTimeout(() => mapRef.current?.animateToRegion(mapRegion, 600), 400);
        return () => clearTimeout(t);
      }
    }
  }, [loading, viewMode, mapRegion]);

  // ── Pin press — animate card in ────────────────────────────────────────────
  function handlePinPress(m: typeof mikvaot[0]) {
    setSelectedId(m.id);
    cardSlide.setValue(400);
    Animated.spring(cardSlide, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();
    if (m.latitude && m.longitude) {
      const PIN_DELTA = 0.010;
      mapRef.current?.animateToRegion({
        latitude: m.latitude - PIN_DELTA * 0.25,
        longitude: m.longitude,
        latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA,
      }, 350);
    }
  }

  // ── Close card ─────────────────────────────────────────────────────────────
  function closeCard() {
    Animated.spring(cardSlide, {
      toValue: 400, useNativeDriver: true, bounciness: 0, speed: 22,
    }).start(() => setSelectedId(null));
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

  const getDist = (m: { latitude?: number; longitude?: number }) => {
    if (!userLoc || !m.latitude) return null;
    return haversineKm(userLoc.lat, userLoc.lon, m.latitude, m.longitude!);
  };

  // ── Filter options ─────────────────────────────────────────────────────────
  const typeOptions = useMemo(() => {
    const types = new Set(mikvaot.map((m) => m.type));
    return ['women', 'men', 'both'].filter((t) => types.has(t as any)).map((t) => ({ key: t, label: TYPE_LABELS[t] }));
  }, [mikvaot]);

  const neighborhoodOptions = useMemo(() => {
    const set = new Set<string>();
    mikvaot.forEach((m) => { if (m.neighborhood) set.add(m.neighborhood); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he')).map((n) => ({ key: n, label: n }));
  }, [mikvaot]);

  const visible = mikvaot
    .filter((m) => {
      if (filters.type.length > 0 && !filters.type.includes(m.type)) return false;
      if (filters.neighborhood.length > 0 && !filters.neighborhood.includes(m.neighborhood ?? '')) return false;
      if (search && !m.name.includes(search) && !m.address.includes(search)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'distance') { const da = getDist(a), db = getDist(b); if (da !== null && db !== null) return da - db; }
      return a.name.localeCompare(b.name, 'he');
    });

  const selectedMikveh = useMemo(() => visible.find((m) => m.id === selectedId) ?? null, [visible, selectedId]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: top + 16 }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>מקוואות</Text>
            <Text style={s.subtitle}>{loading ? '...' : `${visible.length} מקוואות`}</Text>
          </View>
          <View style={s.headerActions}>
            {/* Map / List toggle */}
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => { setViewMode((v) => v === 'list' ? 'map' : 'list'); setSelectedId(null); }}
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
            style={s.searchInput} placeholder="חפש מקווה..." value={search}
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
          { key: 'type', label: 'סוג', options: typeOptions, multiSelect: false, activeColor: Colors.mikveh },
          ...(neighborhoodOptions.length > 0
            ? [{ key: 'neighborhood', label: 'שכונה', options: neighborhoodOptions, activeColor: Colors.mikveh }]
            : []),
        ]}
        sortSlot={
          <View style={s.sortGroup}>
            <TouchableOpacity style={[s.sortBtn, sort === 'alpha' && s.sortBtnActive]} onPress={() => handleSort('alpha')}>
              <Ionicons name="text-outline" size={13} color={sort === 'alpha' ? Colors.white : Colors.mikveh} />
              <Text style={[s.sortTxt, sort === 'alpha' && s.sortTxtActive]}>א–ת</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sortBtn, sort === 'distance' && s.sortBtnActive]} onPress={() => handleSort('distance')}>
              {locLoading
                ? <ActivityIndicator size="small" color={sort === 'distance' ? Colors.white : Colors.mikveh} />
                : <Ionicons name="navigate-outline" size={13} color={sort === 'distance' ? Colors.white : Colors.mikveh} />}
              <Text style={[s.sortTxt, sort === 'distance' && s.sortTxtActive]}>מרחק</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={Colors.mikveh} style={{ marginTop: 60 }} size="large" />
      ) : error ? (
        <Text style={s.errorText}>שגיאה בטעינת הנתונים: {error}</Text>
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
              <Ionicons name="water-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>לא נמצאו מקוואות</Text>
            </View>
          )}
          {visible.map((m) => {
            const dist = getDist(m);
            return (
              <View key={m.id} style={s.cardWrap}>
                <MikvehCard
                  mikveh={m}
                  distLabel={dist !== null ? formatDist(dist) : undefined}
                  onPress={() => navigation.navigate('MikvehDetail', { mikvehId: m.id })}
                />
              </View>
            );
          })}

          <View style={s.infoBox}>
            <Text style={s.infoTitle}>💡 שימו לב</Text>
            <Text style={s.infoText}>
              שעות הפתיחה עשויות להשתנות בחגים ובשבתות. מומלץ לאמת טלפונית לפני ביקור.
            </Text>
          </View>
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
            onPress={() => { if (selectedId) closeCard(); }}
          >
            {visible.filter((m) => m.latitude && m.longitude).map((m) => (
              <Marker
                key={`${m.id}-${m.id === selectedId}`}
                coordinate={{ latitude: m.latitude!, longitude: m.longitude! }}
                onPress={() => handlePinPress(m)}
                pinColor={m.id === selectedId ? Colors.primaryDark : Colors.mikveh}
                tracksViewChanges={false}
              />
            ))}
          </MapView>

          {/* ── Animated floating card ── */}
          <Animated.View style={[s.mapCard, { bottom: 10, transform: [{ translateY: cardSlide }] }]}>
            {selectedMikveh && (
              <MikvehCard
                mikveh={selectedMikveh}
                distLabel={(() => { const d = getDist(selectedMikveh); return d !== null ? formatDist(d) : undefined; })()}
                onPress={() => navigation.navigate('MikvehDetail', { mikvehId: selectedMikveh.id })}
                cardStyle={{ marginBottom: 0 }}
              />
            )}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header:        { backgroundColor: Colors.mikveh, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
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

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.cardBackground,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },

  sortGroup:     { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.mikveh, overflow: 'hidden' },
  sortBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
  sortBtnActive: { backgroundColor: Colors.mikveh },
  sortTxt:       { fontSize: 12, fontWeight: '700', color: Colors.mikveh },
  sortTxtActive: { color: Colors.white },

  errorText: { textAlign: 'center', color: Colors.danger, marginTop: 40, padding: Spacing.md },

  // ── List mode ─────────────────────────────────────────────────────────────
  cardWrap:  { marginBottom: Spacing.sm },
  empty:     { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: 80 },
  emptyText: { fontSize: 16, color: Colors.textMuted },

  infoBox:   { backgroundColor: Colors.accentLight, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
  infoTitle: { fontSize: 14, fontWeight: '700', color: Colors.primaryDark, marginBottom: 4 },
  infoText:  { fontSize: 13, color: Colors.primaryDark, lineHeight: 19 },

  // ── Map mode ──────────────────────────────────────────────────────────────

  // Transparent positioning container — MikvehCard provides its own visuals
  mapCard: {
    position: 'absolute', left: 16, right: 16,
  },
});
