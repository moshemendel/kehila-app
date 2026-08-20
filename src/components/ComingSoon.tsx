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

/**
 * Small pill for a row, tile or card that leads to a held-back feature.
 *
 * `filled` is the compact form: solid rather than outlined, and small enough to
 * sit ON an icon instead of under it. The outlined form adds a whole line to
 * whatever it's in, which is fine in a list row and far too much in the Home
 * quick-links strip, where it pushed every tile taller.
 */
export function ComingSoonBadge({
  color = Colors.gold, style, filled = false,
}: { color?: string; style?: any; filled?: boolean }) {
  return (
    <View
      style={[
        filled ? s.badgeFilled : s.badge,
        filled ? { backgroundColor: color } : { borderColor: color },
        style,
      ]}
    >
      <Text style={[filled ? s.badgeTxtFilled : s.badgeTxt, !filled && { color }]}>בקרוב</Text>
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

  badgeFilled: {
    borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1.5, borderColor: Colors.cardBackground,
  },
  badgeTxtFilled: { fontSize: 8.5, fontWeight: '800', color: Colors.white },
});
