/**
 * "Favourites only" — a filter chip for lists long enough that scrolling is
 * the wrong way to reach the handful of entries a resident actually uses.
 *
 * Sixty-nine synagogues, of which any one person cares about three. Without
 * this the choice is scrolling past sixty-six irrelevant ones or typing a
 * name you have to remember exactly.
 *
 * Shown only when something is starred: an empty filter that can only
 * disappoint is worse than no filter, and it doubles as a hint that starring
 * is what turns it on.
 */
import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../utils/theme';

interface Props {
  active: boolean;
  count: number;
  onPress: () => void;
  label?: string;
}

export default function FavoriteFilterChip({
  active, count, onPress, label = 'מועדפים',
}: Props) {
  // Stay put while the filter is on even if the last star is removed —
  // otherwise the chip disappears, the filter stays applied, and the user is
  // left staring at an empty list with nothing to switch off.
  if (count === 0 && !active) return null;
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}`}
    >
      <Ionicons
        name={active ? 'star' : 'star-outline'}
        size={13}
        color={active ? Colors.white : Colors.goldBright}
      />
      <Text style={[s.txt, active && s.txtActive]}>{label} · {count}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.goldBright,
    backgroundColor: Colors.cardBackground,
  },
  chipActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  txt: { fontSize: 13, fontWeight: '700', color: Colors.goldBright },
  txtActive: { color: Colors.white },
});
