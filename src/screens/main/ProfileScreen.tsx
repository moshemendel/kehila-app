import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useFavorites } from '../../context/FavoritesContext';
import { logout } from '../../services/auth';
import { requireManagerAuth, lockManagerArea } from '../../utils/managerAuth';
import { useCityId } from '../../hooks/useCityId';
import { useCity } from '../../hooks/useCity';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { UserRole, City } from '../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CityPicker from '../../components/CityPicker';

const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

const ROLE_LABELS: Record<UserRole, string> = {
  user: 'משתמש רגיל',
  gabbai: 'גבאי',
  business_manager: 'מנהל עסק',
  kosher_manager: 'מנהל כשרות במועצה',
  mikveh_manager: 'מנהל מקוואות',
  event_manager: 'מנהל אירועים',
  eruv_manager: 'ממונה על העירוב',
  city_admin: 'מנהל מערכת',
  dev: 'צוות פיתוח',
  super_admin: 'מנהל על',
};

const ROLE_COLORS: Record<UserRole, string> = {
  user:               Colors.textSecondary,
  gabbai:             Colors.primaryLight,
  business_manager: Colors.kosher,
  kosher_manager:     Colors.success,
  mikveh_manager:     Colors.mikveh,
  event_manager:      Colors.events,
  eruv_manager:       Colors.gold,
  city_admin:              Colors.danger,
  dev:                Colors.textSecondary,
  super_admin:        Colors.textSecondary,
};

interface MenuRowProps {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  badge?: string;
}

function MenuRow({ icon, label, onPress, color = Colors.text, badge }: MenuRowProps) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-back-outline" size={16} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const MINUTES_OPTIONS = [5, 10, 15, 20, 30];
const PRAYER_LABELS_HE: Record<string, string> = { shacharit: 'שחרית', mincha: 'מנחה', maariv: 'ערבית' };

