import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ReportEntityType } from '../types';
import { Colors, Spacing } from '../utils/theme';
import { usePermissions } from '../hooks/usePermissions';

/** Same mapping ManageReportsScreen uses to send a reviewer to the right editor. */
const EDIT_ROUTE: Record<ReportEntityType, string> = {
  synagogue: 'ManageSynagogue',
  business:  'ManageBusiness',
  mikveh:    'ManageMikveh',
  event:     'ManageEvents',
  gemach:    'ManageGemach',
};

interface Props {
  entityType: ReportEntityType;
  entityId: string;
  /** The listing's own cityId — a city_admin's reach is scoped to their home city. */
  entityCityId: string;
  /** Gemachs only: their submitter may correct them. */
  createdBy?: string;
  color?: string;
  /** Matches ReportListingButton's variants so the two sit together cleanly. */
  variant?: 'link' | 'icon' | 'overlay';
  iconColor?: string;
}

/**
 * "Edit this listing" for someone who manages it — renders nothing for everyone
 * else.
 *
 * Editing and checking the result used to be split across two places: the
 * manager left the listing, walked back through the stack to a management
 * screen, searched for the same entity, saved, then navigated back to the
 * public page to see whether it looked right — and repeated the whole trip for
 * every correction. Everything needed to collapse that already existed; the
 * management screens have long accepted a `focusId` param that opens straight
 * onto one entity, and treat arriving that way as a signal that back should
 * return where it came from rather than fall back to their own list. This adds
 * the missing entry point, so edit and verify happen without leaving the page.
 *
 * Visibility is not a permission check — firestore.rules is. usePermissions
 * mirrors those rules so the button appears exactly where the save will land.
 */
export default function EditListingButton({
  entityType, entityId, entityCityId, createdBy,
  color = Colors.primary, variant = 'link', iconColor = Colors.textMuted,
}: Props) {
  const navigation = useNavigation<any>();
  const { canEdit } = usePermissions();

  if (!canEdit(entityType, entityId, entityCityId, createdBy)) return null;

  const open = () => navigation.navigate(EDIT_ROUTE[entityType], { focusId: entityId });

  if (variant === 'icon') {
    return (
      <TouchableOpacity
        onPress={open}
        style={s.icon}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="עריכת הפריט"
      >
        <Ionicons name="create-outline" size={22} color={iconColor} />
      </TouchableOpacity>
    );
  }

  if (variant === 'overlay') {
    return (
      <TouchableOpacity
        onPress={open}
        style={s.overlay}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="עריכת הפריט"
      >
        <Ionicons name="create-outline" size={18} color={Colors.white} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={open} style={s.link} activeOpacity={0.7} accessibilityRole="button">
      <Ionicons name="create-outline" size={13} color={color} />
      <Text style={[s.linkTxt, { color }]}>עריכת הפריט</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  icon:    { padding: 6 },
  overlay: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm,
  },
  linkTxt: { fontSize: 13, fontWeight: '600' },
});
