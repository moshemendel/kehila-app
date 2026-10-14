import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { AppAlert as Alert } from '../../components/AppAlert';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { useCity } from '../../hooks/useCity';
import { useCityId } from '../../hooks/useCityId';
import { PRIVACY_POLICY_URL, ABOUT_URL, SUPPORT_EMAIL } from '../../utils/links';

/**
 * What the app is, which build of it this is, and how to reach us.
 *
 * The version block is here for support as much as for curiosity: "it's broken"
 * is only actionable once we know which bundle the phone is running. The store
 * version alone does not say that — OTA updates replace the JavaScript under an
 * unchanged version — so the update's publish date and channel are shown too,
 * and the contact button puts all of it into the email for the user.
 *
 * Uses only modules already in the 1.0.1 build (expo-constants, expo-updates),
 * so this screen itself can ship over the air.
 */

export const APP_VERSION = Constants.expoConfig?.version ?? '';

function formatUpdateDate(d: Date): string {
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/** Which JavaScript this phone runs: the one baked into the install, or an OTA
 *  update published on a given date. Null in development, where neither applies. */
function bundleDescription(): string | null {
  if (__DEV__) return 'פיתוח';
  if (Updates.isEmbeddedLaunch) return 'מובנית בהתקנה';
  return Updates.createdAt ? `עדכון מ-${formatUpdateDate(Updates.createdAt)}` : null;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} selectable>{value}</Text>
    </View>
  );
}

function LinkRow({ icon, label, onPress, last }: {
  icon: string; label: string; onPress: () => void; last?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.linkRow, last && s.linkRowLast]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={20} color={Colors.primary} />
      <Text style={s.linkLabel}>{label}</Text>
      <Ionicons name="chevron-back-outline" size={16} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('לא ניתן לפתוח את הקישור', url);
  }
}

export default function AboutScreen() {
  const navigation = useNavigation<any>();
  const { top } = useSafeAreaInsets();
  const cityId = useCityId();
  const { city } = useCity(cityId);

  const bundle = bundleDescription();
  const channel = Updates.channel && Updates.channel !== 'production' ? Updates.channel : null;
  const platform = `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`;

  function contactSupport() {
    const details = [
      `גרסה: ${APP_VERSION}`,
      bundle && `קוד: ${bundle}`,
      channel && `ערוץ: ${channel}`,
      Updates.updateId && `מזהה עדכון: ${Updates.updateId}`,
      `מכשיר: ${platform}`,
      city?.name && `עיר: ${city.name}`,
    ].filter(Boolean).join('\n');
    const body = `\n\n\n— פרטים טכניים, כדי שנוכל לעזור —\n${details}`;
    open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('קהילה - פנייה')}&body=${encodeURIComponent(body)}`);
  }

  return (
    <View style={[s.screen, { paddingTop: top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>אודות</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <View style={s.hero}>
          <Image source={require('../../../assets/icon.png')} style={s.icon} />
          <Text style={s.appName}>קהילה</Text>
          <Text style={s.tagline}>
            בתי כנסת וזמני תפילה, זמני היום, כשרות, מקוואות, עירוב ואירועים: כל מה
            שהקהילה צריכה, במקום אחד.
          </Text>
          <View style={s.versionChip}>
            <Text style={s.versionChipText}>גרסה {APP_VERSION} · פיילוט</Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>פרטי הגרסה</Text>
          <InfoRow label="גרסה" value={APP_VERSION} />
          {bundle && <InfoRow label="קוד" value={bundle} />}
          {channel && <InfoRow label="ערוץ" value={channel} />}
          <InfoRow label="מכשיר" value={platform} />
          {city?.name && <InfoRow label="עיר" value={city.name} />}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>יצירת קשר</Text>
          <Text style={s.cardNote}>
            מצאת טעות בזמני תפילה, בכתובת או בכשרות? יש לך רעיון? נשמח לשמוע. פרטי
            הגרסה מצורפים למייל אוטומטית.
          </Text>
          <TouchableOpacity style={s.contactBtn} onPress={contactSupport} activeOpacity={0.8}>
            <Ionicons name="mail-outline" size={18} color={Colors.white} />
            <Text style={s.contactText}>שליחת מייל</Text>
          </TouchableOpacity>
          <Text style={s.email} selectable>{SUPPORT_EMAIL}</Text>
          <Text style={s.cardHint}>
            לטעות בפרטים של מקום מסוים אפשר גם ללחוץ על "דיווח על מידע שגוי" בדף שלו.
            הדיווח מגיע ישר למי שמנהל אותו.
          </Text>
        </View>

        <View style={[s.card, s.linksCard]}>
          {!!ABOUT_URL && (
            <LinkRow icon="globe-outline" label="אתר האפליקציה" onPress={() => open(ABOUT_URL)} />
          )}
          <LinkRow icon="shield-outline" label="מדיניות פרטיות"
            onPress={() => open(PRIVACY_POLICY_URL)} last />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>תודות</Text>
          <Text style={s.cardNote}>
            זמני היום, התאריך העברי והלוח מחושבים בספריית KosherZmanim בקוד פתוח.
            המפות של Google Maps.
          </Text>
        </View>

        <Text style={s.footer}>© {new Date().getFullYear()} קהילה</Text>
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

  hero: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  icon: { width: 84, height: 84, borderRadius: 20 },
  appName: { fontSize: 24, fontWeight: '800', color: Colors.text },
  tagline: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 21,
    textAlign: 'center', paddingHorizontal: Spacing.md,
  },
  versionChip: {
    backgroundColor: Colors.accentLight, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 4, marginTop: 2,
  },
  versionChipText: { fontSize: 12.5, fontWeight: '700', color: Colors.primaryDark },

  card: {
    backgroundColor: Colors.cardBackground, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  linksCard: { paddingVertical: 0 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm, textAlign: 'right' },
  cardNote: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20, textAlign: 'right' },
  cardHint: { fontSize: 12.5, color: Colors.textMuted, lineHeight: 18, textAlign: 'right', marginTop: Spacing.sm },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  infoLabel: { fontSize: 13.5, color: Colors.textSecondary },
  infoValue: { fontSize: 13.5, color: Colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'left' },

  contactBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 12, marginTop: Spacing.md,
  },
  contactText: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  email: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  linkRowLast: { borderBottomWidth: 0 },
  linkLabel: { fontSize: 15, color: Colors.text },

  footer: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },
});
