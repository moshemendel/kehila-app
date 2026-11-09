import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnalyticsTrack } from '../../services/analytics';
import { useSynagoguesFeed } from '../../context/SynagoguesContext';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Radius, CardShellFlush } from '../../utils/theme';
import { Synagogue } from '../../types';
import {
  parseTimeToMinutes, nowInMinutes, hebrewDayOfWeek, tomorrowDayOfWeek,
  todayDayNumber, tomorrowDayNumber, formatDays,
} from '../../utils/prayerUtils';
import {
  collectCityShiurim, audienceFits, defaultAudienceFor, SHIUR_TOPICS, AUDIENCE_LABEL, ShiurItem,
} from '../../utils/shiurim';
import FilterBar from '../../components/FilterBar';
import ScreenHeader from '../../components/ScreenHeader';

type View_ = 'today' | 'tomorrow' | 'week';

const VIEW_LABEL: Record<View_, string> = { today: 'היום', tomorrow: 'מחר', week: 'השבוע' };

/**
 * One shiur. Memoised for the same reason the prayer rows are: the city has
 * dozens of shuls and a card is a couple of dozen native views.
 *
 * Shabbat-only shiurim carry no day badge — the Shabbat label does the work,
 * and a bare "ש" next to it is the noise the prayer board already drops.
 */
const ShiurRow = React.memo(function ShiurRow({
  item, showDays, onOpen,
}: {
  item: ShiurItem;
  showDays: boolean;
  onOpen: (syn: Synagogue) => void;
}) {
  const { shiur, synagogue, topic, audience, days } = item;
  const daysLabel = days.length === 7 ? 'כל יום' : formatDays(days);
  const shabbatOnly = days.length === 1 && days[0] === 7;
  const time = `${String(Math.floor(item.timeMinutes / 60)).padStart(2, '0')}:${String(item.timeMinutes % 60).padStart(2, '0')}`;

  return (
    <TouchableOpacity style={s.card} onPress={() => onOpen(synagogue)} activeOpacity={0.82}>
      <View style={s.colorBar} />
      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <Text style={s.title} numberOfLines={2}>{shiur.title}</Text>
          <Text style={s.time}>{time}</Text>
        </View>

        {!!shiur.rabbi && (
          <View style={s.line}>
            <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
            <Text style={s.rabbi} numberOfLines={1}>{shiur.rabbi}</Text>
          </View>
        )}

        <View style={s.line}>
          <Ionicons name="business-outline" size={12} color={Colors.textMuted} />
          <Text style={s.synName} numberOfLines={1}>
            {synagogue.name}{synagogue.neighborhood ? ` · ${synagogue.neighborhood}` : ''}
          </Text>
        </View>

        <View style={s.chips}>
          <View style={s.chip}><Text style={s.chipTxt}>{topic}</Text></View>
          {audience !== 'all' && (
            <View style={[s.chip, audience === 'women' ? s.chipWomen : s.chipMen]}>
              <Text style={[s.chipTxt, audience === 'women' ? s.chipTxtWomen : s.chipTxtMen]}>
                {AUDIENCE_LABEL[audience]}
              </Text>
            </View>
          )}
          {showDays && !shabbatOnly && (
            <View style={s.chipPlain}><Text style={s.chipPlainTxt}>{daysLabel}</Text></View>
          )}
          {showDays && shabbatOnly && (
            <View style={s.chipPlain}><Text style={s.chipPlainTxt}>שבת</Text></View>
          )}
        </View>

        {!!shiur.description && (
          <Text style={s.desc} numberOfLines={2}>{shiur.description}</Text>
        )}
      </View>
      <Ionicons name="chevron-back-outline" size={16} color={Colors.textMuted} style={{ marginRight: 4 }} />
    </TouchableOpacity>
  );
});

