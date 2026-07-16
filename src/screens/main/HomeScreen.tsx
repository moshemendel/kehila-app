import React, { useMemo, useState, useEffect } from 'react';
import { useAnalyticsTrack } from '../../services/analytics';
import {
  View, Text, Image, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Rendered from vector source to PNG at build time — react-native-svg's SVGO
// pipeline was silently corrupting these auto-vectorized, hundreds-of-path
// icons (verified: portrait-aspect icons like Prayers/Mikvahs rendered as
// unrecognizable clipped fragments), so these ship as raster images instead.
import SynagoguesIcon from '../../assets/icons/Synagogues.png';
import PrayersIcon from '../../assets/icons/Prayers.png';
import ZmanimIcon from '../../assets/icons/Zmanim.png';
import KosherCertificationIcon from '../../assets/icons/KosherCertification.png';
import MikvahsIcon from '../../assets/icons/Mikvahs.png';
import EventsIcon from '../../assets/icons/Events.png';
import EruvIcon from '../../assets/icons/Eruv.png';
import GemachIcon from '../../assets/icons/Gemach.png';

import { useAuth }           from '../../context/AuthContext';
import { useCityId }         from '../../hooks/useCityId';
import { useCity }           from '../../hooks/useCity';
import { useSynagogues }     from '../../hooks/useSynagogues';
import { useEventsFeed }     from '../../context/EventsContext';
import { useTodayZmanim }    from '../../hooks/useTodayZmanim';
import { useAppForegroundTick } from '../../hooks/useAppForegroundTick';
import { useZmanimSettings } from '../../context/ZmanimSettingsContext';
import { useKashrutUpdates } from '../../context/KashrutUpdatesContext';
import { useEruvStatus }     from '../../hooks/useEruv';

import {
  getTodaySchedule, getNextPrayer,
  formatPrayerLabel, hebrewDayOfWeek, parseTimeToMinutes,
} from '../../utils/prayerUtils';
import { formatHebrewDate }  from '../../utils/hebrewDate';
import { getJewishDayInfo, getUpcomingFast, getUpcomingYomTov } from '../../utils/jewishCalendar';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { MainTabParamList }  from '../../types';
import { calcZmanim, minToStr } from '../../utils/zmanim';

// ─────────────────────────────────────────────────────────────────
type Nav = BottomTabNavigationProp<MainTabParamList>;

// Quick-action items — rendered as a horizontal scroll row under the header
const QUICK_LINKS = [
  { icon: 'business-outline',      customIcon: SynagoguesIcon,          label: 'בתי כנסת',   tab: 'Synagogues'  as const, color: Colors.primary   },
  { icon: 'time-outline',          customIcon: PrayersIcon,             label: 'מניינים', tab: 'PrayerTimes' as const, color: Colors.shacharit },
  { icon: 'sunny-outline',         customIcon: ZmanimIcon,              label: 'זמנים',       tab: 'Zmanim'      as const, color: Colors.gold      },
  { icon: 'restaurant-outline',    customIcon: KosherCertificationIcon, label: 'כשרות',       tab: 'Restaurants' as const, color: Colors.kosher    },
  { icon: 'water-outline',         customIcon: MikvahsIcon,             label: 'מקווה',        tab: 'Mikveh'      as const, color: Colors.mikveh   },
  { icon: 'calendar-outline',      customIcon: EventsIcon,              label: 'אירועים',      tab: 'Events'      as const, color: Colors.events   },
  { icon: 'shield-outline',        customIcon: EruvIcon,                label: 'עירוב',         tab: 'Eruv'        as const, color: Colors.gold     },
  { icon: 'gift-outline',          customIcon: GemachIcon,              label: 'גמ"ח',          tab: 'Gemach'      as const, color: '#B06B3A'        },
  { icon: 'person-circle-outline', customIcon: undefined,               label: 'פרופיל',      tab: 'Profile'     as const, color: Colors.primary   },
];

function prayerAccent(type: string): string {
  if (type === 'shacharit') return Colors.shacharit;
  if (type === 'maariv')    return Colors.events;
  return Colors.primary;
}

// ── Live countdown helpers ────────────────────────────────────────────────────

function cityNowMin(tz: string): number {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
    return (h % 24) * 60 + m;
  } catch {
    return new Date().getHours() * 60 + new Date().getMinutes();
  }
}

