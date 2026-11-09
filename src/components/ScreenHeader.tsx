import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../utils/theme';

/**
 * The one header every section screen wears.
 *
 * Each screen used to draw its own, and they drifted: gradients on some and
 * solid fills on others, titles of 22, 24, 26 and 28px, bottom padding of 12,
 * Spacing.md, lg and xl. Everything that makes up the header's look lives here,
 * so a screen can only choose its colour and its content, not its metrics.
 *
 *  - `color`    the section colour, always a solid fill (no gradients)
 *  - `title`    26/800 white; `titleSuffix` is the small muted count after it
 *  - `subtitle` 14px at 75% white under the title
 *  - `actions`  rendered at the far end of the title row, bottom-aligned;
 *               use `HeaderButton` for the standard 40px round icon button
 *  - `onBack`   adds the back arrow at the start of the row, for screens that
 *               hide the navigator's own header
 *  - `children` extra content under the row (chips, notes, pickers)
 */
export const HEADER_TITLE_SIZE = 26;

interface Props {
  color: string;
  title: string;
  titleSuffix?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onBack?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function ScreenHeader({
  color, title, titleSuffix, subtitle, actions, onBack, children, style,
}: Props) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[s.header, { backgroundColor: color, paddingTop: top + 16 }, style]}>
      <View style={s.row}>
        {onBack && (
          <TouchableOpacity
            style={s.back}
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="חזור"
          >
            <Ionicons name="chevron-forward" size={24} color={Colors.white} />
          </TouchableOpacity>
        )}
        <View style={s.titleCol}>
          <Text style={s.title} numberOfLines={1}>
            {title}
            {titleSuffix ? <Text style={s.titleSuffix}>{`  ${titleSuffix}`}</Text> : null}
          </Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={s.actions}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}

/** The standard 40px round icon button for a header's `actions`. */
export function HeaderButton({
  icon, onPress, active, label,
}: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; label?: string }) {
  return (
    <TouchableOpacity
      style={[s.btn, active && s.btnActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={Colors.white} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  header:      { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  row:         { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  titleCol:    { flex: 1 },
  title:       { fontSize: HEADER_TITLE_SIZE, fontWeight: '800', color: Colors.white },
  titleSuffix: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  subtitle:    { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  actions:     { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  back: {
    width: 36, height: 36, borderRadius: 18, marginBottom: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  btn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  btnActive: { backgroundColor: 'rgba(255,255,255,0.30)' },
});