export default function ShiurimScreen() {
  useAnalyticsTrack('shiurim');
  const { top } = useSafeAreaInsets();
  const { synagogues, loading } = useSynagoguesFeed();
  const { appUser } = useAuth();
  const navigation = useNavigation<any>();

  const [view,    setView]    = useState<View_>('today');
  const [nowMin,  setNowMin]  = useState(nowInMinutes());
  const [filters, setFilters] = useState<Record<string, string[]>>({
    neighborhood: [], topic: [], audience: [],
  });

  // Start from the audience the account asked for at sign-up — a woman opens
  // the screen already looking at the shiurim she can attend. Applied once, and
  // never again after the person has touched the audience chip themselves, so
  // clearing it sticks. The account can load after the screen mounts.
  const audienceTouched = useRef(false);
  const defaultAud = defaultAudienceFor(appUser?.gender);
  useEffect(() => {
    if (audienceTouched.current || !defaultAud) return;
    setFilters((p) => ({ ...p, audience: [defaultAud] }));
  }, [defaultAud]);

  useEffect(() => {
    const id = setInterval(() => setNowMin(nowInMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  const all = useMemo(
    () => collectCityShiurim(synagogues, parseTimeToMinutes),
    [synagogues],
  );

  const neighborhoods = useMemo(() => {
    const set = new Set<string>();
    synagogues.forEach((syn) => { if (syn.neighborhood) set.add(syn.neighborhood); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [synagogues]);

  // Only topics that actually have a shiur — a chip that opens an empty list is a trap.
  const topics = useMemo(() => {
    const present = new Set(all.map((i) => i.topic));
    return SHIUR_TOPICS.filter((t) => present.has(t));
  }, [all]);

  const selNeighborhood = filters.neighborhood;
  const selTopic        = filters.topic;
  const selAudience     = filters.audience[0] as 'men' | 'women' | undefined;

  // Everything the chips allow, before the day. Kept apart so the empty state
  // can tell "nothing today" from "nothing at all matches".
  const matching = useMemo(() => all
    .filter((i) => selNeighborhood.length === 0 || selNeighborhood.includes(i.synagogue.neighborhood ?? ''))
    .filter((i) => selTopic.length === 0 || selTopic.includes(i.topic))
    .filter((i) => !selAudience || audienceFits(i.audience, selAudience)),
    [all, selNeighborhood, selTopic, selAudience]);

  const list = useMemo(() => {
    if (view === 'week') {
      // By first day of the week, then time: a weekly planner, not a countdown.
      return [...matching].sort((a, b) =>
        (a.days[0] ?? 8) - (b.days[0] ?? 8) || a.timeMinutes - b.timeMinutes);
    }
    const dayNum = view === 'today' ? todayDayNumber() : tomorrowDayNumber();
    return matching
      .filter((i) => i.days.includes(dayNum))
      // Today shows what is still ahead; a shiur that started an hour ago is
      // not something to plan around. Tomorrow has no "past".
      .filter((i) => view === 'tomorrow' || i.timeMinutes > nowMin)
      .sort((a, b) => a.timeMinutes - b.timeMinutes);
  }, [matching, view, nowMin]);

  const openSyn = useCallback(
    (syn: Synagogue) => navigation.navigate('SynagogueDetail', { synagogue: syn }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }: { item: ShiurItem }) => (
      <ShiurRow item={item} showDays={view === 'week'} onOpen={openSyn} />
    ),
    [view, openSyn],
  );

  const subtitle =
    view === 'today'    ? `יום ${hebrewDayOfWeek()}`
    : view === 'tomorrow' ? `מחר · יום ${tomorrowDayOfWeek()}`
    : 'כל שיעורי השבוע';

  return (
    <View style={s.container}>
      <ScreenHeader
        color={Colors.events}
        title="שיעורי תורה"
        subtitle={subtitle}
      />

      <FilterBar
        toggleSlot={
          <View style={s.viewToggle}>
            {(['today', 'tomorrow', 'week'] as View_[]).map((v) => (
              <TouchableOpacity
                key={v}
                style={[s.viewBtn, view === v && s.viewBtnOn]}
                onPress={() => setView(v)}
              >
                <Text style={[s.viewBtnTxt, view === v && s.viewBtnTxtOn]}>{VIEW_LABEL[v]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        }
        values={filters}
        onChange={(key, val) => {
          if (key === 'audience') audienceTouched.current = true;
          setFilters((p) => ({ ...p, [key]: val }));
        }}
        filters={[
          {
            key: 'audience',
            label: 'קהל',
            options: [
              { key: 'men',   label: 'גברים' },
              { key: 'women', label: 'נשים' },
            ],
            multiSelect: false,
            activeColor: Colors.events,
          },
          ...(neighborhoods.length > 0 ? [{
            key: 'neighborhood',
            label: 'שכונה',
            options: neighborhoods.map((n) => ({ key: n, label: n })),
            activeColor: Colors.kosher,
          }] : []),
          ...(topics.length > 0 ? [{
            key: 'topic',
            label: 'נושא',
            options: topics.map((t) => ({ key: t, label: t })),
            activeColor: Colors.primary,
          }] : []),
        ]}
      />

      {loading ? (
        <ActivityIndicator color={Colors.events} style={{ marginTop: 40 }} size="large" />
      ) : list.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="book-outline" size={52} color={Colors.textMuted} />
          {matching.length === 0 ? (
            <>
              <Text style={s.emptyTitle}>
                {all.length === 0 ? 'עדיין לא פורסמו שיעורים' : 'אין שיעורים שמתאימים לסינון'}
              </Text>
              <Text style={s.emptySub}>
                {all.length === 0 ? 'בתי הכנסת יעדכנו בקרוב' : 'נסו להסיר חלק מהמסננים'}
              </Text>
            </>
          ) : (
            <>
              <Text style={s.emptyTitle}>
                {view === 'today' ? 'אין עוד שיעורים היום' : 'אין שיעורים ליום זה'}
              </Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => setView(view === 'today' ? 'tomorrow' : 'week')}
              >
                <Text style={s.emptyBtnTxt}>{view === 'today' ? 'הצג מחר' : 'הצג את כל השבוע'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.md }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },

  viewToggle:   { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.events, overflow: 'hidden' },
  viewBtn:      { paddingHorizontal: 12, paddingVertical: 5 },
  viewBtnOn:    { backgroundColor: Colors.events },
  viewBtnTxt:   { fontSize: 13, fontWeight: '700', color: Colors.events },
  viewBtnTxtOn: { color: Colors.white },

  card:     { ...CardShellFlush, flexDirection: 'row', alignItems: 'center' },
  colorBar: { width: 4, alignSelf: 'stretch', backgroundColor: Colors.events },
  cardBody: { flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: 10, gap: 4 },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title:    { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  time:     { fontSize: 20, fontWeight: '800', color: Colors.events, letterSpacing: 0.5 },
  line:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rabbi:    { flex: 1, fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
  synName:  { flex: 1, fontSize: 12, color: Colors.textMuted },
  desc:     { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip:         { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 1, borderColor: Colors.events + '50', backgroundColor: Colors.events + '14' },
  chipTxt:      { fontSize: 11, fontWeight: '700', color: Colors.events },
  chipWomen:    { borderColor: '#B23A78' + '55', backgroundColor: '#B23A78' + '14' },
  chipTxtWomen: { color: '#B23A78' },
  chipMen:      { borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '14' },
  chipTxtMen:   { color: Colors.primary },
  chipPlain:    { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  chipPlainTxt: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  emptyBtn:   { marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.events + '66', borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  emptyBtnTxt:{ fontSize: 13, fontWeight: '700', color: Colors.events },
});
