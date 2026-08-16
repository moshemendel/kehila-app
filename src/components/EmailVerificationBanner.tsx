import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { resendVerificationEmail } from '../services/auth';
import { Colors, Spacing, Radius } from '../utils/theme';

/** Firebase throttles resends; a visible countdown beats an opaque error. */
const RESEND_COOLDOWN_SEC = 60;

/**
 * "Confirm your email" prompt for an account whose address is still unverified.
 *
 * Deliberately a banner and not a wall. Blocking the whole app until someone
 * finds the mail would cost more than it buys here — a fake address can't reach
 * anything a guest can't already see. What it does cost the user is real
 * though: an unconfirmed (or mistyped) address means password reset can never
 * reach them, which is why the prompt persists instead of appearing once.
 *
 * The actions that carry a name into a manager's queue — content reports — are
 * gated separately.
 */
export default function EmailVerificationBanner({ compact = false }: { compact?: boolean }) {
  const { needsEmailVerification, firebaseUser, refreshAuthState } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!needsEmailVerification) return null;

  async function resend() {
    setSending(true);
    try {
      await resendVerificationEmail();
      setCooldown(RESEND_COOLDOWN_SEC);
      Alert.alert('נשלח', `שלחנו קישור אימות ל-${firebaseUser?.email ?? 'כתובת שלך'}.\nבדוק/י גם בתיקיית הספאם.`);
    } catch (e: any) {
      Alert.alert(
        'שגיאה',
        e?.code === 'auth/too-many-requests'
          ? 'נשלחו יותר מדי בקשות. נסה/י שוב בעוד כמה דקות.'
          : 'לא ניתן לשלוח את המייל כרגע. נסה/י שוב מאוחר יותר.',
      );
    } finally {
      setSending(false);
    }
  }

  async function check() {
    setChecking(true);
    // emailVerified lives in the cached ID token, so clicking the link changes
    // nothing here until we reload — hence an explicit "I already confirmed".
    const verified = await refreshAuthState();
    setChecking(false);
    if (!verified) {
      Alert.alert(
        'עדיין לא אומת',
        'לא מצאנו אישור לכתובת. יש לפתוח את הקישור במייל ואז ללחוץ שוב.',
      );
    }
  }

  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <Ionicons name="mail-unread-outline" size={20} color={Colors.warning} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>כתובת האימייל טרם אומתה</Text>
        <Text style={s.sub} numberOfLines={2}>
          שלחנו קישור ל-{firebaseUser?.email ?? 'כתובת שלך'}. בלי אימות לא נוכל לשחזר עבורך סיסמה.
        </Text>
        <View style={s.actions}>
          <TouchableOpacity onPress={check} disabled={checking} style={s.actionBtn}>
            {checking
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={s.actionTxt}>כבר אימתתי</Text>}
          </TouchableOpacity>
          <Text style={s.sep}>·</Text>
          <TouchableOpacity onPress={resend} disabled={sending || cooldown > 0} style={s.actionBtn}>
            <Text style={[s.actionTxt, (sending || cooldown > 0) && s.actionTxtOff]}>
              {cooldown > 0 ? `שליחה חוזרת (${cooldown})` : sending ? 'שולח…' : 'שלח שוב'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FFF7E8',
    borderWidth: 1, borderColor: Colors.warning + '55',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.md,
  },
  wrapCompact: { marginHorizontal: 0 },
  title: { fontSize: 14, fontWeight: '800', color: Colors.text },
  sub:   { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },

  actions:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  actionBtn:    { paddingVertical: 2 },
  actionTxt:    { fontSize: 12.5, fontWeight: '700', color: Colors.primary },
  actionTxtOff: { color: Colors.textMuted },
  sep:          { color: Colors.border },
});
