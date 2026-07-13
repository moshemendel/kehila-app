import React, { useState, useMemo } from 'react';
import { useAnalyticsTrack } from '../../services/analytics';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import EventCard from '../../components/EventCard';
import FilterBar from '../../components/FilterBar';
import { useEventsFeed } from '../../context/EventsContext';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { EventCategory } from '../../types';

const CATEGORY_LABELS: Record<string, string> = {
  alert: '🚨 התראות', shiur: '📚 שיעורים', community: '👥 קהילה',
  holiday: '✡ חגים', charity: '❤️ צדקה', youth: '🧑 נוער', announcement: '📢 הודעות',
};

export default function EventsScreen() {
  useAnalyticsTrack('events');
  const { top }      = useSafeAreaInsets();
  const navigation   = useNavigation<any>();
  const {
    events, favoriteEvents, loading, error,
    isFavorite, isRead, unreadCount,
    dismiss, markRead, markAllRead, toggleFavorite,
  } = useEventsFeed();

  const [filters,           setFilters]           = useState<Record<string, string[]>>({ category: [] });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const unreadAlerts = events.filter((e) => e.isAlert && !isRead(e.id));

  const categoryOptions = useMemo(() => {
    const cats = new Set(events.map((e) => e.category));
    return Array.from(cats).sort().map((c) => ({ key: c, label: CATEGORY_LABELS[c as EventCategory] ?? c }));
  }, [events]);

  const visible = useMemo(() => {
    const base = showFavoritesOnly ? favoriteEvents : events;
    if (filters.category.length === 0) return base;
    return base.filter((e) => filters.category.includes(e.category));
  }, [events, favoriteEvents, showFavoritesOnly, filters.category]);

  return (
    <View style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: top + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>אירועים והודעות</Text>
          <View style={styles.headerActions}>
            {/* Mark all read — shown only when there are unread events */}
            {unreadCount > 0 && !showFavoritesOnly && (
              <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead} activeOpacity={0.8}>
                <Ionicons name="checkmark-done-outline" size={15} color={Colors.white} />
                <Text style={styles.markAllTxt}>סמן הכל כנקרא</Text>
              </TouchableOpacity>
            )}
            {favoriteEvents.length > 0 && (
              <TouchableOpacity
                style={[styles.favToggle, showFavoritesOnly && styles.favToggleActive]}
                onPress={() => setShowFavoritesOnly((v) => !v)}
              >
                <Ionicons
                  name={showFavoritesOnly ? 'star' : 'star-outline'}
                  size={14}
                  color={showFavoritesOnly ? Colors.gold : Colors.white}
                />
                <Text style={[styles.favToggleText, showFavoritesOnly && styles.favToggleTextActive]}>
                  מועדפים {favoriteEvents.length}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {unreadAlerts.length > 0 && !showFavoritesOnly && (
          <View style={styles.alertBadge}>
            <Ionicons name="warning" size={14} color={Colors.white} />
            <Text style={styles.alertBadgeText}>{unreadAlerts.length} התראות לא נקראו</Text>
          </View>
        )}
      </View>

      {/* ── Category filter ─────────────────────────────────────────────────── */}
      <FilterBar
        values={filters}
        onChange={(key, val) => setFilters((p) => ({ ...p, [key]: val }))}
        filters={[{ key: 'category', label: 'קטגוריה', options: categoryOptions, activeColor: Colors.events }]}
      />

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={Colors.white} style={{ marginTop: 40 }} size="large" />
      ) : error ? (
        <Text style={styles.errorText}>שגיאה בטעינת הנתונים: {error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
          {visible.length === 0 && (
            <View style={styles.empty}>
              <Ionicons
                name={showFavoritesOnly ? 'star-outline' : 'calendar-outline'}
                size={48}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>
                {showFavoritesOnly ? 'אין אירועים מועדפים' : 'אין אירועים להציג'}
              </Text>
              {showFavoritesOnly && (
                <Text style={styles.emptySub}>סמן אירוע עם ★ כדי לקבל תזכורת</Text>
              )}
            </View>
          )}
          {visible.map((e) => {
            const unread = !isRead(e.id);
            return (
              <View key={e.id} style={styles.cardWrap}>
                {/* Unread dot — blue pip on the right edge */}
                {unread && <View style={styles.unreadDot} />}
                <EventCard
                  event={e}
                  isFavorite={isFavorite(e.id)}
                  onToggleFavorite={() => toggleFavorite(e)}
                  onPress={() => navigation.navigate('EventDetail', { eventId: e.id })}
                  onDismiss={() => dismiss(e.id)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.events,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.white },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },

  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  markAllTxt: { fontSize: 12, fontWeight: '700', color: Colors.white },

  favToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.white + '60',
  },
  favToggleActive: {
    backgroundColor: Colors.gold + '22',
    borderColor: Colors.gold,
  },
  favToggleText:       { fontSize: 13, fontWeight: '700', color: Colors.white },
  favToggleTextActive: { color: Colors.gold },

  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  alertBadgeText: { fontSize: 12, color: Colors.white, fontWeight: '700' },

  // Card wrapper with unread dot
  cardWrap: { position: 'relative' },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.events,
    zIndex: 1,
    borderWidth: 1.5,
    borderColor: Colors.cardBackground,
  },

  empty:    { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText:{ fontSize: 16, color: Colors.textMuted, fontWeight: '600' },
  emptySub: { fontSize: 13, color: Colors.textMuted },
  errorText:{ textAlign: 'center', color: Colors.danger, marginTop: 40, padding: Spacing.md },
});
