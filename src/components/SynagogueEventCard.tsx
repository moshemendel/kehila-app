/**
 * A synagogue announcement the user is reminded about, styled as EventCard's
 * sibling — the two are meant to sit interleaved in one list (MyEventsScreen)
 * and read as the same kind of thing, not "the real card" next to a
 * lesser one bolted on for a different data source.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { SynagogueEventRef } from '../context/SynagogueEventRemindersContext';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' · '
    + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function countdownChip(iso: string): { text: string; urgent: boolean } | null {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return null;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 60) return { text: `בעוד ${mins} דק'`, urgent: true };
  if (hours < 24) return { text: 'היום', urgent: true };
  if (days === 1) return { text: 'מחר', urgent: false };
  if (days <= 3) return { text: `${days} ימים`, urgent: false };
  return null;
}

interface Props {
  event: SynagogueEventRef;
  /** Open the synagogue's page */
  onPress?: () => void;
  /** Clear the reminder — mirrors EventCard's onDismiss */
  onRemove?: () => void;
}

export default function SynagogueEventCard({ event, onPress, onRemove }: Props) {
  const chip = countdownChip(event.startDate);

  return (
    <TouchableOpacity
      style={[styles.card, event.isAlert && styles.cardAlert]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: Colors.events + '22' }]}>
          <Ionicons name="business-outline" size={20} color={Colors.events} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.title, event.isAlert && styles.titleAlert]} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.synagogueLabel} numberOfLines={1}>{event.synagogueName}</Text>
            {event.isAlert && (
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>דחוף</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {!!event.description && (
        <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
      )}

      <View style={styles.footer}>
        <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.date}>{formatDate(event.startDate)}</Text>

        {!!event.location && (
          <>
            <Text style={styles.dot}>·</Text>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.location} numberOfLines={1}>{event.location}</Text>
          </>
        )}

        <View style={{ flex: 1 }} />

        {chip && (
          <View style={[styles.chip, chip.urgent && styles.chipUrgent]}>
            <Text style={[styles.chipText, chip.urgent && styles.chipTextUrgent]}>{chip.text}</Text>
          </View>
        )}

        <Ionicons name="chevron-back" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
      </View>

      <View style={styles.remindRow}>
        <Ionicons name="notifications" size={12} color={Colors.events} />
        <Text style={styles.remindText}>מזכיר · דרך בית הכנסת</Text>
        {onRemove && (
          <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginRight: 'auto' }}
          >
            <Text style={styles.removeText}>הסר תזכורת</Text>
          </TouchableOpacity>
        )}
      </View>
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
  cardAlert: { borderLeftWidth: 4, borderLeftColor: Colors.danger },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  titleAlert: { color: Colors.danger },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  synagogueLabel: { fontSize: 12, fontWeight: '600', color: Colors.events, flexShrink: 1 },
  alertBadge: { backgroundColor: Colors.danger, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  alertBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },

  description: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { fontSize: 12, color: Colors.textMuted },
  dot: { fontSize: 12, color: Colors.textMuted },
  location: { fontSize: 12, color: Colors.textMuted, flex: 1 },

  chip: { backgroundColor: Colors.primary + '18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  chipUrgent: { backgroundColor: Colors.danger + '18' },
  chipText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  chipTextUrgent: { color: Colors.danger },

  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  remindText: { fontSize: 11, color: Colors.events, fontWeight: '600' },
  removeText: { fontSize: 11, color: Colors.textMuted, textDecorationLine: 'underline' },
});