export default function ProfileScreen() {
  const { appUser, firebaseUser, isDemo, isGuest, exitDemo, switchCity, updateHomeCity } = useAuth();
  const navigation = useNavigation<any>();
  const { top } = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [homeCityPickerOpen, setHomeCityPickerOpen] = useState(false);
  const { enabled, settings: notifSettings, setEnabled, setMinutesBefore, togglePrayer } = useNotifications();
  const { favorites } = useFavorites();
  const favoriteCount = Object.keys(favorites ?? {}).length;

  const role = appUser?.role ?? 'user';
  // A user can hold several roles at once (e.g. gabbai + kosher_manager) — appUser.role
  // is just the single highest-priority one used for the badge/auth checks, so gating
  // the management menu on it alone would hide every other role they actually hold.
  const roles = appUser?.roles ?? [role];
  const isManager = roles.some((r) => r !== 'user');
  const isAdminRole = roles.some((r) => ['city_admin', 'super_admin', 'dev'].includes(r));

  const cityId = useCityId();
  const { city } = useCity(cityId);

  const homeCityId = appUser?.homeCityId ?? cityId;
  const { city: homeCity } = useCity(homeCityId);

  function openHomeCityPicker() {
    if (role === 'city_admin') {
      Alert.alert(
        'לא ניתן לשנות עצמאית',
        'עיר הבית של מנהל עיר נקבעת על ידי מנהל המערכת ולא ניתנת לשינוי מהאפליקציה.',
      );
      return;
    }
    setHomeCityPickerOpen(true);
  }

  function handleSelectHomeCity(c: City) {
    if (c.id === homeCityId) return;
    const oldName = homeCity?.name ?? 'העיר הנוכחית';
    Alert.alert(
      'שינוי עיר בית',
      `שינוי עיר הבית יעדכן גם את העיר המוצגת כעת באפליקציה.\n\nלא תקבל/י יותר התראות דחופות על עירוב וכשרות עבור ${oldName}, ותתחיל/י לקבל אותן עבור ${c.name} במקום.\n\nהאם להמשיך?`,
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'שנה עיר בית', onPress: () => updateHomeCity(c.id) },
      ],
    );
  }

  // Gate every entry into the management area behind a biometric / PIN check.
  async function openManage(screen: string) {
    const ok = await requireManagerAuth();
    if (ok) navigation.navigate(screen);
  }

  async function handleLogout() {
    lockManagerArea();
    if (isDemo) {
      exitDemo();
      navigation.navigate('Auth');
      return;
    }
    // Warn about the notification impact only if they'd actually lose something —
    // no point alarming a user who never set up favorites/prayer reminders.
    const usesNotifications = enabled && favoriteCount > 0;
    const message = usesNotifications
      ? 'לאחר ההתנתקות תפסיק לקבל תזכורות תפילה מותאמות אישית ועדכונים כלליים (כשרות, קהילה, אירועים). יתקבלו רק התראות עירוב דחופות.\n\nהאם להמשיך?'
      : 'האם אתה בטוח שברצונך להתנתק?';
    Alert.alert('התנתקות', message, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתק',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          await logout();
          setLoading(false);
          navigation.navigate('Auth');
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      {/* Fixed colour cap: keeps primary blue behind the status bar when scrolled */}
      <View style={{ height: top, backgroundColor: Colors.primary }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Demo mode banner */}
      {isDemo && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerText}>✡ מצב הדגמה — הנתונים אינם אמיתיים</Text>
        </View>
      )}

      {/* Profile header */}
      <View style={[styles.headerBg, { paddingTop: 16 }]}>
        {isGuest ? (
          <>
            <View style={styles.avatarCircle}>
              <Ionicons name="person-outline" size={36} color={Colors.primaryDark} />
            </View>
            <Text style={styles.displayName}>אורח</Text>
            <Text style={styles.email}>התחבר כדי לקבוע תורים ולשמור מועדפים</Text>
            <TouchableOpacity style={styles.guestLoginBtn} onPress={() => navigation.navigate('Auth')}>
              <Ionicons name="log-in-outline" size={18} color={Colors.primaryDark} />
              <Text style={styles.guestLoginText}>התחבר / הרשמה</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(appUser?.displayName ?? firebaseUser?.displayName ?? 'א').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.displayName}>
              {appUser?.displayName ?? firebaseUser?.displayName ?? 'משתמש'}
            </Text>
            <Text style={styles.email}>{appUser?.email ?? firebaseUser?.email}</Text>
            <View style={styles.roleBadgeRow}>
              {/* A user can hold several roles at once — show every badge they carry,
                  not just the single highest-priority one used for auth checks. */}
              {/* ROLE_COLORS is tuned for role chips on white cards (dark text on a light
                  tint) — reused verbatim here it goes low-contrast, since this badge sits
                  directly on the dark blue header. Solid role-color fill + white text
                  keeps every role reliably readable regardless of its assigned hue. */}
              {(roles.length > 1 ? roles.filter((r) => r !== 'user') : roles).map((r) => (
                <View key={r} style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[r], borderColor: 'rgba(255,255,255,0.35)' }]}>
                  <Text style={styles.roleText}>{ROLE_LABELS[r]}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.content}>
        {/* Management section — only for non-regular users */}
        {isManager && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ניהול</Text>
            <View style={styles.card}>
              {(roles.includes('gabbai') || isAdminRole) && (
                <MenuRow icon="business-outline" label="ניהול בית כנסת" color={Colors.primaryLight}
                  onPress={() => openManage('ManageSynagogue')} />
              )}
              {(roles.includes('business_manager') || isAdminRole) && (
                <MenuRow icon="restaurant-outline" label="ניהול בתי עסק" color={Colors.kosher}
                  onPress={() => openManage('ManageRestaurant')} />
              )}
              {(roles.includes('kosher_manager') || isAdminRole) && (
                <MenuRow icon="shield-checkmark-outline" label="ניהול כשרות" color={Colors.success}
                  onPress={() => openManage('ManageKosher')} />
              )}
              {(roles.includes('event_manager') || isAdminRole) && (
                <MenuRow icon="megaphone-outline" label="ניהול אירועים והודעות" color={Colors.events}
                  onPress={() => openManage('ManageEvents')} />
              )}
              {(roles.includes('mikveh_manager') || isAdminRole) && (
                <MenuRow icon="water-outline" label="ניהול מקוואות" color={Colors.mikveh}
                  onPress={() => openManage('ManageMikveh')} />
              )}
              {isAdminRole && (
                <MenuRow icon="gift-outline" label='ניהול גמ"חים' color="#B06B3A"
                  onPress={() => openManage('ManageGemach')} />
              )}
              {(roles.includes('eruv_manager') || isAdminRole) && (
                <MenuRow icon="shield-outline" label="ניהול עירוב" color={Colors.gold}
                  onPress={() => openManage('ManageEruv')} />
              )}
              {isAdminRole && (
                <MenuRow icon="people-outline" label="ניהול משתמשים" color={Colors.danger}
                  onPress={() => openManage('UserManagement')} />
              )}
              {isAdminRole && (
                <MenuRow icon="globe-outline" label="ניהול ערים" color={Colors.primary}
                  onPress={() => openManage('ManageCities')} />
              )}
            </View>
          </View>
        )}

        {/* Prayer reminders */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תזכורות תפילה</Text>
          <View style={styles.card}>
            {/* Master toggle */}
            <View style={styles.notifRow}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
              <Text style={styles.notifLabel}>הפעל תזכורות</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                thumbColor={enabled ? Colors.primary : Colors.textMuted}
              />
            </View>

            {/* Expo Go limitation notice */}
            {IS_EXPO_GO && (
              <View style={styles.expoGoNotice}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.gold} />
                <Text style={styles.expoGoNoticeText}>
                  התראות דורשות Development Build — לא זמינות ב-Expo Go
                </Text>
              </View>
            )}

            {enabled && !IS_EXPO_GO && (
              <>
                {/* Favorites hint */}
                <View style={styles.favHint}>
                  <Ionicons
                    name={favoriteCount > 0 ? 'star' : 'star-outline'}
                    size={15}
                    color={favoriteCount > 0 ? Colors.goldBright : Colors.textSecondary}
                  />
                  <Text style={styles.favHintText}>
                    {favoriteCount > 0
                      ? `מקבל תזכורות עבור ${favoriteCount} בית${favoriteCount === 1 ? '' : 'י'} כנסת מועדפ${favoriteCount === 1 ? '' : 'ים'}`
                      : 'סמן בתי כנסת כמועדפים (★) כדי לקבל תזכורות'}
                  </Text>
                </View>

                {/* Minutes-before picker */}
                <View style={styles.notifSubSection}>
                  <Text style={styles.notifSubLabel}>כמה דקות לפני התפילה</Text>
                  <View style={styles.minutesRow}>
                    {MINUTES_OPTIONS.map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.minuteChip, notifSettings.minutesBefore === m && styles.minuteChipActive]}
                        onPress={() => setMinutesBefore(m)}
                      >
                        <Text style={[styles.minuteChipTxt, notifSettings.minutesBefore === m && styles.minuteChipTxtActive]}>
                          {m}׳
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Prayer type toggles */}
                <View style={styles.notifSubSection}>
                  <Text style={styles.notifSubLabel}>תפילות</Text>
                  <View style={styles.prayerCheckRow}>
                    {(['shacharit', 'mincha', 'maariv'] as const).map((p) => {
                      const active = notifSettings.prayers.includes(p);
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[styles.prayerChip, active && styles.prayerChipActive]}
                          onPress={() => togglePrayer(p)}
                        >
                          <Ionicons
                            name={active ? 'checkmark-circle' : 'ellipse-outline'}
                            size={16}
                            color={active ? Colors.white : Colors.textMuted}
                          />
                          <Text style={[styles.prayerChipTxt, active && styles.prayerChipTxtActive]}>
                            {PRAYER_LABELS_HE[p]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* General settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>הגדרות</Text>
          <View style={styles.card}>
            <MenuRow
              icon="language-outline"
              label="שפה"
              onPress={() => Alert.alert('בקרוב', 'תמיכה בשפות נוספות תתווסף בעתיד. כרגע האפליקציה זמינה בעברית בלבד.')}
              badge="עברית"
            />
            <MenuRow
              icon="location-outline"
              label="עיר"
              onPress={() => setCityPickerOpen(true)}
              badge={city?.name ?? '…'}
            />
            {!isGuest && (
              <MenuRow
                icon="home-outline"
                label="עיר בית"
                onPress={openHomeCityPicker}
                badge={homeCity?.name ?? '…'}
              />
            )}
          </View>
        </View>

        <CityPicker
          visible={cityPickerOpen}
          selectedCityId={cityId}
          onSelect={async (c: City) => {
            await switchCity(c.id);
          }}
          onClose={() => setCityPickerOpen(false)}
        />

        <CityPicker
          visible={homeCityPickerOpen}
          selectedCityId={homeCityId}
          onSelect={handleSelectHomeCity}
          onClose={() => setHomeCityPickerOpen(false)}
        />

        {/* About */}
        <View style={styles.section}>
          <View style={styles.card}>
            <MenuRow icon="information-circle-outline" label="אודות קהילה" onPress={() => {}} />
            <MenuRow icon="help-circle-outline" label="עזרה ותמיכה" onPress={() => {}} />
            <MenuRow icon="shield-outline" label="מדיניות פרטיות" onPress={() => {}} />
          </View>
        </View>

        {/* Logout — only for signed-in / demo users */}
        {!isGuest && (
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.danger} />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
                <Text style={styles.logoutText}>{isDemo ? 'יציאה ממצב הדגמה' : 'התנתקות'}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.version}>קהילה v1.0.0 — פיילוט</Text>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerBg: {
    backgroundColor: Colors.primary,
    paddingTop: 0,
    paddingBottom: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: Colors.primaryDark },
  displayName: { fontSize: 22, fontWeight: '700', color: Colors.white },
  email: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  roleBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  roleBadge: {
    borderRadius: Radius.full,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  roleText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  guestLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 14,
  },
  guestLoginText: { fontSize: 15, fontWeight: '800', color: Colors.primaryDark },
  content: { padding: Spacing.md, gap: Spacing.md },
  section: {},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    overflow: 'hidden',
    ...Shadow.card,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuLabel: { fontSize: 15, fontWeight: '500', flex: 1 },
  badge: {
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, color: Colors.textSecondary },
  // Notification settings
  notifRow:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notifLabel:       { fontSize: 15, fontWeight: '500', flex: 1, color: Colors.text },
  notifSubSection:  { paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notifSubLabel:    { fontSize: 12, color: Colors.textSecondary, fontWeight: '700', marginBottom: 10 },
  minutesRow:       { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  minuteChip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  minuteChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  minuteChipTxt:    { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  minuteChipTxtActive: { color: Colors.white },
  prayerCheckRow:   { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  prayerChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  prayerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  prayerChipTxt:    { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  prayerChipTxtActive: { color: Colors.white },

  // Favorites hint inside notifications section
  favHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F4FF',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  favHintText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'right',
  },

  // Expo Go notice
  expoGoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDF8EC',
    borderTopWidth: 1,
    borderTopColor: '#EDD98A',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  expoGoNoticeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.gold,
    fontWeight: '500',
    textAlign: 'right',
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    backgroundColor: '#FEF5F5',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: Colors.danger },
  version: { textAlign: 'center', fontSize: 11, color: Colors.textMuted, paddingBottom: Spacing.xl },
  demoBanner: {
    backgroundColor: Colors.accent,
    paddingVertical: 8,
    alignItems: 'center',
  },
  demoBannerText: { fontSize: 13, fontWeight: '700', color: Colors.primaryDark },
});
