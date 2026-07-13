import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Animated,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import RestaurantCard from '../../components/RestaurantCard';
import FilterBar from '../../components/FilterBar';
import { restaurantCategories, certificationTags, sortCertTags } from '../../services/restaurants';
import { useRestaurants } from '../../hooks/useRestaurants';
import { useCityId } from '../../hooks/useCityId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCity } from '../../hooks/useCity';
import { useKashrutUpdates } from '../../context/KashrutUpdatesContext';
import { useAnalyticsTrack } from '../../services/analytics';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { haversineKm, formatDist } from '../../utils/location';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { key: 'meat',   label: '🥩 בשרי' },
  { key: 'dairy',  label: '🧀 חלבי' },
  { key: 'pareve', label: '🌿 פרווה' },
  { key: 'vegan',  label: '🌱 טבעוני' },
  { key: 'cafe',   label: '☕ קפה' },
  { key: 'bakery', label: '🥐 מאפייה' },
];

const BUSINESS_TYPE_OPTIONS = [
  { key: 'serving', label: '🍴 בתי אוכל' },
  { key: 'factory', label: '🏭 מפעלים' },
];

const DEFAULT_REGION: Region = {
  latitude: 31.7767, longitude: 35.2988, latitudeDelta: 0.018, longitudeDelta: 0.018,
};