function fmtCountdown(diffMin: number): string {
  if (diffMin <= 0) return '';
  if (diffMin < 60) return `${diffMin} דקות`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h} שע' ו-${m} דק'` : `${h} שעות`;
}

// ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  useAnalyticsTrack('home');
  const { appUser, refreshUser }  = useAuth();
  const navigation   = useNavigation<Nav>();
  const cityId       = useCityId();
  const { top, bottom } = useSafeAreaInsets();

  const { city, refetch: refetchCity }    = useCity(cityId);
  const { synagogues, loading: synLoad }  = useSynagogues(cityId);
  const { events, unreadCount, isRead }    = useEventsFeed();
  const todayZmanim                        = useTodayZmanim(cityId);
  const { settings: zmanimSettings }       = useZmanimSettings();
  // Forces the date-derived widgets below (Shabbat/Yom Tov/fast/Hebrew-date cards)
  // to recompute when the app returns to the foreground — otherwise each one's
  // new Date() is only ever evaluated once at first mount for the whole session.
  const foregroundTick                     = useAppForegroundTick();

  const { count: kashrutCount, totalCount: kashrutTotal, hasDowngrade } = useKashrutUpdates();
  const { status: eruvStatus } = useEruvStatus(cityId, false);
  // Only unread alerts drive the red badge / red banners
  const unreadAlerts = events.filter((e) => e.isAlert && !isRead(e.id));

  // ── Live 30-second tick (drives countdowns) ─────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Pull-to-refresh ──────────────────────────────────────────────
  // Most of this screen's data (synagogues, events, kashrut updates, eruv
  // status) is already live via Firestore onSnapshot listeners — refreshing
  // those wouldn't do anything. `city` and the signed-in user's own doc are
  // the two pieces that are only fetched once, so those are what an admin
  // change (e.g. new city coordinates, a role change) would need a manual
  // refresh to pick up.
  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    const minDuration = new Promise((resolve) => setTimeout(resolve, 500));
    await Promise.all([refetchCity(), refreshUser(), minDuration]);
    setRefreshing(false);
  }

  // ── Next prayer across all synagogues ──────────────────────────
  const { earliestSyn, nextPrayer } = useMemo(() => {
    let best: {
      syn: typeof synagogues[0];
      prayer: NonNullable<ReturnType<typeof getNextPrayer>>;
    } | null = null;

    for (const syn of synagogues) {
      const schedule = getTodaySchedule(syn.weeklySchedule, undefined, todayZmanim);
      if (!schedule) continue;
      const prayer = getNextPrayer(schedule);
      if (!prayer) continue;
      const nextMin = parseTimeToMinutes(prayer.nextTime);
      const bestMin = best ? parseTimeToMinutes(best.prayer.nextTime) : Infinity;
      if (nextMin >= 0 && nextMin < bestMin) {
        best = { syn, prayer };
      }
    }
    return {
      earliestSyn: best?.syn   ?? null,
      nextPrayer:  best?.prayer ?? null,
    };
  }, [synagogues, todayZmanim]);

  // ── Shabbat times ───────────────────────────────────────────────
  const shabbatInfo = useMemo(() => {
    if (!city) return null;
    try {
      const today = new Date();
      const dow   = today.getDay(); // 0=Sun … 5=Fri, 6=Sat

      const calc = (d: Date) =>
        calcZmanim(
          d,
          city.latitude,
          city.longitude,
          zmanimSettings,
          city.timezone || 'Asia/Jerusalem',
          city.elevation ?? 0,
        );

      // Find the upcoming (or current) Friday
      let daysTill: number;
      let fridayDate: Date;

      if (dow === 5) {
        daysTill   = 0;
        fridayDate = new Date(today);
      } else if (dow === 6) {
        daysTill   = 0; // Shabbat right now — last Friday
        fridayDate = new Date(today);
        fridayDate.setDate(today.getDate() - 1);
      } else {
        daysTill   = (5 - dow + 7) % 7;
        fridayDate = new Date(today);
        fridayDate.setDate(today.getDate() + daysTill);
      }

      const fridayZ  = calc(fridayDate);
      const candle40 = minToStr(fridayZ.shkia - 40); // 40 min before sunset
      const candle20 = minToStr(fridayZ.shkia - 20); // 20 min before sunset

      const satDate = new Date(fridayDate);
      satDate.setDate(fridayDate.getDate() + 1);
      const satZ        = calc(satDate);
      const tzetShabbat = minToStr(satZ.tzetHakochavim); // צאת שבת
      const rabbeinuTam = minToStr(satZ.shkia + 72);     // רבינו תם — 72 min after sunset

      return { dow, daysTill, candle40, candle20, tzetShabbat, rabbeinuTam };
    } catch {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, zmanimSettings, foregroundTick]);

  // ── Yom Tov widget ──────────────────────────────────────────────
  const yomTovInfo = useMemo(() => {
    if (!city) return null;
    try {
      const upcoming = getUpcomingYomTov(new Date(), 7);
      if (!upcoming) return null;

      const tz = city.timezone || 'Asia/Jerusalem';
      const calc = (d: Date) =>
        calcZmanim(d, city.latitude, city.longitude, zmanimSettings, tz, city.elevation ?? 0);

      const { daysUntilYomTov, lastDayDate, name } = upcoming;
      const lastZ = calc(lastDayDate);

      let candleTime: string | null = null;
      if (daysUntilYomTov >= 1) {
        const erevDate = new Date();
        erevDate.setDate(erevDate.getDate() + daysUntilYomTov - 1);
        // Don't show a specific time when Erev is Shabbat — different halacha
        if (erevDate.getDay() !== 6) {
          const erevZ = calc(erevDate);
          candleTime = minToStr(erevZ.shkia - 18); // 18 min before shkia
        }
      }

      return { name, daysUntilYomTov, candleTime, endTime: minToStr(lastZ.tzetHakochavim) };
    } catch {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, zmanimSettings, foregroundTick]);

  // ── Fast day info ────────────────────────────────────────────────
  const fastInfo = useMemo(() => {
    if (!city) return null;
    const lookAhead = zmanimSettings.taanisLookAheadDays ?? 1;
    const upcoming = getUpcomingFast(new Date(), lookAhead);
    if (!upcoming) return null;

    const tz = city.timezone || 'Asia/Jerusalem';
    const calc = (d: Date) =>
      calcZmanim(d, city.latitude, city.longitude, zmanimSettings, tz, city.elevation ?? 0);

    const fastDate = new Date();
    fastDate.setDate(fastDate.getDate() + upcoming.daysAhead);
    const z = calc(fastDate);

    let startTime: string;
    if (upcoming.isMajorFast) {
      const prevDay = new Date(fastDate);
      prevDay.setDate(fastDate.getDate() - 1);
      startTime = minToStr(calc(prevDay).shkia);
    } else {
      startTime = minToStr(z.alot);
    }

    return {
      name: upcoming.name,
      startTime,
      endTime: minToStr(z.tzetHakochavim),
      daysAhead: upcoming.daysAhead,
      isMajorFast: upcoming.isMajorFast,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, zmanimSettings, foregroundTick]);

  // ── Misc ────────────────────────────────────────────────────────
  const now        = new Date();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jewishInfo = useMemo(() => getJewishDayInfo(now), [foregroundTick]);
  const greeting   =
    now.getHours() < 12 ? 'בוקר טוב'
    : now.getHours() < 17 ? 'צהריים טובים'
    : 'ערב טוב';
  const cityName   = city?.name ?? '';
  const accentColor = nextPrayer ? prayerAccent(nextPrayer.type) : Colors.primary;

  // ── Shabbat widget helpers ──────────────────────────────────────
  // heading + two big times (right + left) + an optional bottom row
  const shabbat = useMemo(() => {
    if (!shabbatInfo) return null;
    const { dow, daysTill, candle40, candle20, tzetShabbat, rabbeinuTam } = shabbatInfo;

    // During / just after Shabbat — the candle times have passed, so feature
    // the end-of-Shabbat times as the two big numbers.
    if (dow === 6) {
      return {
        heading: 'שבת שלום ✡',
        rightLabel: 'צאת שבת:',  rightTime: tzetShabbat,
        leftLabel:  'רבינו תם',  leftTime:  rabbeinuTam,
        tzet: null, rt: null,
      };
    }

    const heading =
      dow === 5        ? 'הדלקת נרות היום'
      : daysTill === 1 ? 'שבת מחר'
      : daysTill === 2 ? 'שבת בעוד יומיים'
      : `שבת בעוד ${daysTill} ימים`;

    return {
      heading,
      rightLabel: 'הדלקת נרות:',    rightTime: candle20,
      leftLabel:  "לנוהגים 40 דק'", leftTime:  candle40,
      tzet: tzetShabbat, rt: rabbeinuTam,
    };
  }, [shabbatInfo]);

  // ── Live countdowns (depend on tick so they update every 30s) ────
  const shabbatCountdown = useMemo(() => {
    if (!shabbatInfo || shabbatInfo.dow !== 5 || !city) return null;
    const tz = city.timezone || 'Asia/Jerusalem';
    const nowMin = cityNowMin(tz);
    const [h, m] = shabbatInfo.candle20.split(':').map(Number);
    const diff = h * 60 + m - nowMin;
    if (diff <= 0) return 'הגיע זמן הדלקת נרות!';
    return `בעוד ${fmtCountdown(diff)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, shabbatInfo, city]);

  const fastCountdown = useMemo(() => {
    if (!fastInfo || fastInfo.daysAhead !== 0 || !city) return null;
    const tz = city.timezone || 'Asia/Jerusalem';
    const nowMin = cityNowMin(tz);
    const [sh, sm] = fastInfo.startTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const [eh, em] = fastInfo.endTime.split(':').map(Number);
    const endMin = eh * 60 + em;
    if (nowMin >= endMin) return null; // fast is over
    if (nowMin < startMin) {
      const diff = startMin - nowMin;
      return `הצום מתחיל בעוד ${fmtCountdown(diff)}`;
    }
    const diff = endMin - nowMin;
    return `הצום מסתיים בעוד ${fmtCountdown(diff)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, fastInfo, city]);

  // Hide the fast card once today's fast has fully ended
  const showFastCard = fastInfo !== null && (
    fastInfo.daysAhead > 0 || fastCountdown !== null
  );

  // Live countdown for Erev Yom Tov (updates every 30s via tick)
  const yomTovCountdown = useMemo(() => {
    if (!yomTovInfo || yomTovInfo.daysUntilYomTov !== 1 || !yomTovInfo.candleTime || !city) return null;
    const tz = city.timezone || 'Asia/Jerusalem';
    const nowMin = cityNowMin(tz);
    const [h, m] = yomTovInfo.candleTime.split(':').map(Number);
    const diff = h * 60 + m - nowMin;
    if (diff <= 0) return 'הגיע זמן הדלקת נרות!';
    return `בעוד ${fmtCountdown(diff)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, yomTovInfo, city]);

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Fixed colour cap: same shade as the gradient start.
          Stays behind the transparent status bar even when the user scrolls,
          so the white icons stay visible at all times. */}
      <View style={{ height: top, backgroundColor: Colors.primaryDark }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
      {/* ── Gradient header ──────────────────────────────────────── */}
      <LinearGradient
        colors={[Colors.primaryDark, Colors.primary]}
        style={[styles.header, { paddingTop: 16 }]}
      >
        <View style={styles.headerRow}>
          {/* Greeting */}
          <View style={styles.greetingCol}>
            <Text style={styles.greeting}>{greeting} 👋</Text>
            <Text style={styles.userName}>{appUser?.displayName ?? 'אורח'}</Text>
            <Text style={styles.cityName}>📍 {cityName}</Text>
          </View>

          {/* Date badge */}
          <View style={styles.dayBadge}>
            <Text style={styles.dayText}>יום {hebrewDayOfWeek()}</Text>
            <Text style={styles.dateHebrew}>{formatHebrewDate(now)}</Text>
            <Text style={styles.dateGregorian}>
              {now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
            </Text>
            {!!jewishInfo.yomTov && (
              <Text style={styles.yomTovBadge}>{jewishInfo.yomTov}</Text>
            )}
            {!jewishInfo.yomTov && !!jewishInfo.roshChodesh && (
              <Text style={styles.yomTovBadge}>{jewishInfo.roshChodesh}</Text>
            )}
            {!!jewishInfo.parasha && (
              <Text style={styles.parashaBadge}>פ׳ {jewishInfo.parasha}</Text>
            )}
            {!!jewishInfo.omer && (
              <Text style={styles.omerBadge}>{jewishInfo.omer}</Text>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* ── Quick actions row — right below gradient header ──────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickRow}
        style={styles.quickRowWrap}
      >
        {QUICK_LINKS.map(({ icon, customIcon, label, tab, color }) => {
          const badgeCount =
            tab === 'Events'      ? unreadCount  :
            tab === 'Restaurants' ? kashrutCount  : 0;
          const badgeRed =
            (tab === 'Events'      && unreadAlerts.length > 0) ||
            (tab === 'Restaurants' && hasDowngrade);
          return (
            <TouchableOpacity
              key={tab}
              style={styles.quickItem}
              onPress={() => navigation.navigate(tab)}
              activeOpacity={0.75}
            >
              <View style={[styles.quickItemIcon, { backgroundColor: color + '1C' }]}>
                {customIcon ? (
                  <Image source={customIcon} style={{ width: 40, height: 40 }} resizeMode="contain" />
                ) : (
                  <Ionicons name={icon as any} size={24} color={color} />
                )}
                {badgeCount > 0 && (
                  <View style={[styles.quickBadge, badgeRed && { backgroundColor: Colors.danger }]}>
                    <Text style={styles.quickBadgeTxt}>{badgeCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickItemLabel} numberOfLines={2}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Main content ─────────────────────────────────────────── */}
      <View style={styles.content}>

        {/* ── Prayer countdown card ────────────────────────── */}
        {!synLoad && nextPrayer && earliestSyn ? (
          <TouchableOpacity
            style={styles.prayerCard}
            onPress={() => navigation.navigate('PrayerTimes')}
            activeOpacity={0.85}
          >
            {/* Colored left accent bar */}
            <View style={[styles.prayerBar, { backgroundColor: accentColor }]} />

            <View style={styles.prayerBody}>
              <Text style={styles.prayerMeta}>התפילה הבאה</Text>
              <View style={styles.prayerRow}>
                <Text style={[styles.prayerType, { color: accentColor }]}>
                  {formatPrayerLabel(nextPrayer.type)}
                </Text>
                <Text style={styles.prayerTime}>{nextPrayer.nextTime}</Text>
              </View>
              <Text style={styles.prayerSyn} numberOfLines={1}>
                {earliestSyn.name}
              </Text>
            </View>

            <Ionicons name="chevron-back" size={20} color={Colors.textMuted} style={{ marginRight: 12 }} />
          </TouchableOpacity>
        ) : synLoad ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
        ) : null}

        {/* ── Kashrut updates banner — stays until all dismissed ── */}
        {kashrutTotal > 0 && (
          <TouchableOpacity
            style={[
              styles.kashrutBanner,
              kashrutCount > 0 && hasDowngrade && styles.kashrutBannerWarn,
              kashrutCount === 0 && styles.kashrutBannerAllRead,
            ]}
            onPress={() => (navigation as any).navigate('KashrutUpdates')}
            activeOpacity={0.85}
          >
            {kashrutCount > 0 ? (
              <View style={[styles.kashrutBadge, hasDowngrade && { backgroundColor: Colors.danger }]}>
                <Text style={styles.kashrutBadgeTxt}>{kashrutCount}</Text>
              </View>
            ) : (
              <Ionicons name="checkmark-circle" size={24} color={Colors.kosher} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.kashrutTitle}>
                {kashrutCount > 0 && hasDowngrade ? '⚠️ ' : ''}עדכוני כשרות
              </Text>
              <Text style={styles.kashrutSub}>
                {kashrutCount > 0
                  ? (hasDowngrade ? 'כולל ירידת כשרות · לחץ לצפייה' : 'לחץ לצפייה בעדכונים')
                  : 'הכל נקרא · לחץ לצפייה'}
              </Text>
            </View>
            <Ionicons
              name="chevron-back"
              size={18}
              color={kashrutCount > 0 && hasDowngrade ? Colors.danger : Colors.kosher}
            />
          </TouchableOpacity>
        )}

        {/* ── Eruv status banner — shown when status is known ── */}
        {eruvStatus && (
          <TouchableOpacity
            style={[
              styles.eruvBanner,
              eruvStatus.status === 'invalid' && styles.eruvBannerWarn,
              eruvStatus.status === 'valid'   && styles.eruvBannerOk,
            ]}
            onPress={() => navigation.navigate('Eruv')}
            activeOpacity={0.85}
          >
            <Ionicons
              name={eruvStatus.status === 'valid' ? 'shield-checkmark' : eruvStatus.status === 'invalid' ? 'shield' : 'shield-outline'}
              size={24}
              color={eruvStatus.status === 'valid' ? Colors.success : eruvStatus.status === 'invalid' ? Colors.danger : Colors.gold}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.eruvTitle, eruvStatus.status === 'invalid' && { color: Colors.danger }]}>
                {eruvStatus.status === 'valid' ? 'העירוב כשר' : eruvStatus.status === 'invalid' ? '⚠️ העירוב פגום' : 'מצב עירוב לא ידוע'}
              </Text>
              {eruvStatus.notes ? (
                <Text style={styles.eruvSub} numberOfLines={1}>{eruvStatus.notes}</Text>
              ) : (
                <Text style={styles.eruvSub}>לחץ לצפייה במפה</Text>
              )}
            </View>
            <Ionicons name="chevron-back" size={18} color={eruvStatus.status === 'invalid' ? Colors.danger : Colors.gold} />
          </TouchableOpacity>
        )}

        {/* ── Events & alerts banner ──────────────────────── */}
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.eventsBanner, unreadAlerts.length > 0 && styles.eventsBannerWarn]}
            onPress={() => navigation.navigate('Events')}
            activeOpacity={0.85}
          >
            <View style={[styles.eventsBadge, unreadAlerts.length > 0 && { backgroundColor: Colors.danger }]}>
              <Text style={styles.eventsBadgeTxt}>{unreadCount}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventsTitle}>
                {unreadAlerts.length > 0 ? '🚨 ' : '📅 '}אירועים והודעות
              </Text>
              <Text style={styles.eventsSub}>
                {unreadAlerts.length > 0
                  ? `כולל ${unreadAlerts.length} התראות לא נקראו · לחץ לצפייה`
                  : 'לחץ לצפייה באירועים'}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={unreadAlerts.length > 0 ? Colors.danger : Colors.events} />
          </TouchableOpacity>
        )}

        {/* ── Shabbat widget ───────────────────────────────── */}
        {!!shabbat && (
          <TouchableOpacity
            style={styles.shabbatCard}
            onPress={() => navigation.navigate('Zmanim')}
            activeOpacity={0.85}
          >
            <View style={styles.shabbatLeft}>
              <Text style={styles.shabbatEmoji}>🕯</Text>
            </View>
            <View style={styles.shabbatBody}>
              <Text style={styles.shabbatHeading}>{shabbat.heading}</Text>
              {!!shabbatCountdown && (
                <Text style={styles.shabbatCountdown}>{shabbatCountdown}</Text>
              )}

              {/* Two big times side by side */}
              <View style={styles.shabbatTimesRow}>
                <View style={styles.shabbatTimeCol}>
                  <Text style={styles.shabbatTimeLabel}>{shabbat.rightLabel}</Text>
                  <Text style={styles.shabbatBigTime}>{shabbat.rightTime}</Text>
                </View>
                <View style={styles.shabbatTimeCol}>
                  <Text style={styles.shabbatTimeLabel}>{shabbat.leftLabel}</Text>
                  <Text style={styles.shabbatBigTime}>{shabbat.leftTime}</Text>
                </View>
              </View>

              {/* Bottom row: end-of-Shabbat times (two columns, aligned under the times above) */}
              {!!shabbat.tzet && (
                <View style={styles.shabbatEndRow}>
                  <View style={styles.shabbatEndCol}>
                    <Text style={styles.shabbatEndItem}>
                      צאת שבת: <Text style={styles.shabbatEndTime}>{shabbat.tzet}</Text>
                    </Text>
                  </View>
                  <View style={styles.shabbatEndCol}>
                    <Text style={styles.shabbatEndItem}>
                      רבינו תם: <Text style={styles.shabbatEndTime}>{shabbat.rt}</Text>
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* ── Yom Tov widget ──────────────────────────────── */}
        {!!yomTovInfo && (
          <TouchableOpacity
            style={styles.yomTovCard}
            onPress={() => navigation.navigate('Zmanim')}
            activeOpacity={0.85}
          >
            <View style={styles.yomTovLeft}>
              <Text style={styles.yomTovEmoji}>✨</Text>
            </View>
            <View style={styles.yomTovBody}>
              <Text style={styles.yomTovHeading}>
                {yomTovInfo.daysUntilYomTov === 0
                  ? `חג שמח · ${yomTovInfo.name}`
                  : yomTovInfo.daysUntilYomTov === 1
                    ? `הדלקת נרות היום · ${yomTovInfo.name}`
                    : yomTovInfo.daysUntilYomTov === 2
                      ? `מחר · ${yomTovInfo.name}`
                      : `${yomTovInfo.name} · בעוד ${yomTovInfo.daysUntilYomTov} ימים`}
              </Text>
              {!!yomTovCountdown && (
                <Text style={styles.yomTovCountdown}>{yomTovCountdown}</Text>
              )}
              <View style={styles.yomTovTimesRow}>
                {yomTovInfo.candleTime ? (
                  <View style={styles.yomTovTimeCol}>
                    <Text style={styles.yomTovTimeLabel}>הדלקת נרות</Text>
                    <Text style={styles.yomTovBigTime}>{yomTovInfo.candleTime}</Text>
                  </View>
                ) : (
                  <View style={styles.yomTovTimeCol} />
                )}
                <View style={styles.yomTovTimeCol}>
                  <Text style={styles.yomTovTimeLabel}>מוצאי חג</Text>
                  <Text style={styles.yomTovBigTime}>{yomTovInfo.endTime}</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Fast day widget ──────────────────────────────── */}
        {showFastCard && fastInfo && (
          <TouchableOpacity
            style={styles.fastCard}
            onPress={() => navigation.navigate('Zmanim')}
            activeOpacity={0.85}
          >
            <View style={styles.fastLeft}>
              <Text style={styles.fastEmoji}>✡</Text>
            </View>
            <View style={styles.fastBody}>
              <Text style={styles.fastHeading}>
                {fastInfo.daysAhead === 0
                  ? fastInfo.name
                  : fastInfo.daysAhead === 1
                    ? `מחר · ${fastInfo.name}`
                    : fastInfo.daysAhead === 2
                      ? `בעוד יומיים · ${fastInfo.name}`
                      : `${fastInfo.name} · בעוד ${fastInfo.daysAhead} ימים`}
              </Text>

              <View style={styles.fastTimesRow}>
                <View style={styles.fastTimeCol}>
                  <Text style={styles.fastTimeLabel}>
                    {fastInfo.isMajorFast ? 'כניסת הצום' : 'עלות השחר'}
                  </Text>
                  <Text style={styles.fastBigTime}>{fastInfo.startTime}</Text>
                </View>
                <View style={styles.fastTimeCol}>
                  <Text style={styles.fastTimeLabel}>צאת הכוכבים</Text>
                  <Text style={styles.fastBigTime}>{fastInfo.endTime}</Text>
                </View>
              </View>

              {!!fastCountdown && (
                <Text style={styles.fastCountdownTxt}>{fastCountdown}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}

      </View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ── Header ────────────────────────────────────────────────────
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingCol: { flex: 1, marginRight: Spacing.sm },
  greeting:   { fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  userName:   { fontSize: 22, fontWeight: '800', color: Colors.white, marginTop: 2 },
  cityName:   { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  dayBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 118,
  },
  dayText:       { fontSize: 11, color: Colors.accentLight, fontWeight: '600', marginBottom: 2 },
  dateHebrew:    { fontSize: 15, color: Colors.white, fontWeight: '800', textAlign: 'center' },
  dateGregorian: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 3, textAlign: 'center' },
  yomTovBadge:   { fontSize: 11, color: Colors.goldBright, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  parashaBadge:  { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 3, textAlign: 'center' },
  omerBadge:     { fontSize: 10, color: Colors.goldMuted, fontWeight: '600', marginTop: 3, textAlign: 'center' },

  // ── Content ───────────────────────────────────────────────────
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },

  // ── Kashrut updates banner ────────────────────────────────────
  kashrutBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.sm,
    backgroundColor: Colors.kosher + '12',
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.kosher + '40',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom:    Spacing.md,
  },
  kashrutBannerWarn:    { backgroundColor: Colors.danger + '10', borderColor: Colors.danger + '50' },
  kashrutBannerAllRead: { backgroundColor: Colors.kosher + '08', borderColor: Colors.kosher + '25' },
  kashrutBadge:    { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: Colors.kosher, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  kashrutBadgeTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  kashrutTitle:    { fontSize: 15, fontWeight: '800', color: Colors.text },
  kashrutSub:      { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  // ── Eruv banner ───────────────────────────────────────────────
  eruvBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.sm,
    backgroundColor: Colors.gold + '12',
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.gold + '40',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom:    Spacing.md,
  },
  eruvBannerWarn: { backgroundColor: Colors.danger + '10', borderColor: Colors.danger + '50' },
  eruvBannerOk:   { backgroundColor: Colors.success + '0E', borderColor: Colors.success + '35' },
  eruvTitle:      { fontSize: 15, fontWeight: '800', color: Colors.text },
  eruvSub:        { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  // ── Events & alerts banner ────────────────────────────────────
  eventsBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.sm,
    backgroundColor: Colors.events + '12',
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.events + '40',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom:    Spacing.md,
  },
  eventsBannerWarn: { backgroundColor: Colors.danger + '10', borderColor: Colors.danger + '50' },
  eventsBadge:    { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: Colors.events, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  eventsBadgeTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  eventsTitle:    { fontSize: 15, fontWeight: '800', color: Colors.text },
  eventsSub:      { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  // ── Prayer countdown card ─────────────────────────────────────
  prayerCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...Shadow.card,
    shadowOpacity: 0.1,
    elevation: 5,
  },
  prayerBar:  { width: 6, alignSelf: 'stretch' },
  prayerBody: { flex: 1, paddingVertical: 16, paddingHorizontal: 14 },
  prayerMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 4, letterSpacing: 0.3 },
  prayerRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 4 },
  prayerType: { fontSize: 20, fontWeight: '800' },
  prayerTime: { fontSize: 30, fontWeight: '800', color: Colors.text },
  prayerSyn:  { fontSize: 13, color: Colors.textSecondary },

  // ── Shabbat widget ────────────────────────────────────────────
  shabbatCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gold + '50',
    ...Shadow.card,
  },
  shabbatLeft: {
    width: 68,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gold + '18',
  },
  shabbatEmoji:      { fontSize: 30 },
  shabbatBody:       { flex: 1, paddingVertical: 14, paddingHorizontal: 16 },
  shabbatHeading:    { fontSize: 14, color: Colors.text, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  shabbatTimesRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shabbatTimeCol:    { alignItems: 'center', flex: 1 },
  shabbatTimeLabel:  { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 2 },
  shabbatBigTime:    { fontSize: 28, fontWeight: '800', color: Colors.gold, lineHeight: 32 },
  shabbatEndRow:     { flexDirection: 'row', marginTop: 12 },
  shabbatEndCol:     { flex: 1, alignItems: 'center' },
  shabbatEndItem:    { fontSize: 13, color: Colors.textSecondary },
  shabbatEndTime:    { fontSize: 13, color: Colors.gold, fontWeight: '700' },
  shabbatCountdown:  { fontSize: 13, color: Colors.gold, fontWeight: '700', textAlign: 'center', marginTop: -4, marginBottom: 8 },

  // ── Fast day widget ───────────────────────────────────────────
  fastCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.events + '50',
    ...Shadow.card,
  },
  fastLeft: {
    width: 68,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.events + '18',
  },
  fastEmoji:       { fontSize: 26, color: Colors.events },
  fastBody:        { flex: 1, paddingVertical: 14, paddingHorizontal: 16 },
  fastHeading:     { fontSize: 14, color: Colors.text, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  fastTimesRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  fastTimeCol:     { alignItems: 'center', flex: 1 },
  fastTimeLabel:   { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 2 },
  fastBigTime:     { fontSize: 28, fontWeight: '800', color: Colors.events, lineHeight: 32 },
  fastCountdownTxt:{ fontSize: 13, color: Colors.events, fontWeight: '700', textAlign: 'center', marginTop: 10 },

  // ── Yom Tov widget ───────────────────────────────────────────
  yomTovCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#E07B2A50',
    ...Shadow.card,
  },
  yomTovLeft: {
    width: 68,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E07B2A18',
  },
  yomTovEmoji:      { fontSize: 30 },
  yomTovBody:       { flex: 1, paddingVertical: 14, paddingHorizontal: 16 },
  yomTovHeading:    { fontSize: 14, color: Colors.text, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  yomTovCountdown:  { fontSize: 13, color: '#E07B2A', fontWeight: '700', textAlign: 'center', marginTop: -4, marginBottom: 8 },
  yomTovTimesRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  yomTovTimeCol:    { alignItems: 'center', flex: 1 },
  yomTovTimeLabel:  { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 2 },
  yomTovBigTime:    { fontSize: 28, fontWeight: '800', color: '#E07B2A', lineHeight: 32 },

  // ── Sections ─────────────────────────────────────────────────
  section:       { marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle:  { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  seeAll:        { fontSize: 13, color: Colors.primaryLight, fontWeight: '600' },

  // ── Quick actions horizontal row ─────────────────────────────
  quickRowWrap: {
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  quickRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: 0,
  },
  quickItem: {
    alignItems: 'center',
    gap: 6,
    width: 70,
  },
  quickItemIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickItemLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 14,
  },
  quickBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    backgroundColor: Colors.kosher,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.cardBackground,
  },
  quickBadgeTxt: { fontSize: 9, color: Colors.white, fontWeight: '800' },
});
