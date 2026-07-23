import React, { useState, useMemo, useEffect } from 'react';
import { useAnalyticsTrack } from '../../services/analytics';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, FlatList, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useGemachs } from '../../hooks/useGemachs';
import { useCityId } from '../../hooks/useCityId';
import { useCity } from '../../hooks/useCity';
import { useAuth } from '../../context/AuthContext';
import { Gemach, GemachCategory } from '../../types';
import GemachEditModal from '../../components/GemachEditModal';

const GEMACH_COLOR = '#B06B3A';

const CATEGORY_LABELS: Record<GemachCategory, string> = {
  clothing:  'ביגוד',
  baby:      'תינוקות',
  medical:   'ציוד רפואי',
  food:      'מזון',
  books:     'ספרים',
  wedding:   'חתנות',
  household: 'ציוד בית',
  tools:     'כלים',
  other:     'אחר',
};

const CATEGORY_ICONS: Record<GemachCategory, string> = {
  clothing:  'shirt-outline',
  baby:      'happy-outline',
  medical:   'medical-outline',
  food:      'fast-food-outline',
  books:     'book-outline',
  wedding:   'heart-outline',
  household: 'home-outline',
  tools:     'hammer-outline',
  other:     'ellipsis-horizontal-outline',
};

function GemachCard({ item, isOwn, onEdit }: { item: Gemach; isOwn: boolean; onEdit: () => void }) {
  const call = () => { if (item.phone) Linking.openURL(`tel:${item.phone}`); };
  return (
    <View style={[s.card, isOwn && !item.isActive && s.cardInactive]}>
      <View style={s.cardHeader}>
        <View style={s.categoryBadge}>
          <Ionicons name={CATEGORY_ICONS[item.category] as any} size={12} color={GEMACH_COLOR} />
          <Text style={s.categoryText}>{CATEGORY_LABELS[item.category]}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!!item.neighborhood && (
            <Text style={s.neighborhood}>📍 {item.neighborhood}</Text>
          )}
          {isOwn && (
            <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isOwn && !item.isActive && (
        <Text style={s.ownInactiveTag}>לא פעיל — מוסתר מהרשימה הציבורית</Text>
      )}

      <Text style={s.cardName}>{item.name}</Text>

      {!!item.description && (
        <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
      )}

      <View style={s.cardFooter}>
        {!!item.hours && (
          <View style={s.hoursRow}>
            <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
            <Text style={s.hoursText}>{item.hours}</Text>
          </View>
        )}
        {!!item.contactName && (
          <Text style={s.contactName}>{item.contactName}</Text>
        )}
        {!!item.phone && (
          <TouchableOpacity style={s.callBtn} onPress={call} activeOpacity={0.75}>
            <Ionicons name="call-outline" size={14} color={Colors.white} />
            <Text style={s.callTxt}>{item.phone}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function GemachScreen() {
  useAnalyticsTrack('gemach');
  const navigation = useNavigation();
  const { top, bottom } = useSafeAreaInsets();
  const cityId = useCityId();
  const { city } = useCity(cityId);
  const { firebaseUser, isGuest } = useAuth();
  const uid = firebaseUser?.uid;
  const { gemachs, loading } = useGemachs(cityId);
  const [activeCategory, setActiveCategory] = useState<GemachCategory | 'all'>('all');
  const [editing, setEditing] = useState<Gemach | null>(null);

  // useGemachs only returns active listings (the public list) — a user who
  // deactivated their own gemach via the edit modal would otherwise lose all
  // access to it. Fetch their own gemachs separately, regardless of isActive,
  // and merge them in so they can always find and re-toggle their own item.
  const [myGemachs, setMyGemachs] = useState<Gemach[]>([]);
  useEffect(() => {
    if (!uid || !cityId) { setMyGemachs([]); return; }
    const q = query(collection(db, 'gemachs'), where('cityId', '==', cityId), where('createdBy', '==', uid));
    return onSnapshot(q, (snap) => setMyGemachs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Gemach)));
  }, [uid, cityId]);

  const merged = useMemo(() => {
    const map = new Map<string, Gemach>();
    gemachs.forEach((g) => map.set(g.id, g));
    myGemachs.forEach((g) => map.set(g.id, g));
    return Array.from(map.values());
  }, [gemachs, myGemachs]);

  const filtered = useMemo(() =>
    activeCategory === 'all' ? merged : merged.filter(g => g.category === activeCategory),
    [merged, activeCategory],
  );

  const usedCategories = useMemo(() =>
    [...new Set(merged.map(g => g.category))],
    [merged],
  );

  function handleAddPress() {
    if (isGuest) {
      Alert.alert(
        'נדרשת התחברות',
        'כדי להוסיף גמ"ח יש להתחבר עם חשבון.',
        [
          { text: 'ביטול', style: 'cancel' },
          { text: 'התחבר', onPress: () => navigation.navigate('Auth' as never) },
        ],
      );
      return;
    }
    navigation.navigate('GemachSubmit' as never);
  }

  return (
    <View style={s.root}>
      <LinearGradient
        colors={[Colors.primaryDark, GEMACH_COLOR]}
        style={[s.header, { paddingTop: top + 16 }]}
      >
        <View style={s.headerRow}>
          <View style={s.titleCol}>
            <Text style={s.screenTitle}>גמ"ח</Text>
            <Text style={s.subtitle}>גמילות חסדים</Text>
            {city && <Text style={s.cityName}>📍 {city.name}</Text>}
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={handleAddPress}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color={Colors.white} />
            <Text style={s.addBtnTxt}>הוסף גמ"ח</Text>
          </TouchableOpacity>
        </View>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          <TouchableOpacity
            style={[s.chip, activeCategory === 'all' && s.chipActive]}
            onPress={() => setActiveCategory('all')}
          >
            <Text style={[s.chipTxt, activeCategory === 'all' && s.chipTxtActive]}>הכל</Text>
          </TouchableOpacity>
          {usedCategories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[s.chip, activeCategory === cat && s.chipActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[s.chipTxt, activeCategory === cat && s.chipTxtActive]}>
                {CATEGORY_LABELS[cat]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={GEMACH_COLOR} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="gift-outline" size={48} color={Colors.border} />
          <Text style={s.emptyTitle}>אין גמ"חים כאן עדיין</Text>
          <Text style={s.emptySub}>היה הראשון להוסיף גמ"ח לקהילה</Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={handleAddPress}
            activeOpacity={0.8}
          >
            <Text style={s.emptyBtnTxt}>הוסף גמ"ח</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <GemachCard item={item} isOwn={!!uid && item.createdBy === uid} onEdit={() => setEditing(item)} />
          )}
          contentContainerStyle={[s.list, { paddingBottom: bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {editing && (
        <GemachEditModal
          gemach={editing}
          visible={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {}}
          onDeleted={() => {}}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header:    { paddingHorizontal: Spacing.lg, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  titleCol:  { flex: 1 },
  screenTitle: { fontSize: 26, fontWeight: '800', color: Colors.white },
  subtitle:    { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  cityName:    { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8,
  },
  addBtnTxt: { fontSize: 13, fontWeight: '700', color: Colors.white },

  // Chips
  chips: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  chipActive:   { backgroundColor: Colors.white },
  chipTxt:      { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  chipTxtActive: { color: GEMACH_COLOR, fontWeight: '700' },

  // List
  list: { padding: Spacing.md, gap: 12 },

  // Card
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  cardInactive: { opacity: 0.6, borderStyle: 'dashed' },
  ownInactiveTag: { fontSize: 11, fontWeight: '700', color: Colors.danger, marginBottom: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GEMACH_COLOR + '18',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  categoryText: { fontSize: 11, fontWeight: '700', color: GEMACH_COLOR },
  neighborhood: { fontSize: 11, color: Colors.textMuted },
  cardName:  { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  cardDesc:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 8 },
  cardFooter: { gap: 6 },
  hoursRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hoursText:  { fontSize: 12, color: Colors.textMuted },
  contactName: { fontSize: 12, color: Colors.textSecondary },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GEMACH_COLOR,
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8,
    alignSelf: 'flex-start', marginTop: 4,
  },
  callTxt: { fontSize: 13, fontWeight: '700', color: Colors.white },

  // Empty state
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary },
  emptySub:   { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  emptyBtn:   { marginTop: 8, backgroundColor: GEMACH_COLOR, borderRadius: Radius.md, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnTxt: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
