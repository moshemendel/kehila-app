import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheetModal from './BottomSheetModal';
import { submitContentReport } from '../services/reports';
import { useAuth } from '../context/AuthContext';
import { ReportEntityType, ReportReason } from '../types';
import { Colors, Spacing, Radius } from '../utils/theme';

const REASONS: { key: ReportReason; label: string; icon: string }[] = [
  { key: 'wrong_hours',    label: 'שעות לא נכונות',    icon: 'time-outline' },
  { key: 'wrong_contact',  label: 'טלפון / איש קשר',    icon: 'call-outline' },
  { key: 'wrong_location', label: 'מיקום או כתובת',     icon: 'location-outline' },
  { key: 'closed',         label: 'המקום סגור / לא פעיל', icon: 'close-circle-outline' },
  { key: 'wrong_details',  label: 'פרטים אחרים שגויים',  icon: 'document-text-outline' },
  { key: 'other',          label: 'אחר',                icon: 'ellipsis-horizontal' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  cityId: string;
  entityType: ReportEntityType;
  entityId: string;
  entityName: string;
  /** Accent colour of the host screen, so the sheet matches it. */
  color?: string;
}

/** Lets a user flag wrong/outdated info on a listing, for admins to review. */
export default function ReportContentModal({
  visible, onClose, cityId, entityType, entityId, entityName, color = Colors.primary,
}: Props) {
  const { appUser } = useAuth();
  const [reason, setReason]   = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (visible) { setReason(null); setDetails(''); }
  }, [visible]);

  async function handleSubmit() {
    if (!reason || saving) return;
    if (!appUser?.uid) {
      Alert.alert('שגיאה', 'יש להתחבר כדי לדווח');
      return;
    }
    setSaving(true);
    try {
      await submitContentReport({
        cityId,
        entityType,
        entityId,
        entityName,
        reason,
        details: details.trim() || undefined,
        userId: appUser.uid,
        userName: appUser.displayName ?? undefined,
      });
      onClose();
      Alert.alert('תודה!', 'הדיווח נשלח למנהלי הקהילה ויטופל בהקדם.');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message ?? 'לא ניתן לשלוח את הדיווח');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="דיווח על מידע שגוי"
      maxHeight="85%"
      avoidKeyboard
      sheetStyle={s.sheet}
    >
      <Text style={s.subtitle} numberOfLines={2}>{entityName}</Text>

      {/* Scrolls because the keyboard can shrink the sheet below the height of
          the reason chips + details field, which would otherwise clip them. */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollBody}
      >
        <Text style={s.label}>מה לא נכון?</Text>
        <View style={s.reasons}>
          {REASONS.map((r) => {
          const active = reason === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[s.reason, active && { backgroundColor: color, borderColor: color }]}
              onPress={() => setReason(r.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={r.icon as any} size={15} color={active ? Colors.white : color} />
              <Text style={[s.reasonTxt, active && { color: Colors.white }]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
        </View>

        <Text style={s.label}>פרטים נוספים (לא חובה)</Text>
        <TextInput
          style={s.input}
          value={details}
          onChangeText={setDetails}
          placeholder="למשל: שחרית עברה ל-6:15"
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
          multiline
          textAlignVertical="top"
        />
      </ScrollView>

      <TouchableOpacity
        style={[s.submit, { backgroundColor: color }, (!reason || saving) && { opacity: 0.45 }]}
        onPress={handleSubmit}
        disabled={!reason || saving}
      >
        {saving
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={s.submitTxt}>שלח דיווח</Text>}
      </TouchableOpacity>
    </BottomSheetModal>
  );
}

const s = StyleSheet.create({
  sheet:     { paddingHorizontal: Spacing.lg },
  scrollBody:{ paddingBottom: Spacing.sm },
  subtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md },
  label:    { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 8 },
  reasons:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  reasonTxt: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: 14, color: Colors.text, backgroundColor: Colors.background,
    height: 76, marginBottom: Spacing.md,
  },
  submit:    { borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  submitTxt: { fontSize: 16, fontWeight: '800', color: Colors.white },
});
