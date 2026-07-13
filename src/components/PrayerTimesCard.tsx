import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { Synagogue } from '../types';
import {
  getTodaySchedule,
  getNextPrayer,
  formatPrayerLabel,
  parseTimeToMinutes,
  nowInMinutes,
} from '../utils/prayerUtils';

interface Props {
  synagogue: Synagogue;
  onPress?: () => void;
}

interface PrayerRowProps {
  label: string;
  times: string[];
  isNext: boolean;
}

function PrayerRow({ label, times, isNext }: PrayerRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = times.length > 1;
  const now = nowInMinutes();

  const displayTime = times.length > 0
    ? times.find((t) => parseTimeToMinutes(t) > now) ?? times[times.length - 1]
    : '—';

  return (
    <View style={[styles.prayerRow, isNext && styles.prayerRowNext]}>
      <View style={styles.prayerRowTop}>
        <Text style={[styles.prayerLabel, isNext && styles.prayerLabelNext]}>{label}</Text>
        <View style={styles.prayerTimeRow}>
          <Text style={[styles.prayerTime, isNext && styles.prayerTimeNext]}>{displayTime}</Text>
          {hasMultiple && (
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => setExpanded((e) => !e)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.moreBadge}>
                <Text style={styles.moreBadgeText}>+{times.length - 1}</Text>
              </View>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={isNext ? Colors.white : Colors.primaryLight}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {expanded && hasMultiple && (
        <View style={styles.allTimesRow}>
          {times.map((t, i) => {
            const isPast = parseTimeToMinutes(t) <= now;
            return (
              <View key={i} style={[styles.timeChip, isPast && styles.timeChipPast]}>
                <Text style={[styles.timeChipText, isPast && styles.timeChipTextPast]}>{t}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function PrayerTimesCard({ synagogue, onPress }: Props) {
  const schedule = getTodaySchedule(synagogue.weeklySchedule);
  const next = schedule ? getNextPrayer(schedule) : null;

  const nusachArr = Array.isArray(synagogue.nusach) ? synagogue.nusach : (synagogue.nusach ? [synagogue.nusach as unknown as string] : []);
  const nusachText = nusachArr.join(' / ');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.synagogueName}>{synagogue.name}</Text>
          <Text style={styles.synagogueAddress}>
            {synagogue.address.he ?? synagogue.address.en ?? ''}
            {nusachText ? ` · ${nusachText}` : ''}
          </Text>
        </View>
        {next && (
          <View style={styles.nextBadge}>
            <Text style={styles.nextBadgeLabel}>הבא</Text>
            <Text style={styles.nextBadgeTime}>{next.nextTime}</Text>
            <Text style={styles.nextBadgePrayer}>{formatPrayerLabel(next.type)}</Text>
          </View>
        )}
      </View>

      {schedule && (
        <View style={styles.prayersGrid}>
          <PrayerRow
            label="שחרית"
            times={schedule.shacharit}
            isNext={next?.type === 'shacharit'}
          />
          <PrayerRow
            label="מנחה"
            times={schedule.mincha}
            isNext={next?.type === 'mincha'}
          />
          <PrayerRow
            label="ערבית"
            times={schedule.maariv}
            isNext={next?.type === 'maariv'}
          />
        </View>
      )}

      {synagogue.rabbi && (
        <Text style={styles.rabbi}>רב: {synagogue.rabbi}</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  headerLeft: { flex: 1, marginRight: Spacing.sm },
  synagogueName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  synagogueAddress: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  nextBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 64,
  },
  nextBadgeLabel: { fontSize: 10, color: Colors.accentLight, fontWeight: '600' },
  nextBadgeTime: { fontSize: 18, fontWeight: '800', color: Colors.white },
  nextBadgePrayer: { fontSize: 11, color: Colors.accentLight },
  prayersGrid: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    gap: 4,
  },
  prayerRow: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  prayerRowNext: {
    backgroundColor: Colors.primaryLight,
  },
  prayerRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prayerLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  prayerLabelNext: { color: Colors.white },
  prayerTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prayerTime: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryLight,
  },
  prayerTimeNext: { color: Colors.white },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  moreBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  moreBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  allTimesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  timeChip: {
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeChipPast: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  timeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  timeChipTextPast: { color: 'rgba(255,255,255,0.5)' },
  rabbi: {
    marginTop: Spacing.sm,
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
});
