import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheetModal from './BottomSheetModal';
import { IOS_NAV_APPS, openInNavApp, type NavAppId, type NavTarget } from '../utils/navigationApps';
import { Colors, Spacing, Radius } from '../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  target: NavTarget;
}

/**
 * iOS-only fallback chooser. Android uses the OS "open with" chooser instead
 * (see utils/navigationApps.ts), which lists every installed navigation app;
 * this list can only offer the ones we deep-link explicitly.
 *
 * Laid out like the platform sheet it stands in for: a row of round app icons
 * rather than a vertical list.
 */
export default function NavigationAppSheet({ visible, onClose, target }: Props) {
  const pick = async (app: NavAppId) => {
    onClose();
    await openInNavApp(app, target);
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="פתיחה באמצעות" sheetStyle={s.sheet}>
      <View style={s.row}>
        {IOS_NAV_APPS.map((app) => (
          <TouchableOpacity key={app.id} style={s.item} onPress={() => pick(app.id)} activeOpacity={0.7}>
            <View style={[s.iconWrap, { backgroundColor: app.color }]}>
              <Ionicons name={app.icon as any} size={26} color="#fff" />
            </View>
            <Text style={s.label} numberOfLines={1}>{app.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </BottomSheetModal>
  );
}

const s = StyleSheet.create({
  sheet: { paddingHorizontal: Spacing.lg },
  row:   { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: Spacing.md },
  item:  { alignItems: 'center', gap: 8, width: 72 },
  iconWrap: {
    width: 60, height: 60, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '600', color: Colors.text, textAlign: 'center' },
});
