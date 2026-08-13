import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReportContentModal from './ReportContentModal';
import { ReportEntityType } from '../types';
import { Colors, Spacing } from '../utils/theme';

interface Props {
  cityId: string;
  entityType: ReportEntityType;
  entityId: string;
  entityName: string;
  /** Accent colour of the host screen. */
  color?: string;
  /**
   * 'icon'    — bare flag, for header bars and list-card header rows.
   * 'overlay' — flag on a translucent circle, for screens with no header bar
   *             where it sits over a cover image and needs contrast.
   * 'link'    — muted text link, for use inside page content.
   */
  variant?: 'link' | 'icon' | 'overlay';
  /** Icon colour for 'icon' variant (headers vary in background colour). */
  iconColor?: string;
}

/**
 * "Report wrong info" affordance for a public listing — owns its own modal so
 * a screen only needs one line to opt in.
 *
 * Deliberately understated (muted text link, not a primary button): it should
 * be findable when something is wrong without competing with the actions people
 * actually came for (navigate, call, book).
 */
export default function ReportListingButton({
  cityId, entityType, entityId, entityName, color = Colors.primary, variant = 'link',
  iconColor = Colors.textMuted,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'icon' ? (
        <TouchableOpacity
          onPress={() => setOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="דיווח על מידע שגוי"
        >
          <Ionicons name="flag-outline" size={19} color={iconColor} />
        </TouchableOpacity>
      ) : variant === 'overlay' ? (
        <TouchableOpacity
          style={s.overlayBtn}
          onPress={() => setOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="דיווח על מידע שגוי"
        >
          <Ionicons name="flag-outline" size={17} color="#fff" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={s.btn} onPress={() => setOpen(true)} activeOpacity={0.7}>
          <Ionicons name="flag-outline" size={14} color={Colors.textMuted} />
          <Text style={s.txt}>דיווח על מידע שגוי</Text>
        </TouchableOpacity>
      )}

      <ReportContentModal
        visible={open}
        onClose={() => setOpen(false)}
        cityId={cityId}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        color={color}
      />
    </>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: Spacing.md, marginTop: Spacing.sm,
  },
  txt: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, textDecorationLine: 'underline' },
  overlayBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center',
  },
});
