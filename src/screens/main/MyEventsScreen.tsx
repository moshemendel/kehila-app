/**
 * Everything the resident has committed to attending — starred city events
 * and reminded synagogue announcements, merged into one upcoming-only list.
 *
 * Two different sources (EventsContext's favourites, SynagogueEventReminders-
 * Context's live join) feed one screen because from the resident's side
 * there is no meaningful difference: both mean "I intend to be there, remind
 * me". Which collection the data happens to live in is an implementation
 * detail they should never need to track down two screens to check.
 */
import React, { useMemo } from 'react';
import { useAnalyticsTrack } from '../../services/analytics';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import EventCard from '../../components/EventCard';
import SynagogueEventCard from '../../components/SynagogueEventCard';
import { useEventsFeed } from '../../context/EventsContext';
import { useSynagogueEventReminders } from '../../context/SynagogueEventRemindersContext';
import { Colors, Spacing } from '../../utils/theme';
import { CommunityEvent } from '../../types';

type Item =
  | { kind: 'community'; startDate: string; event: CommunityEvent }
  | { kind: 'synagogue'; startDate: string; key: string };

export default function MyEventsScreen() {
  useAnalyticsTrack('my_events');
  const navigation = useNavigation<any>();
  const { favoriteEvents, loading, isFavorite, toggleFavorite } = useEventsFeed();
  const { remindedEvents, setReminders } = useSynagogueEventReminders();

  const items = useMemo<Item[]>(() => {
    const a: Item[] = favoriteEvents.map((event) => (
      { kind: 'community', startDate: event.startDate, event }
    ));
    const b: Item[] = remindedEvents.map((e) => (
      { kind: 'synagogue', startDate: e.startDate, key: e.key }
    ));
    return [...a, ...b].sort((x, y) => x.startDate.localeCompare(y.startDate));
  }, [favoriteEvents, remindedEvents]);

  const remindedByKey = useMemo(
    () => new Map(remindedEvents.map((e) => [e.key, e])),
    [remindedEvents],
  );

  return (
    <View style={s.container}>
      {loading ? (
        <ActivityIndicator color={Colors.events} style={{ marginTop: 40 }} size="large" />
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
          <Text style={s.emptyText}>אין לך אירועים קרובים</Text>
          <Text style={s.emptySub}>
            סמן ★ באירוע, או הוסף תזכורת להודעה של בית כנסת, והוא יופיע כאן
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
          {items.map((item) => {
            if (item.kind === 'community') {
              return (
                <EventCard
                  key={item.event.id}
                  event={item.event}
                  isFavorite={isFavorite(item.event.id)}
                  onToggleFavorite={() => toggleFavorite(item.event)}
                  onPress={() => navigation.navigate('EventDetail', { eventId: item.event.id })}
                />
              );
            }
            const e = remindedByKey.get(item.key);
            if (!e) return null;
            return (
              <SynagogueEventCard
                key={item.key}
                event={e}
                onPress={() => navigation.navigate('SynagogueDetail', { synagogueId: e.synagogueId })}
                onRemove={() => setReminders(e.synagogueId, e.announcementId, [])}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: 10 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
