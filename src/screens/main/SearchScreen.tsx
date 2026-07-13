import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useCityId } from '../../hooks/useCityId';
import { useSynagogues } from '../../hooks/useSynagogues';
import { useRestaurants } from '../../hooks/useRestaurants';
import { useEvents } from '../../hooks/useEvents';
import { useGemachs } from '../../hooks/useGemachs';
import { Synagogue, Restaurant, CommunityEvent, Gemach, GemachCategory } from '../../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const GEMACH_LABEL: Record<GemachCategory, string> = {
  clothing: 'ביגוד', baby: 'תינוקות', medical: 'ציוד רפואי',
  food: 'מזון', books: 'ספרים', wedding: 'חתנות',
  household: 'ציוד בית', tools: 'כלים', other: 'אחר',
};

const EVENT_LABEL: Record<string, string> = {
  shiur: 'שיעור', community: 'קהילה', youth: 'נוער',
  charity: 'צדקה', holiday: 'חג', announcement: 'הודעה', alert: 'התראה',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s?: string | null) { return (s ?? '').toLowerCase(); }

function hit(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = norm(query);
  return q.length > 0 && fields.some(f => norm(f).includes(q));
}

// ── Filter chips ──────────────────────────────────────────────────────────────

type FilterCat = 'all' | 'synagogues' | 'restaurants' | 'events' | 'gemachs';

