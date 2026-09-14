import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnalyticsTrack } from '../../services/analytics';
import { useCemeteries } from '../../hooks/useCemeteries';
import { useCityId } from '../../hooks/useCityId';
import { useAreas } from '../../hooks/useAreas';
import { useNavigateTo } from '../../hooks/useNavigateTo';
import { resolveNavTarget, hasNavTarget, NavTarget } from '../../utils/navigationApps';
import { Colors, Spacing, Radius, CardShell } from '../../utils/theme';
import { Cemetery } from '../../types';

function CemeteryCard({ item, areaNames, navTarget, onNavigate }: {
  item: Cemetery; areaNames: string; navTarget: NavTarget; onNavigate: (t: NavTarget) => void;
}) {
  const call = () => { if (item.contactPhone) Linking.openURL(`tel:${item.contactPhone}`); };
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name="flower-outline" size={18} color={Colors.cemetery} />
        <Text style={s.cardName}>{item.name}</Text>
      </View>
      {!!areaNames && <Text style={s.areaNames}>{areaNames}</Text>}

      {(item.contactName || item.contactPhone) && (
        <View style={s.contactRow}>
          {!!item.contactName && <Text style={s.contactName}>{item.contactName}</Text>}
          {!!item.contactPhone && (
            <TouchableOpacity style={s.callBtn} onPress={call} activeOpacity={0.75}>
              <Ionicons name="call-outline" size={13} color={Colors.white} />
              <Text style={s.callTxt}>{item.contactPhone}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {hasNavTarget(navTarget) && (
        <TouchableOpacity style={s.directionsBtn} onPress={() => onNavigate(navTarget)} activeOpacity={0.75}>
          <Ionicons name="navigate-outline" size={14} color={Colors.cemetery} />
          <Text style={s.directionsTxt}>ניווט</Text>
        </TouchableOpacity>
      )}

      {!!item.notes && <Text style={s.notes}>{item.notes}</Text>}
    </View>
  );
}

export default function CemeteriesScreen() {
  useAnalyticsTrack('cemeteries');
  const { top, bottom } = useSafeAreaInsets();
  const cityId = useCityId();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { cemeteries, loading } = useCemeteries(cityId, focused);
  // Areas do double duty here: naming which settlement(s) a cemetery serves
  // (nothing extra rendered for a plain city's one area), and as the
  // fallback pin for the ~4 of these 18 that only have a bare Waze link and
  // no coordinates of their own — see resolveNavTarget.
  const { areas } = useAreas(cityId);
  const { go: navigateTo, sheet: navSheet } = useNavigateTo();

  function areaNamesFor(c: Cemetery): string {
    return (c.areaIds ?? [])
      .map((id) => areas.find((a) => a.id === id)?.name)
      .filter(Boolean)
      .join(' + ');
  }

  // A cemetery's areaIds can be plural (shared between two kibbutzim); the
  // fallback only needs one point to aim at, so the first is enough.
  function navTargetFor(c: Cemetery): NavTarget {
    return resolveNavTarget(
      { latitude: c.latitude, longitude: c.longitude, areaId: c.areaIds?.[0], wazeLink: c.directionsUrl },
      areas,
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient
        colors={[Colors.cemetery, '#454D56']}
        style={[s.header, { paddingTop: top + 16 }]}
      >
        <Text style={s.title}>קבורה ובית עלמין</Text>
        <Text style={s.subtitle}>אנשי קשר ובתי עלמין באזור</Text>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={Colors.cemetery} style={{ marginTop: 60 }} size="large" />
      ) : cemeteries.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="flower-outline" size={40} color={Colors.textMuted} />
          <Text style={s.emptyText}>אין עדיין מידע על בתי עלמין</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {cemeteries.map((c) => (
            <CemeteryCard
              key={c.id} item={c} areaNames={areaNamesFor(c)}
              navTarget={navTargetFor(c)} onNavigate={navigateTo}
            />
          ))}
        </ScrollView>
      )}
      {navSheet}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header:   { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  title:    { fontSize: 22, fontWeight: '800', color: Colors.white },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 3 },

  list: { padding: Spacing.md },

  card: { ...CardShell },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName:    { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1 },
  areaNames:   { fontSize: 12.5, color: Colors.textMuted, marginTop: 2, marginRight: 26 },

  contactRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10,
  },
  contactName: { fontSize: 13.5, color: Colors.textSecondary, fontWeight: '500' },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.cemetery, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full,
  },
  callTxt: { fontSize: 12.5, fontWeight: '700', color: Colors.white },

  directionsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.cemetery + '55',
  },
  directionsTxt: { fontSize: 12, fontWeight: '600', color: Colors.cemetery },

  notes: { fontSize: 12.5, color: Colors.textMuted, marginTop: 8, lineHeight: 17 },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
