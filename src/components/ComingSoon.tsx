import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../utils/theme';

/**
 * Shared "בקרוב" presentation for features gated by `utils/comingSoon`.
 *
 * A held-back feature is never silently missing: the entry point stays where
 * people expect it and says when it's coming, so nobody hunts for a screen that
 * has quietly disappeared, and nobody reports it as broken.
 */

/** Small pill for a row, tile or card that leads to a held-back feature. */
export function ComingSoonBadge({ color = Colors.gold, style }: { color?: string; style?: any }) {
  return (
    <View style={[s.badge, { borderColor: color }, style]}>
      <Text style={[s.badgeTxt, { color }]}>בקרוב</Text>
    </View>
  );
}

/** Popup for a control that stays visible but can't act yet. */
export function comingSoonAlert(feature: string, detail?: string) {
  Alert.alert(
    `${feature} · בקרוב`,
    detail ?? 'התכונה נמצאת בהכנה ותיפתח בקרוב. תודה על הסבלנות!',
    [{ text: 'הבנתי' }],
  );
}

interface ScreenProps {
  title: string;
  /** One line on what the feature will do, in the user's words. */
  description?: string;
  icon?: string;
  color?: string;
}

/** Full-screen placeholder, rendered in place of a held-back screen. */
export default function ComingSoonScreen({
  title,
  description,
  icon = 'construct-outline',
  color = Colors.primary,
}: ScreenProps) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: top + 80 }]}>
      <View style={[s.iconRing, { borderColor: color }]}>
        <Ionicons name={icon as any} size={44} color={color} />
      </View>
      <Text style={[s.tag, { color }]}>בקרוב</Text>
      <Text style={s.title}>{title}</Text>
      {!!description && <Text style={s.desc}>{description}</Text>}
      <Text style={s.foot}>נעדכן אתכם ברגע שהשירות ייפתח</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, alignItems: 'center', paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.background,
  },
  iconRing: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
  },
  tag: {
    fontSize: 13, fontWeight: '800', letterSpacing: 1,
    marginTop: Spacing.lg,
  },
  title: {
    fontSize: 22, fontWeight: '800', color: Colors.text,
    marginTop: Spacing.xs, textAlign: 'center',
  },
  desc: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center',
    lineHeight: 21, marginTop: Spacing.sm,
  },
  foot: {
    fontSize: 12, color: Colors.textMuted, textAlign: 'center',
    marginTop: Spacing.xl,
  },

  badge: {
    borderWidth: 1, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
});