const CHIPS: { key: FilterCat; label: string; icon: string; color: string }[] = [
  { key: 'all',         label: 'הכל',      icon: 'apps-outline',       color: Colors.primary  },
  { key: 'synagogues',  label: 'בתי כנסת', icon: 'business-outline',   color: Colors.primary  },
  { key: 'restaurants', label: 'כשרות',    icon: 'restaurant-outline', color: Colors.kosher   },
  { key: 'events',      label: 'אירועים',  icon: 'calendar-outline',   color: Colors.events   },
  { key: 'gemachs',     label: 'גמ"ח',     icon: 'gift-outline',       color: '#B06B3A'       },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const { top } = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const cityId = useCityId();

  const { synagogues,  loading: lSyn  } = useSynagogues(cityId);
  const { restaurants, loading: lRest } = useRestaurants(cityId);
  const { events,      loading: lEvt  } = useEvents(cityId);
  const { gemachs,     loading: lGem  } = useGemachs(cityId);

  const [query,  setQuery]  = useState('');
  const [filter, setFilter] = useState<FilterCat>('all');

  const loading = lSyn || lRest || lEvt || lGem;
  const q = query.trim();

  const show = (cat: FilterCat) => filter === 'all' || filter === cat;

  const synResults = useMemo(() => {
    if (!q || !show('synagogues')) return [];
    return synagogues.filter(s =>
      hit(q, s.name, s.neighborhood, s.rabbiName, s.rabbi, s.address?.he, s.nusach?.join(' ')));
  }, [q, filter, synagogues]);

  const restResults = useMemo(() => {
    if (!q || !show('restaurants')) return [];
    return restaurants.filter(r =>
      hit(q, r.name, r.neighborhood, r.address, r.description, r.category, ...(r.categories ?? [])));
  }, [q, filter, restaurants]);

  const evtResults = useMemo(() => {
    if (!q || !show('events')) return [];
    return events.filter(e =>
      hit(q, e.title, e.description, e.location, e.organizer, EVENT_LABEL[e.category]));
  }, [q, filter, events]);

  const gemResults = useMemo(() => {
    if (!q || !show('gemachs')) return [];
    return gemachs.filter(g =>
      hit(q, g.name, g.neighborhood, g.description, GEMACH_LABEL[g.category]));
  }, [q, filter, gemachs]);

  const total = synResults.length + restResults.length + evtResults.length + gemResults.length;

  return (
    <View style={[sc.root, { paddingTop: top }]}>

      {/* ── Header ── */}
      <View style={sc.header}>
        <Text style={sc.headerTitle}>חיפוש</Text>

        <View style={sc.searchBox}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <TextInput
            style={sc.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder='בתי כנסת, כשרות, אירועים, גמ"חים...'
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sc.chipsRow}
        >
          {CHIPS.map(chip => {
            const active = filter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[sc.chip, active && { backgroundColor: chip.color, borderColor: chip.color }]}
                onPress={() => setFilter(chip.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={chip.icon as any}
                  size={13}
                  color={active ? Colors.white : chip.color}
                />
                <Text style={[sc.chipTxt, { color: active ? Colors.white : chip.color }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Results ── */}
      <ScrollView
        style={sc.scroll}
        contentContainerStyle={sc.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!q ? (
          <EmptyState
            icon="search-outline"
            title="חיפוש גלובלי"
            sub={'חפש בבתי כנסת, מסעדות כשרות,\nאירועים קהילתיים וגמ"חים'}
          />
        ) : loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />
        ) : total === 0 ? (
          <EmptyState
            icon="search-outline"
            title="לא נמצאו תוצאות"
            sub={`לא נמצאו תוצאות עבור "${q}"`}
          />
        ) : (
          <>
            {synResults.length > 0 && (
              <Section icon="business-outline" label="בתי כנסת" color={Colors.primary} count={synResults.length}>
                {synResults.map(syn => (
                  <TouchableOpacity
                    key={syn.id}
                    style={sc.card}
                    onPress={() => navigation.navigate('SynagogueDetail', { synagogue: syn })}
                    activeOpacity={0.75}
                  >
                    <CircleIcon name="business" bg={Colors.primary + '18'} color={Colors.primary} />
                    <View style={sc.cardBody}>
                      <Text style={sc.cardName} numberOfLines={1}>{syn.name}</Text>
                      <Text style={sc.cardMeta} numberOfLines={1}>
                        {[syn.neighborhood, syn.nusach?.join(' / ')].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </Section>
            )}

            {restResults.length > 0 && (
              <Section icon="restaurant-outline" label="כשרות" color={Colors.kosher} count={restResults.length}>
                {restResults.map(r => {
                  const cert  = r.kosherCertificates?.find(c => c.isActive);
                  const level = cert?.kosherLevel?.[0];
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={sc.card}
                      onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: r.id })}
                      activeOpacity={0.75}
                    >
                      <CircleIcon name="restaurant" bg={Colors.kosher + '18'} color={Colors.kosher} />
                      <View style={sc.cardBody}>
                        <Text style={sc.cardName} numberOfLines={1}>{r.name}</Text>
                        <Text style={sc.cardMeta} numberOfLines={1}>
                          {[r.neighborhood, level].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </Section>
            )}

            {evtResults.length > 0 && (
              <Section icon="calendar-outline" label="אירועים" color={Colors.events} count={evtResults.length}>
                {evtResults.map(ev => {
                  const date = new Date(ev.startDate).toLocaleDateString('he-IL', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  });
                  return (
                    <TouchableOpacity
                      key={ev.id}
                      style={sc.card}
                      onPress={() => navigation.navigate('EventDetail', { eventId: ev.id })}
                      activeOpacity={0.75}
                    >
                      <CircleIcon name="calendar" bg={Colors.events + '18'} color={Colors.events} />
                      <View style={sc.cardBody}>
                        <Text style={sc.cardName} numberOfLines={1}>{ev.title}</Text>
                        <Text style={sc.cardMeta} numberOfLines={1}>
                          {[date, ev.location].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </Section>
            )}

            {gemResults.length > 0 && (
              <Section icon="gift-outline" label='גמ"ח' color="#B06B3A" count={gemResults.length}>
                {gemResults.map(g => (
                  <View key={g.id} style={sc.card}>
                    <CircleIcon name="gift" bg="#B06B3A18" color="#B06B3A" />
                    <View style={sc.cardBody}>
                      <Text style={sc.cardName} numberOfLines={1}>{g.name}</Text>
                      <Text style={sc.cardMeta} numberOfLines={1}>
                        {[GEMACH_LABEL[g.category], g.neighborhood].filter(Boolean).join(' · ')}
                      </Text>
                      {g.phone ? (
                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${g.phone}`)}>
                          <Text style={sc.cardPhone}>{g.phone}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={sc.empty}>
      <Ionicons name={icon as any} size={52} color={Colors.border} />
      <Text style={sc.emptyTitle}>{title}</Text>
      <Text style={sc.emptySub}>{sub}</Text>
    </View>
  );
}

function Section({ icon, label, color, count, children }: {
  icon: string; label: string; color: string; count: number; children: React.ReactNode;
}) {
  return (
    <View style={sc.section}>
      <View style={sc.sectionHead}>
        <View style={[sc.sectionIconCircle, { backgroundColor: color + '1C' }]}>
          <Ionicons name={icon as any} size={14} color={color} />
        </View>
        <Text style={[sc.sectionLabel, { color }]}>{label}</Text>
        <View style={[sc.sectionBadge, { backgroundColor: color }]}>
          <Text style={sc.sectionBadgeTxt}>{count}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function CircleIcon({ name, bg, color }: { name: string; bg: string; color: string }) {
  return (
    <View style={[sc.cardIcon, { backgroundColor: bg }]}>
      <Ionicons name={name as any} size={18} color={color} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  headerTitle: {
    fontSize: 22, fontWeight: '800', color: Colors.text,
    textAlign: 'right', marginBottom: Spacing.sm,
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },

  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipTxt: { fontSize: 12, fontWeight: '600' },

  scroll:        { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: 48 },

  empty:      { alignItems: 'center', paddingTop: 64, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptySub:   { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  section:         { marginBottom: Spacing.lg },
  sectionHead:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  sectionIconCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:    { flex: 1, fontSize: 13, fontWeight: '700' },
  sectionBadge:    { borderRadius: Radius.full, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  sectionBadgeTxt: { fontSize: 11, color: Colors.white, fontWeight: '800' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.card,
  },
  cardIcon:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cardBody:  { flex: 1 },
  cardName:  { fontSize: 14, fontWeight: '700', color: Colors.text },
  cardMeta:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardPhone: { fontSize: 12, color: Colors.primary, marginTop: 1, fontWeight: '600' },
});
