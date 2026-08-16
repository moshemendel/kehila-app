import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../utils/theme';
import { type PasswordCheck, STRENGTH_LABELS } from '../utils/passwordPolicy';

/**
 * Live rule checklist + strength bar under the password field.
 *
 * Shown while typing rather than as an alert on submit: a user who learns the
 * rules only after pressing "צור חשבון" has to guess which one they broke, and
 * the failure lands after they've already committed to a password.
 */
export default function PasswordStrength({
  check, visible = true,
}: { check: PasswordCheck; visible?: boolean }) {
  if (!visible) return null;

  const barColor =
    check.score <= 1 ? Colors.danger :
    check.score === 2 ? Colors.warning :
    Colors.success;

  return (
    <View style={s.wrap}>
      <View style={s.barRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[s.barSeg, i <= check.score - 1 && { backgroundColor: barColor }]}
          />
        ))}
        <Text style={[s.barLabel, { color: barColor }]}>{STRENGTH_LABELS[check.score]}</Text>
      </View>

      {check.rules.map((r) => (
        <View key={r.key} style={s.ruleRow}>
          <Ionicons
            name={r.met ? 'checkmark-circle' : 'ellipse-outline'}
            size={14}
            color={r.met ? Colors.success : Colors.textMuted}
          />
          <Text style={[s.ruleTxt, r.met && s.ruleTxtMet]}>{r.label}</Text>
        </View>
      ))}

      {!!check.error && (
        <View style={s.ruleRow}>
          <Ionicons name="alert-circle" size={14} color={Colors.danger} />
          <Text style={[s.ruleTxt, { color: Colors.danger }]}>{check.error}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginTop: 8, padding: Spacing.sm,
    borderRadius: Radius.sm, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
    gap: 4,
  },
  barRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  barSeg:   { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  barLabel: { fontSize: 11, fontWeight: '700', minWidth: 58, textAlign: 'left' },

  ruleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleTxt:    { fontSize: 12, color: Colors.textMuted, flex: 1 },
  ruleTxtMet: { color: Colors.textSecondary },
});
