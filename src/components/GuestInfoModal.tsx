import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface Row {
  label: string;
  guest: boolean;
  registered: boolean;
}

const ROWS: Row[] = [
  { label: 'גלישה בזמני תפילה, בתי כנסת, כשרות, מקוואות ואירועים', guest: true,  registered: true  },
  { label: 'התראות עירוב וכשרות דחופות',                            guest: true,  registered: true  },
  { label: 'תזכורות תפילה מותאמות אישית ועדכוני קהילה כלליים',       guest: false, registered: true  },
  { label: 'קביעת תורים למקווה',                                     guest: false, registered: true  },
  { label: 'קבלת תפקידי ניהול (גבאי, מנהל עסק וכו׳)',                 guest: false, registered: true  },
  { label: 'שחזור החשבון ממכשיר אחר',                                guest: false, registered: true  },
];

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
    : <Ionicons name="close-circle" size={18} color={Colors.textMuted} />;
}

export default function GuestInfoModal({ visible, onClose }: Props) {
  const { bottom } = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: bottom + 16 }]}>
          <View style={s.handle} />
          <Text style={s.title}>אורח לעומת משתמש רשום</Text>
          <Text style={s.subtitle}>
            כאורח/ת ניתן לגלוש בכל התוכן באפליקציה ללא צורך בהרשמה. הרשמה עם חשבון פותחת עוד כמה יכולות:
          </Text>

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {/* Column headers */}
            <View style={s.headerRow}>
              <View style={{ flex: 1 }} />
              <Text style={s.colHeader}>אורח</Text>
              <Text style={s.colHeader}>רשום</Text>
            </View>

            {ROWS.map((row) => (
              <View key={row.label} style={s.row}>
                <Text style={s.rowLabel}>{row.label}</Text>
                <View style={s.colCell}><StatusIcon ok={row.guest} /></View>
                <View style={s.colCell}><StatusIcon ok={row.registered} /></View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>הבנתי</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingHorizontal: Spacing.lg,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: Spacing.md },

  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
  colHeader: { width: 56, textAlign: 'center', fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowLabel: { flex: 1, fontSize: 13, color: Colors.text, textAlign: 'right', lineHeight: 18 },
  colCell: { width: 56, alignItems: 'center' },

  closeBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md,
  },
  closeBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