const MAP_STYLE = [
  { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RestaurantsScreen() {
  useAnalyticsTrack('kosher');
  const cityId     = useCityId();
  const navigation = useNavigation<any>();
  const { top, bottom } = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { restaurants, loading, error } = useRestaurants(cityId, focused);
  const { city } = useCity(cityId);
  const { count: kashrutCount, totalCount: kashrutTotal, hasDowngrade } = useKashrutUpdates();

  const [filters,    setFilters]    = useState<Record<string, string[]>>({ businessType: [], category: [], neighborhood: [], kashrut: [] });
  const [search,     setSearch]     = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort,       setSort]       = useState<'alpha' | 'distance'>('alpha');
  const [userLoc,    setUserLoc]    = useState<{ lat: number; lon: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode,   setViewMode]   = useState<'list' | 'map'>('list');

  const mapRef    = useRef<MapView>(null);
  const regionRef = useRef<Region>(DEFAULT_REGION);
  const cardSlide = useRef(new Animated.Value(400)).current;

  // ── Map region ────────────────────────────────────────────────────────────
  const mapRegion = useMemo<Region>(() => {
    const wc = restaurants.filter((r) => r.latitude && r.longitude);
    if (!wc.length) {
      if (city) return { latitude: city.latitude, longitude: city.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 };
      return DEFAULT_REGION;
    }
    const lats = wc.map((r) => r.latitude!);
    const lons = wc.map((r) => r.longitude!);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.015),
      longitudeDelta: Math.max((maxLon - minLon) * 1.5, 0.015),
    };
  }, [city, restaurants]);

  useEffect(() => {
    if (!loading) {
      regionRef.current = mapRegion;
      if (viewMode === 'map') {
        const t = setTimeout(() => mapRef.current?.animateToRegion(mapRegion, 600), 400);
        return () => clearTimeout(t);
      }
    }
  }, [loading, viewMode, mapRegion]);

  // ── Pin press ─────────────────────────────────────────────────────────────
  function handlePinPress(r: typeof restaurants[0]) {
    setSelectedId(r.id);
    cardSlide.setValue(400);
    Animated.spring(cardSlide, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();
    if (r.latitude && r.longitude) {
      const PIN_DELTA = 0.010;
      mapRef.current?.animateToRegion(
        { latitude: r.latitude - PIN_DELTA * 0.25, longitude: r.longitude, latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA },
        350,
      );
    }
  }

  function closeCard() {
    Animated.spring(cardSlide, { toValue: 400, useNativeDriver: true, bounciness: 0, speed: 22 })
      .start(() => setSelectedId(null));
  }

  // ── Location ──────────────────────────────────────────────────────────────
  async function requestLocation() {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('הרשאת מיקום', 'כדי למיין לפי מרחק, יש לאפשר גישה למיקום בהגדרות');
        setSort('alpha'); return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch { Alert.alert('שגיאה', 'לא ניתן לקבל מיקום'); setSort('alpha'); }
    finally { setLocLoading(false); }
  }

  function handleSort(val: 'alpha' | 'distance') {
    setSort(val);
    if (val === 'distance' && !userLoc) requestLocation();
  }

  const getDist = (r: { latitude?: number; longitude?: number }) => {
    if (!userLoc || !r.latitude) return null;
    return haversineKm(userLoc.lat, userLoc.lon, r.latitude, r.longitude!);
  };

  // ── Filter options ────────────────────────────────────────────────────────
  const availableNeighborhoods = useMemo(() => {
    const set = new Set<string>();
    restaurants.filter((r) => !r.isHidden).forEach((r) => { if (r.neighborhood) set.add(r.neighborhood); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he')).map((n) => ({ key: n, label: n }));
  }, [restaurants]);

  const availableCertTags = useMemo(() => {
    const set = new Set<string>();
    restaurants.filter((r) => !r.isHidden).forEach((r) => certificationTags(r).forEach((t) => set.add(t)));
    return sortCertTags([...set]);
  }, [restaurants]);

  const visible = restaurants
    .filter((r) => {
      if (r.isHidden) return false;
      if (filters.businessType.length > 0 && !filters.businessType.includes(r.businessType ?? 'serving')) return false;
      if (filters.category.length > 0 && !restaurantCategories(r).some((c) => filters.category.includes(c))) return false;
      if (filters.neighborhood.length > 0 && !filters.neighborhood.includes(r.neighborhood ?? '')) return false;
      if (filters.kashrut.length > 0 && !certificationTags(r).some((t) => filters.kashrut.includes(t))) return false;
      if (search && !r.name.includes(search) && !r.address.includes(search)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === 'distance') { const da = getDist(a), db = getDist(b); if (da !== null && db !== null) return da - db; }
      return a.name.localeCompare(b.name, 'he');
    });

  const selectedRestaurant = useMemo(
    () => visible.find((r) => r.id === selectedId) ?? null,
    [visible, selectedId],
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: top + 16 }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>עסקים כשרים</Text>
            <Text style={s.subtitle}>
              {loading ? '...' : `${visible.length} מתוך ${restaurants.filter((r) => !r.isHidden).length} עסקים`}
            </Text>
          </View>
          <View style={s.headerActions}>
            {/* Map / List toggle */}
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => { setViewMode((v) => v === 'list' ? 'map' : 'list'); setSelectedId(null); }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={viewMode === 'list' ? 'map-outline' : 'list-outline'}
                size={20}
                color={Colors.white}
              />
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
            style={s.searchInput}
            placeholder="חפש עסק..."
            value={search}
            onChangeText={setSearch}
            textAlign="right"
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Kashrut updates banner — stays until all dismissed ── */}
      {kashrutTotal > 0 && (
        <TouchableOpacity
          style={[
            s.kashrutBanner,
            kashrutCount > 0 && hasDowngrade && s.kashrutBannerWarn,
            kashrutCount === 0 && s.kashrutBannerAllRead,
          ]}
          onPress={() => navigation.navigate('KashrutUpdates')}
          activeOpacity={0.85}
        >
          {kashrutCount > 0 ? (
            <View style={[s.kashrutBadge, hasDowngrade && { backgroundColor: Colors.danger }]}>
              <Text style={s.kashrutBadgeTxt}>{kashrutCount}</Text>
            </View>
          ) : (
            <Ionicons name="checkmark-circle" size={24} color={Colors.kosher} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.kashrutTitle}>
              {kashrutCount > 0 && hasDowngrade ? '⚠️ ' : ''}עדכוני כשרות
            </Text>
            <Text style={s.kashrutSub}>
              {kashrutCount > 0
                ? (hasDowngrade ? 'כולל ירידת כשרות · לחץ לצפייה' : 'לחץ לצפייה בעדכונים')
                : 'הכל נקרא · לחץ לצפייה'}
            </Text>
          </View>
          <Ionicons
            name="chevron-back"
            size={18}
            color={kashrutCount > 0 && hasDowngrade ? Colors.danger : Colors.kosher}
          />
        </TouchableOpacity>
      )}

      {/* ── Filters + sort ────────────────────────────────────────────────── */}
      <FilterBar
        values={filters}
        onChange={(key, val) => setFilters((p) => ({ ...p, [key]: val }))}
        filters={[
          { key: 'businessType', label: 'אופי', options: BUSINESS_TYPE_OPTIONS, activeColor: Colors.kosher },
          { key: 'category',     label: 'סוג',  options: CATEGORY_OPTIONS,       activeColor: Colors.kosher },
          ...(availableNeighborhoods.length > 0
            ? [{ key: 'neighborhood', label: 'שכונה', options: availableNeighborhoods, activeColor: Colors.kosher }]
            : []),
          ...(availableCertTags.length > 0
            ? [{ key: 'kashrut', label: 'כשרות', options: availableCertTags.map((t) => ({ key: t, label: t })), activeColor: Colors.kosher }]
            : []),
        ]}
        sortSlot={
          <View style={s.sortGroup}>
            <TouchableOpacity style={[s.sortBtn, sort === 'alpha' && s.sortBtnActive]} onPress={() => handleSort('alpha')}>
              <Ionicons name="text-outline" size={13} color={sort === 'alpha' ? Colors.white : Colors.kosher} />
              <Text style={[s.sortTxt, sort === 'alpha' && s.sortTxtActive]}>א–ת</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sortBtn, sort === 'distance' && s.sortBtnActive]} onPress={() => handleSort('distance')}>
              {locLoading
                ? <ActivityIndicator size="small" color={sort === 'distance' ? Colors.white : Colors.kosher} />
                : <Ionicons name="navigate-outline" size={13} color={sort === 'distance' ? Colors.white : Colors.kosher} />}
              <Text style={[s.sortTxt, sort === 'distance' && s.sortTxtActive]}>מרחק</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={Colors.kosher} style={{ marginTop: 60 }} size="large" />
      ) : error ? (
        <Text style={s.errorText}>שגיאה בטעינת הנתונים: {error}</Text>
      ) : viewMode === 'list' ? (

        /* ── LIST MODE — full-height scrollable list ── */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {visible.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="restaurant-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>לא נמצאו עסקים</Text>
            </View>
          ) : (
            visible.map((r) => {
              const dist = getDist(r);
              return (
                <View key={r.id} style={s.cardWrap}>
                  <RestaurantCard
                    restaurant={r}
                    distLabel={dist !== null ? formatDist(dist) : undefined}
                    onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: r.id })}
                  />
                </View>
              );
            })
          )}
        </ScrollView>

      ) : (

        /* ── MAP MODE — full map + bottom card for selected pin ── */
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
            {visible.filter((r) => r.latitude && r.longitude).map((r) => (
              <Marker
                key={`${r.id}-${r.id === selectedId}`}
                coordinate={{ latitude: r.latitude!, longitude: r.longitude! }}
                onPress={() => handlePinPress(r)}
                pinColor={r.id === selectedId ? Colors.primaryDark : Colors.kosher}
                tracksViewChanges={false}
              />
            ))}
          </MapView>

          {/* Floating animated card — slides up from bottom on pin press */}
          <Animated.View style={[s.mapCard, { bottom: 10, transform: [{ translateY: cardSlide }] }]}>
            {selectedRestaurant && (
              <RestaurantCard
                restaurant={selectedRestaurant}
                distLabel={getDist(selectedRestaurant) !== null ? formatDist(getDist(selectedRestaurant)!) : undefined}
                onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: selectedRestaurant.id })}
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

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    backgroundColor: Colors.kosher,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerRow:    { flexDirection: 'row', alignItems: 'flex-end' },
  title:        { fontSize: 26, fontWeight: '800', color: Colors.white },
  subtitle:     { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  headerActions:{ flexDirection: 'row', gap: 8, paddingBottom: 2 },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerBtnActive: { backgroundColor: 'rgba(255,255,255,0.30)' },

  // ── Search bar ───────────────────────────────────────────────────────────
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.cardBackground, paddingHorizontal: Spacing.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },

  // ── Kashrut banner ───────────────────────────────────────────────────────
  kashrutBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.kosher + '12',
    borderBottomWidth: 1, borderBottomColor: Colors.kosher + '30',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  kashrutBannerWarn:    { backgroundColor: Colors.danger + '10', borderBottomColor: Colors.danger + '40' },
  kashrutBannerAllRead: { backgroundColor: Colors.kosher + '08', borderBottomColor: Colors.kosher + '20' },
  kashrutBadge:    { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: Colors.kosher, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  kashrutBadgeTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  kashrutTitle:    { fontSize: 14, fontWeight: '800', color: Colors.text },
  kashrutSub:      { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  // ── Filters ──────────────────────────────────────────────────────────────
  sortGroup:     { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.kosher, overflow: 'hidden' },
  sortBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
  sortBtnActive: { backgroundColor: Colors.kosher },
  sortTxt:       { fontSize: 12, fontWeight: '700', color: Colors.kosher },
  sortTxtActive: { color: Colors.white },

  // ── List mode ─────────────────────────────────────────────────────────────
  cardWrap:  { marginBottom: Spacing.sm },
  empty:     { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: 80 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
  errorText: { textAlign: 'center', color: Colors.danger, marginTop: 40, padding: Spacing.md },

  // ── Map mode ──────────────────────────────────────────────────────────────
  // Transparent positioning container — RestaurantCard provides its own visuals
  mapCard: {
    position: 'absolute', left: 16, right: 16,
  },
});
