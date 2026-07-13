import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { CommunityEvent, EventCategory } from '../types';

const CATEGORY_CONFIG: Record<EventCategory, { icon: string; color: string; label: string }> = {
  shiur:        { icon: 'book-outline',      color: Colors.primary,      label: 'שיעור'  },
  community:    { icon: 'people-outline',    color: Colors.events,       label: 'קהילה'  },
  youth:        { icon: 'happy-outline',     color: Colors.kosher,       label: 'נוער'   },
  charity:      { icon: 'heart-outline',     color: Colors.danger,       label: 'צדקה'   },
  holiday:      { icon: 'star-outline',      color: Colors.goldBright,   label: 'חג'     },
  announcement: { icon: 'megaphone-outline', color: Colors.primaryLight, label: 'הודעה'  },
  alert:        { icon: 'warning-outline',   color: Colors.danger,       label: 'התראה'  },
};

interface Props {
  event: CommunityEvent;
  /** Open full detail screen */
  onPress?: () => void;
  /** Whether this event is currently starred */
  isFavorite?: boolean;
  /** Toggle star — only shown on full feed, not in compact contexts */
  onToggleFavorite?: () => void;
  /** Hide event from feed — only shown when provided (Events screen) */
  onDismiss?: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' · '
    + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function countdownChip(iso: string): { text: string; urgent: boolean } | null {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return null; // past events don't get a chip
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 60)  return { text: `בעוד ${mins} דק'`, urgent: true };
  if (hours < 24)  return { text: 'היום', urgent: true };
  if (days  === 1) return { text: 'מחר', urgent: false };
  if (days  <= 3)  return { text: `${days} ימים`, urgent: false };
  return null; // further away — no chip needed
}

export default function EventCard({ event, onPress, isFavorite, onToggleFavorite, onDismiss }: Props) {
  const cfg   = CATEGORY_CONFIG[event.category] ?? CATEGORY_CONFIG.announcement;
  const chip  = countdownChip(event.startDate);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        event.isAlert && styles.cardAlert,
        isFavorite    && styles.cardFavorite,
      ]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: cfg.color + '22' }]}>
          <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, event.isAlert && styles.titleAlert]} numberOfLines={2}>
              {event.title}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.categoryLabel, { color: cfg.color }]}>{cfg.label}</Text>
            {event.isAlert && (
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>דחוף</Text>
              </View>
            )}
          </View>
        </View>

        {/* Star — only when callback provided, well separated from content */}
        {onToggleFavorite && (
          <TouchableOpacity
            onPress={onToggleFavorite}
            style={styles.starBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={22}
              color={isFavorite ? Colors.goldBright : Colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Description preview ─────────────────────────────────────────────── */}
      <Text style={styles.description} numberOfLines={2}>{event.description}</Text>

      {/* ── Footer row ──────────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.date}>{formatDate(event.startDate)}</Text>

        {event.location && (
          <>
            <Text style={styles.dot}>·</Text>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.location} numberOfLines={1}>{event.location}</Text>
          </>
        )}

        <View style={{ flex: 1 }} />

        {/* Countdown chip — only for soon events */}
        {chip && (
          <View style={[styles.chip, chip.urgent && styles.chipUrgent]}>
            <Text style={[styles.chipText, chip.urgent && styles.chipTextUrgent]}>{chip.text}</Text>
          </View>
        )}

        {/* "פתח" chevron */}
        <Ionicons name="chevron-back" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
      </View>

      {/* Favorite reminder note */}
      {isFavorite && (
        <View style={styles.favRow}>
          <Ionicons name="notifications-outline" size={12} color={Colors.goldBright} />
          <Text style={styles.favText}>תקבל תזכורת לפני האירוע</Text>
        </View>
      )}

      {/* Dismiss — shown only in full-feed contexts (EventsScreen) */}
      {onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.dismissRow}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="close-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.dismissText}>הסתר מהפיד</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  cardAlert:    { borderLeftWidth: 4, borderLeftColor: Colors.danger },
  cardFavorite: { borderLeftWidth: 4, borderLeftColor: Colors.goldBright },

  // Header
  header:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1 },
  titleRow:   { marginBottom: 3 },
  title:      { fontSize: 15, fontWeight: '700', color: Colors.text },
  titleAlert: { color: Colors.danger },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryLabel: { fontSize: 12, fontWeight: '600' },
  alertBadge: { backgroundColor: Colors.danger, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  alertBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },

  // Star — well separated from the rest of the card
  starBtn: { padding: 4, marginLeft: 4 },

  // Body
  description: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },

  // Footer
  footer:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date:     { fontSize: 12, color: Colors.textMuted },
  dot:      { fontSize: 12, color: Colors.textMuted },
  location: { fontSize: 12, color: Colors.textMuted, flex: 1 },

  // Countdown chip
  chip:          { backgroundColor: Colors.primary + '18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  chipUrgent:    { backgroundColor: Colors.danger + '18' },
  chipText:      { fontSize: 11, fontWeight: '700', color: Colors.primary },
  chipTextUrgent:{ color: Colors.danger },

  // Favorite reminder
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  favText:{ fontSize: 11, color: Colors.goldBright, fontWeight: '600' },

  // Dismiss link
  dismissRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8, alignSelf: 'flex-start' },
  dismissText:{ fontSize: 11, color: Colors.textMuted },
});
