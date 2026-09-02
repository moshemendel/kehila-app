import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/auth';
import { rolesOf, ROLE_SELF_LABELS } from '../../utils/roles';
import { deleteMyAccount } from '../../services/deleteAccount';
import { UserRole } from '../../types';

/**
 * Deleting an account, said out loud before it happens.
 *
 * Google Play requires this path to exist inside the app for anything that
 * offers sign-up; the shape of the screen is not required, and is the point.
 * Deletion is the one action here with no undo, so the screen spends its space
 * on what the person is actually about to lose rather than on a warning colour
 * and a confirm button.
 *
 * TWO LISTS, because "delete my account" does not have one obvious meaning. It
 * clearly covers the login and everything personal. It does not obviously cover
 * a gemach listing the neighbourhood depends on, or a report a manager is
 * halfway through handling — and silently taking those down would be a worse
 * surprise than keeping them. So published content stays, the name comes off
 * it, and that is stated here rather than discovered later.
 *
 * TYPE-TO-CONFIRM rather than a password: this account may have been created
 * with Google, in which case there is no password to ask for, and a second
 * "are you sure?" is a button people press without reading. Copying a word
 * takes deliberate attention, which is all the guard is for.
 */
const CONFIRM_WORD = 'מחיקה';

function Row({ icon, color, children }: {
  icon: string; color: string; children: React.ReactNode;
}) {
  return (
    <View style={s.row}>
      <Ionicons name={icon as any} size={17} color={color} style={s.rowIcon} />
      <Text style={s.rowText}>{children}</Text>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const navigation = useNavigation<any>();
  const { top } = useSafeAreaInsets();
  const { appUser } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const roles = rolesOf(appUser).filter((r) => r !== 'user') as UserRole[];
  const confirmed = typed.trim() === CONFIRM_WORD;

  async function handleDelete() {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await deleteMyAccount();
      // The Auth record is gone, so the session is already void — signing out
      // locally is what clears it from this device and returns to guest mode.
      await logout();
      Alert.alert('החשבון נמחק', 'החשבון והמידע האישי שלך הוסרו. אפשר להמשיך להשתמש באפליקציה כאורח.');
    } catch (e: any) {
      setBusy(false);
      Alert.alert(
        'המחיקה נכשלה',
        String(e?.message ?? '').includes('unauthenticated')
          ? 'ההתחברות פגה. יש להתחבר מחדש ולנסות שוב.'
          : 'לא הצלחנו למחוק את החשבון כרגע. נסה שוב, ואם זה חוזר — פנה אלינו.',
      );
    }
  }

  return (
    <View style={[s.screen, { paddingTop: top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>מחיקת חשבון</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.cardTitle}>מה יימחק</Text>
          <Row icon="key-outline" color={Colors.danger}>ההתחברות עצמה — לא תוכל להיכנס עם החשבון הזה שוב</Row>
          <Row icon="person-outline" color={Colors.danger}>הפרופיל שלך: שם, אימייל, עיר והרשאות</Row>
          <Row icon="phone-portrait-outline" color={Colors.danger}>המכשירים שלך, כולל ההתראות שנשלחות אליהם</Row>
          <Row icon="calendar-outline" color={Colors.danger}>תורים שקבעת למקווה — הם ישוחררו לאחרים</Row>
          <Row icon="document-text-outline" color={Colors.danger}>בקשות שהגשת וטרם אושרו</Row>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>מה יישאר, בלי השם שלך</Text>
          <Text style={s.cardNote}>
            דברים שכבר פורסמו לקהילה ואנשים מסתמכים עליהם. הקשר אליך יינתק, אבל
            הם לא יימחקו.
          </Text>
          <Row icon="gift-outline" color={Colors.textSecondary}>גמ״חים שהוספת</Row>
          <Row icon="megaphone-outline" color={Colors.textSecondary}>אירועים שפרסמת</Row>
          <Row icon="flag-outline" color={Colors.textSecondary}>דיווחים שהגשת — כולל כאלה שעדיין מטופלים</Row>
        </View>

        {roles.length > 0 && (
          <View style={[s.card, s.warnCard]}>
            <View style={s.warnHead}>
              <Ionicons name="warning-outline" size={18} color={Colors.warning} />
              <Text style={s.warnTitle}>יש לך תפקיד במערכת</Text>
            </View>
            <Text style={s.cardNote}>
              {roles.map((r) => ROLE_SELF_LABELS[r] ?? r).join(', ')} — ההרשאה הזאת
              תימחק יחד עם החשבון. אם אתה היחיד שמחזיק בה, לא יישאר מי שינהל את
              התחום הזה עד שימונה מישהו אחר.
            </Text>
          </View>
        )}

        <Text style={s.confirmLabel}>
          כדי לאשר, הקלד <Text style={s.confirmWord}>{CONFIRM_WORD}</Text>
        </Text>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          style={[s.input, confirmed && s.inputOk]}
          placeholder={CONFIRM_WORD}
          placeholderTextColor={Colors.textSecondary}
          autoCorrect={false}
          textAlign="right"
        />

        <TouchableOpacity
          style={[s.deleteBtn, !confirmed && s.deleteBtnOff]}
          onPress={handleDelete}
          disabled={!confirmed || busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={s.deleteText}>מחק את החשבון שלי לצמיתות</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()} disabled={busy}>
          <Text style={s.cancelText}>ביטול</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.cardBackground, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  body: { padding: Spacing.md, paddingBottom: Spacing.xl },

  card: {
    backgroundColor: Colors.cardBackground, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  cardNote: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },

  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  rowIcon: { marginLeft: 8, marginTop: 1 },
  rowText: { flex: 1, fontSize: 13.5, color: Colors.text, lineHeight: 20 },

  warnCard: { borderColor: Colors.warning, backgroundColor: '#FFF8F0' },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  warnTitle: { fontSize: 14, fontWeight: '800', color: Colors.warning },

  confirmLabel: { fontSize: 13.5, color: Colors.text, marginBottom: 6, textAlign: 'right' },
  confirmWord: { fontWeight: '800', color: Colors.danger },
  input: {
    backgroundColor: Colors.cardBackground, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11,
    fontSize: 15, color: Colors.text, marginBottom: Spacing.md,
  },
  inputOk: { borderColor: Colors.danger },

  deleteBtn: {
    backgroundColor: Colors.danger, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  deleteBtnOff: { backgroundColor: Colors.border },
  deleteText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
