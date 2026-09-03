import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Linking, Image, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigateTo } from '../../hooks/useNavigateTo';
import ReportListingButton from '../../components/ReportListingButton';
import EditListingButton from '../../components/EditListingButton';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { PrayerTimeSlot, Shiur, Synagogue, SynagogueAnnouncement } from '../../types';
import { getSynagogue } from '../../services/synagogues';
import { useCityId } from '../../hooks/useCityId';
import { shouldShowSelichot, daysUntilSelichot } from '../../utils/selichot';
import { useTodayZmanim } from '../../hooks/useTodayZmanim';
import { useShabbatZmanim } from '../../hooks/useShabbatZmanim';
import { ZmanimResult } from '../../utils/zmanim';
import { useFavorites } from '../../context/FavoritesContext';
import { useSynagoguesFeed } from '../../context/SynagoguesContext';
import { useSynagogueEventReminders } from '../../context/SynagogueEventRemindersContext';
import { splitAnnouncements } from '../../utils/synagogueAnnouncements';
import FavoritePrayerModal, { ModalOptions } from '../../components/FavoritePrayerModal';
import EventReminderModal from '../../components/EventReminderModal';
import { getSlotLabel } from '../../utils/prayerUtils';
import { collectShiurim } from '../../utils/prayerNotifications';
import { gabbaimOf, contactPhoneOf } from '../../utils/synagogueContacts';
import {
  getTodaySchedule, getNextPrayer, formatPrayerLabel, formatDays,
  parseTimeToMinutes, nowInMinutes, hebrewDayOfWeek,
} from '../../utils/prayerUtils';

// ─── Layout constants (identical to BusinessDetailScreen / MikvehDetailScreen) ──
const MOOD_H        = 186;
const CIRCLE_D      = 72;
const CBORDER       = 3;
const CIRCLE_OUTER  = CIRCLE_D + CBORDER * 2;
const CIRCLE_OVERLAP = CIRCLE_OUTER / 2;

// ─── Lookup tables ─────────────────────────────────────────────────────────────
const NUSACH_LABELS: Record<string, string> = {
  ashkenaz: 'אשכנז', sefard: 'ספרד', edot_hamizrach: 'עדות המזרח',
  maroko: 'מרוקאי', other: 'אחר',
};

const NUSACH_COLORS: Record<string, string> = {
  ashkenaz:       Colors.mikveh,
  sefard:         Colors.events,
  edot_hamizrach: Colors.kosher,
  maroko:         Colors.gold,
  other:          Colors.textSecondary,
};

const NUSACH_EMOJIS: Record<string, string> = {
  ashkenaz:       '🕍',
  sefard:         '🕌',
  edot_hamizrach: '✡️',
  maroko:         '🌙',
  other:          '⛪',
};

const PRAYER_HE: Record<string, string> = {
  shacharit: 'שחרית', mincha: 'מנחה', maariv: 'ערבית',
};

const PRAYER_COLOR: Record<string, string> = {
  shacharit: Colors.shacharit,
  mincha:    Colors.primary,
  maariv:    Colors.maariv,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function synAddress(syn: Synagogue): string {
  return syn.address.he ?? syn.address.en ?? '';
}

function primaryNusachColor(syn: Synagogue): string {
  const values = Array.isArray(syn.nusach)
    ? syn.nusach.filter(Boolean)
    : (syn.nusach ? [syn.nusach as unknown as string] : []);
  return NUSACH_COLORS[values[0] ?? ''] ?? Colors.primary;
}

/** "16/08 (מוצ״ש)" — dated selichot nights, named the way people refer to them.
 *  An after-midnight slot is called for the evening it follows. */
function formatSelichotDates(dates: string[]): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return [...dates].sort().map((iso) => {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  }).join(', ');
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, onPress, color = Colors.primary }: {
  icon: string; label: string; value: string; onPress?: () => void; color?: string;
}) {
  return (
    <TouchableOpacity
      style={st.infoRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <Ionicons name={`${icon}-outline` as any} size={16} color={color} style={st.infoIcon} />
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={[st.infoValue, onPress && { color }]}>{value}</Text>
      {onPress && <Ionicons name="open-outline" size={13} color={color} />}
    </TouchableOpacity>
  );
}

function TimeChips({ times, color = Colors.primary }: { times: string[]; color?: string }) {
  const now = nowInMinutes();
  if (!times || times.length === 0) return <Text style={st.noTimes}>—</Text>;
  return (
    <View style={st.timeChipsRow}>
      {times.map((t, i) => {
        const past = parseTimeToMinutes(t) <= now;
        return (
          <View key={i} style={[
            st.timeChip,
            { backgroundColor: color + '14', borderColor: color + '40' },
            past && st.timeChipPast,
          ]}>
            <Text style={[st.timeChipTxt, { color }, past && st.timeChipTxtPast]}>{t}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PrayerSection({ label, times, color }: { label: string; times: string[]; color?: string }) {
  if (!times || times.length === 0) return null;
  return (
    <View style={st.prayerSection}>
      <Text style={st.prayerSectionLabel}>{label}</Text>
      <TimeChips times={times} color={color} />
    </View>
  );
}

function SlotChips({ slots, color = Colors.primary, zmanim }: { slots: PrayerTimeSlot[]; color?: string; zmanim?: ZmanimResult | null }) {
  if (!slots || slots.length === 0) return <Text style={st.noTimes}>—</Text>;
  return (
    <View style={st.timeChipsRow}>
      {slots.map((slot, i) => (
        <View key={i} style={st.slotChipWrap}>
          <View style={[st.timeChip, { backgroundColor: color + '14', borderColor: color + '40' }]}>
            <Text style={[st.timeChipTxt, { color }]}>{getSlotLabel(slot, zmanim)}</Text>
          </View>
          {!!slot.notes && <Text style={st.slotChipNote}>{slot.notes}</Text>}
        </View>
      ))}
    </View>
  );
}

function SlotPrayerSection({ label, slots, color, zmanim }: { label: string; slots?: PrayerTimeSlot[]; color?: string; zmanim?: ZmanimResult | null }) {
  if (!slots || slots.length === 0) return null;
  return (
    <View style={st.prayerSection}>
      <Text style={st.prayerSectionLabel}>{label}</Text>
      <SlotChips slots={slots} color={color} zmanim={zmanim} />
    </View>
  );
}

const CATEGORY_HE: Record<string, string> = {
  shiur: 'שיעור', community: 'קהילה', holiday: 'חג',
  announcement: 'הודעה', alert: 'התראה', youth: 'נוער', charity: 'צדקה',
};

function AnnouncementRow({ ann, synagogueId }: { ann: SynagogueAnnouncement; synagogueId: string }) {
  const { getReminders, setReminders } = useSynagogueEventReminders();
  const [modalOpen, setModalOpen] = useState(false);
  const minutes = getReminders(synagogueId, ann.id);
  const hasReminder = minutes.length > 0;

  const date = new Date(ann.startDate);
  const dateStr = date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const accentColor = ann.isAlert ? Colors.danger : Colors.events;
  return (
    // The whole card opens the reminder sheet — not just the bell — since a
    // small icon in the corner of a card this size is easy to miss, and
    // there is nowhere else tapping the card could usefully go: everything
    // the announcement has to say is already shown inline below.
    <TouchableOpacity
      style={[st.annRow, { borderRightColor: accentColor }]}
      onPress={() => setModalOpen(true)}
      activeOpacity={0.75}
    >
      <View style={st.annTop}>
        <View style={[st.annBadge, { backgroundColor: accentColor + '18', borderColor: accentColor + '50' }]}>
          <Text style={[st.annBadgeTxt, { color: accentColor }]}>{CATEGORY_HE[ann.category] ?? ann.category}</Text>
        </View>
        <Text style={st.annDate}>{dateStr} · {timeStr}</Text>
        <View style={[st.annRemindBtn, hasReminder && st.annRemindBtnActive]}>
          <Ionicons
            name={hasReminder ? 'notifications' : 'notifications-outline'}
            size={16}
            color={hasReminder ? Colors.white : Colors.textSecondary}
          />
        </View>
      </View>
      <Text style={st.annTitle}>{ann.title}</Text>
      <Text style={st.annDesc}>{ann.description}</Text>
      {!!ann.location && (
        <View style={st.annLocRow}>
          <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
          <Text style={st.annLoc}>{ann.location}</Text>
        </View>
      )}

      <EventReminderModal
        visible={modalOpen}
        eventTitle={ann.title}
        startDate={ann.startDate}
        initial={minutes}
        onSave={(m) => { setReminders(synagogueId, ann.id, m); setModalOpen(false); }}
        onRemove={() => { setReminders(synagogueId, ann.id, []); setModalOpen(false); }}
        onClose={() => setModalOpen(false)}
      />
    </TouchableOpacity>
  );
}

/** `hideDay` is for the Shabbat board, where the day is the section, not the row. */
function ShiurRow({ sh, hideDay = false }: { sh: Shiur; hideDay?: boolean }) {
  const dayLabel = hideDay
    ? ''
    : sh.days === 'daily' ? 'יומי' : formatDays(sh.days as number[]);
  return (
    <View style={st.shiurRow}>
      <View style={st.shiurLeft}>
        <Text style={st.shiurTitle}>{sh.title}</Text>
        <Text style={st.shiurRabbi}>{sh.rabbi}</Text>
        {sh.description && <Text style={st.shiurDesc}>{sh.description}</Text>}
      </View>
      <View style={st.shiurRight}>
        <Text style={st.shiurTime}>{sh.time}</Text>
        <Text style={st.shiurDay}>{dayLabel}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function SynagogueDetailScreen() {
  const route               = useRoute<any>();
  const navigation          = useNavigation<any>();
  const { top, bottom }     = useSafeAreaInsets();

  // Support two navigation patterns:
  // 1. { synagogue: Synagogue } — from SynagogueListScreen (full object passed)
  // 2. { synagogueId: string }  — from EventDetailScreen (fetches on mount)
  const [fetched, setFetched] = React.useState<Synagogue | null>(route.params.synagogue ?? null);
  const [loading, setLoading] = React.useState(!route.params.synagogue);

  // The passed-in object is a snapshot taken when the list was tapped, so on
  // its own it goes stale the moment anyone edits this synagogue — including
  // the manager who just edited it from this very screen and came back to
  // check their work. The city's synagogues are already live here via one
  // shared listener, so the live copy wins whenever it has this one, and the
  // passed object stays as the thing that renders instantly on arrival and the
  // fallback for the id-only entry point.
  const { synagogues } = useSynagoguesFeed();
  const syn = React.useMemo(
    () => synagogues.find((x) => x.id === (fetched?.id ?? route.params.synagogueId)) ?? fetched,
    [synagogues, fetched, route.params.synagogueId],
  );
  const cityId              = useCityId();
  const todayZmanim         = useTodayZmanim(cityId);
  const { friday: fridayZmanim, shabbat: shabbatZmanim } = useShabbatZmanim(cityId);
  const { isFavorite, getFavoriteSetting, setFavorite, removeFavorite } = useFavorites();
  const [modalVisible, setModalVisible] = React.useState(false);
  const { go: navigateTo, sheet: navSheet } = useNavigateTo();

  React.useEffect(() => {
    if (syn) { setLoading(false); return; }
    const id: string | undefined = route.params.synagogueId;
    if (!id) { setLoading(false); return; }
    getSynagogue(id)
      .then((s) => { if (s) setFetched(s); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useMemo must stay before any conditional return — guard against null syn
  const modalOptions = React.useMemo<ModalOptions>(() => {
    if (!syn) return { shacharit: [], mincha: [], maariv: [], shiurim: [] };
    const buildSlots = (type: 'shacharit' | 'mincha' | 'maariv') =>
      (syn.weeklySchedule?.[type] ?? []).map((slot, i) => ({
        index: i,
        label: getSlotLabel(slot, todayZmanim),
        notes: slot.notes ?? undefined,
      }));
    const shiurim = collectShiurim(syn).map((sh, i) => ({
      index:     i,
      title:     sh.title,
      rabbi:     sh.rabbi,
      time:      sh.time,
      daysLabel: sh.days === 'daily' ? 'יומי' : formatDays(sh.days as number[]),
    }));
    return {
      shacharit: buildSlots('shacharit'),
      mincha:    buildSlots('mincha'),
      maariv:    buildSlots('maariv'),
      shiurim,
    };
  }, [syn, todayZmanim]);

  // Report affordance lives in the stack header — visible the moment something
  // looks wrong, without scrolling to the bottom of a long listing.
  //
  // This must sit here, before the loading/not-found returns below, not next
  // to the rest of the render logic that reads `syn` further down. Reached
  // via { synagogue: fullObject } (the synagogue list), `syn` is non-null
  // from the very first render, so a copy of this positioned after the
  // guards never actually skipped a render and the bug stayed invisible for
  // as long as that was the only way in. Reached via { synagogueId } (first
  // wired up for EventDetailScreen's "view synagogue" link, now also used by
  // MyEventsScreen's synagogue-reminder cards), the first render has
  // syn === null and returns the loading spinner early — skipping this hook
  // entirely — and the render after the fetch resolves reaches past the
  // guards and calls it for the first time: one more hook than the previous
  // render, straight into React's "Rendered more hooks" error.
  React.useLayoutEffect(() => {
    if (!syn) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <EditListingButton
            variant="icon"
            iconColor={Colors.white}
            entityType="synagogue"
            entityId={syn.id}
            entityCityId={syn.cityId}
          />
          <ReportListingButton
            variant="icon"
            iconColor={Colors.white}
            cityId={syn.cityId}
            entityType="synagogue"
            entityId={syn.id}
            entityName={syn.name}
            color={primaryNusachColor(syn)}
          />
        </View>
      ),
    });
  }, [navigation, syn]);

  // ── All hooks called — safe to do conditional returns ─────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!syn) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Ionicons name="business-outline" size={52} color={Colors.textMuted} />
        <Text style={{ fontSize: 17, color: Colors.textSecondary, fontWeight: '600' }}>
          בית הכנסת לא נמצא
        </Text>
      </View>
    );
  }

  // ── syn is guaranteed non-null from here ──────────────────────────────────
  const fav      = isFavorite(syn.id);
  const hasNav   = !!(syn.latitude && syn.longitude);
  const navTarget = { latitude: syn.latitude, longitude: syn.longitude, address: synAddress(syn), wazeLink: syn.wazeLink };

  const nusachValues = Array.isArray(syn.nusach) ? syn.nusach.filter(Boolean) : (syn.nusach ? [syn.nusach as unknown as string] : []);
  const primaryNusach = nusachValues[0] ?? '';
  const nusachColor = NUSACH_COLORS[primaryNusach] ?? Colors.primary;
  const nusachLabel = nusachValues.join(' / ');
  const nusachEmoji = NUSACH_EMOJIS[primaryNusach] ?? '🕍';

  // Images — same pattern as BusinessDetailScreen / MikvehDetailScreen
  const allImages: string[] = [
    ...(syn.imageUrl ? [syn.imageUrl] : []),
    ...(syn.images ?? []),
  ].filter(Boolean);
  const moodImage   = allImages[0];
  const extraImages = allImages.slice(1, 4);
  const hasCircles  = extraImages.length > 0;

  // Today's schedule + next prayer (computed once, used in card + today section)
  const sched      = getTodaySchedule(syn.weeklySchedule, syn.shabbatSchedule, todayZmanim);
  const nextPrayer = sched ? getNextPrayer(sched) : null;
  let   diffTxt    = '';
  if (nextPrayer) {
    const diff = parseTimeToMinutes(nextPrayer.nextTime) - nowInMinutes();
    const h    = Math.floor(diff / 60);
    const m    = diff % 60;
    diffTxt = h > 0
      ? (h >= 2 ? `בעוד ${h} שעות${m > 0 ? ` ו${m} דקות` : ''}` : `בעוד 01:${String(m).padStart(2, '0')}`)
      : `בעוד ${m} דקות`;
  }

  /**
   * Shiurim, split by when they run rather than by where they were filed.
   *
   * A shiur can sit in any of three places — the admin writes the top-level
   * array, the two schedules predate it — so they are merged first and sorted
   * out afterwards.
   *
   * A Shabbat-only shiur belongs on the Shabbat board: on Shabbat nobody is
   * scanning the weekday list for it, and a "ש" badge in a weekday section is
   * the same noise as an "א–ו" badge on a Shabbat slot. Anything else stays in
   * the weekday list — a daily shiur, or one that runs Monday AND Shabbat, has
   * a day label that is doing real work.
   *
   * The board only exists when the shul has a shabbatSchedule at all, so
   * without one nothing is moved and the single list keeps everything. Better a
   * "ש" badge than a shiur with nowhere to appear.
   */
  const allShiurim = [
    ...(syn.weeklySchedule.shiurim ?? []),
    ...(syn.shabbatSchedule?.shiurim ?? []),
    ...(syn.shiurim ?? []),
  ];
  const shabbatOnly = (sh: Shiur) =>
    Array.isArray(sh.days) && sh.days.length === 1 && sh.days[0] === 7;
  const shabbatShiurim = syn.shabbatSchedule ? allShiurim.filter(shabbatOnly) : [];
  const weekdayShiurim = allShiurim.filter((sh) => !shabbatShiurim.includes(sh));

  const gabbaim   = gabbaimOf(syn);
  const callPhone = contactPhoneOf(syn);
  const hasPhone  = !!callPhone;

  return (
    <View style={st.container}>
      {/* The stack header runs under the status bar, so its icons sit on
          the section colour — light, like every other headered screen. */}
        <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: top + 8, paddingBottom: (bottom || 0) + 48 }}
      >

        {/* ══ Main card (same pattern as business / mikveh) ═══════════════ */}
        <View style={st.card}>

          {/* ── Mood / cover image (or nusach-tinted emoji placeholder) ── */}
          <View style={[st.moodWrap, { backgroundColor: nusachColor + '28' }]}>
            {moodImage ? (
              <Image
                source={{ uri: moodImage }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : (
              <View style={st.moodPlaceholder}>
                <Text style={st.moodEmoji}>{nusachEmoji}</Text>
                <Text style={[st.moodLabel, { color: nusachColor }]}>{nusachLabel}</Text>
              </View>
            )}
          </View>

          {/* ── Extra-image circles (overlapping mood bottom edge) ──────── */}
          {hasCircles && (
            <View style={st.circlesRow}>
              {extraImages.map((uri, i) => (
                <View key={i} style={st.circleWrap}>
                  <Image source={{ uri }} style={st.circleImg} resizeMode="cover" />
                </View>
              ))}
            </View>
          )}

          {/* ── Card body ──────────────────────────────────────────────── */}
          <View style={[st.cardBody, hasCircles && { paddingTop: CIRCLE_OVERLAP + 12 }]}>

            {/* Name row + favourite button */}
            <View style={st.nameRow}>
              <View style={{ flex: 1 }}>
                <View style={st.badgeRow}>
                  <View style={[st.nusachBadge, { backgroundColor: nusachColor + '18', borderColor: nusachColor + '50' }]}>
                    <Text style={[st.nusachBadgeTxt, { color: nusachColor }]}>{nusachLabel}</Text>
                  </View>
                </View>
                <Text style={st.name}>{syn.name}</Text>
                {syn.neighborhood && <Text style={st.neighborhood}>{syn.neighborhood}</Text>}
              </View>
              <TouchableOpacity
                style={st.favBtn}
                onPress={() => setModalVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={fav ? 'star' : 'star-outline'}
                  size={26}
                  color={fav ? Colors.goldBright : Colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Next prayer — inline tinted banner */}
            {nextPrayer && (
              <View style={[st.nextCard, { backgroundColor: nusachColor + '12', borderColor: nusachColor + '35' }]}>
                <View style={st.nextLeft}>
                  <Text style={[st.nextLabel, { color: nusachColor + 'AA' }]}>תפילה הבאה</Text>
                  <Text style={[st.nextName, { color: nusachColor }]}>{formatPrayerLabel(nextPrayer.type)}</Text>
                  <Text style={[st.nextDiff, { color: nusachColor + 'BB' }]}>{diffTxt}</Text>
                </View>
                <Text style={[st.nextTime, { color: nusachColor }]}>{nextPrayer.nextTime}</Text>
              </View>
            )}

            {/* Address */}
            {!!synAddress(syn) && (
              <TouchableOpacity
                style={st.metaRow}
                onPress={hasNav ? () => navigateTo(navTarget) : undefined}
                activeOpacity={hasNav ? 0.7 : 1}
              >
                <Ionicons name="location-outline" size={15} color={nusachColor} />
                <Text style={st.metaText}>{synAddress(syn)}</Text>
                {hasNav && <Ionicons name="chevron-back" size={13} color={Colors.textMuted} />}
              </TouchableOpacity>
            )}

            {/* Phone */}
            {hasPhone && (
              <TouchableOpacity
                style={st.metaRow}
                onPress={() => Linking.openURL(`tel:${callPhone}`)}
                activeOpacity={0.7}
              >
                <Ionicons name="call-outline" size={15} color={Colors.textSecondary} />
                <Text style={[st.metaText, { color: nusachColor }]}>{callPhone}</Text>
              </TouchableOpacity>
            )}

            {/* Favourite notice */}
            {fav && (
              <TouchableOpacity style={st.favNoticeRow} onPress={() => setModalVisible(true)}>
                <Ionicons name="star" size={13} color={Colors.goldBright} />
                <Text style={st.favNoticeTxt}>
                  {getFavoriteSetting(syn.id) === 'all'
                    ? 'תזכורות פעילות לכל התפילות · לחץ לעריכה'
                    : 'תזכורות לתפילות נבחרות · לחץ לעריכה'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Action buttons — same layout as business / mikveh */}
            {(hasNav || !!syn.wazeLink || hasPhone) && (
              <View style={st.actionsRow}>
                {(hasNav || !!syn.wazeLink) && (
                  <TouchableOpacity
                    style={[st.actionBtn, st.actionBtnPrimary, { backgroundColor: nusachColor, borderColor: nusachColor }]}
                    onPress={() => navigateTo(navTarget)}
                  >
                    <Ionicons name="navigate" size={18} color="#fff" />
                    <Text style={[st.actionBtnTxt, { color: '#fff' }]}>ניווט</Text>
                  </TouchableOpacity>
                )}
                {hasPhone && (
                  <TouchableOpacity
                    style={[st.actionBtn, { borderColor: nusachColor, backgroundColor: nusachColor + '0D' }]}
                    onPress={() => Linking.openURL(`tel:${callPhone}`)}
                  >
                    <Ionicons name="call-outline" size={18} color={nusachColor} />
                    <Text style={[st.actionBtnTxt, { color: nusachColor }]}>חייג</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── General info ─────────────────────────────────────────────────── */}
        <View style={st.section}>
          <View style={st.sectionHdr}>
            <Ionicons name="information-circle-outline" size={18} color={nusachColor} />
            <Text style={st.sectionTitle}>פרטים</Text>
          </View>
          <View style={st.sectionCard}>
            {!!nusachLabel && (
              <InfoRow icon="layers" label="נוסח" value={nusachLabel} color={nusachColor} />
            )}
            {!!syn.neighborhood && (
              <InfoRow icon="map" label="שכונה" value={syn.neighborhood} color={nusachColor} />
            )}
            {!!(syn.rabbiName ?? syn.rabbi) && (
              <InfoRow icon="person" label="רב" value={syn.rabbiName ?? syn.rabbi!} color={nusachColor}
                onPress={syn.rabbiPhone ? () => Linking.openURL(`tel:${syn.rabbiPhone}`) : undefined} />
            )}
            {/* One row per gabbai — a shul with three of them used to show the
                first and silently drop the rest. Labelled singular or plural so
                the row does not read as a list of one. */}
            {gabbaim.map((g, i) => (
              <InfoRow key={`${g.name}-${i}`} icon="people"
                label={i === 0 ? (gabbaim.length > 1 ? 'גבאים' : 'גבאי') : ''}
                value={g.phone ? `${g.name}  ${g.phone}` : g.name}
                color={nusachColor}
                onPress={g.phone ? () => Linking.openURL(`tel:${g.phone}`) : undefined} />
            ))}
            {!!syn.phone && (
              <InfoRow icon="call" label="טלפון" value={syn.phone} color={nusachColor}
                onPress={() => Linking.openURL(`tel:${syn.phone}`)} />
            )}
            {!!syn.navigationNote && (
              <InfoRow icon="compass" label="ניווט" value={syn.navigationNote} color={nusachColor} />
            )}
            {!!syn.notes && (
              <InfoRow icon="document-text" label="הערות" value={syn.notes} color={nusachColor} />
            )}
          </View>
        </View>

        {/* ── Today's prayer times ──────────────────────────────────────────── */}
        <View style={st.section}>
          <View style={st.sectionHdr}>
            <Ionicons name="time-outline" size={18} color={nusachColor} />
            <Text style={st.sectionTitle}>היום — יום {hebrewDayOfWeek()}</Text>
          </View>
          <View style={st.sectionCard}>
            {!sched
              ? <Text style={st.noTimes}>אין מידע להיום</Text>
              : (
                <>
                  <PrayerSection label="שחרית" times={sched.shacharit} color={nusachColor} />
                  <PrayerSection label="מנחה"  times={sched.mincha}    color={nusachColor} />
                  <PrayerSection label="ערבית" times={sched.maariv}    color={nusachColor} />
                </>
              )
            }
          </View>
        </View>

        {/* ── Weekly schedule ───────────────────────────────────────────────── */}
        <View style={st.section}>
          <View style={st.sectionHdr}>
            <Ionicons name="calendar-outline" size={18} color={nusachColor} />
            <Text style={st.sectionTitle}>לוח שבועי</Text>
          </View>
          <View style={st.sectionCard}>
            {(['shacharit', 'mincha', 'maariv'] as const).map((type) => {
              const slots = syn.weeklySchedule[type];
              if (!slots || slots.length === 0) return null;
              const color = PRAYER_COLOR[type];
              return (
                <View key={type} style={st.weekPrayerBlock}>
                  <View style={[st.weekPrayerTitleRow, { borderRightColor: color }]}>
                    <Text style={[st.weekPrayerTitle, { color }]}>{PRAYER_HE[type]}</Text>
                  </View>
                  {slots.map((slot, i) => (
                    <View key={i} style={st.weekSlotRow}>
                      <Text style={[st.weekSlotTime, { color }]}>{getSlotLabel(slot, todayZmanim)}</Text>
                      <Text style={st.weekSlotDays}>{formatDays(slot.days ?? [])}</Text>
                      {!!slot.notes && <Text style={st.weekSlotNote}>{slot.notes}</Text>}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Shabbat ───────────────────────────────────────────────────────── */}
        {/* Anchored times resolve against the day they fall on, not today:
            kabbalat Shabbat to Friday's sunset, everything from shacharit on to
            Shabbat's own. Reading them off today put "half an hour before
            sunset" minutes out midweek and much further out across a season. */}
        {!!syn.shabbatSchedule && (
          <View style={st.section}>
            <View style={st.sectionHdr}>
              <Ionicons name="moon-outline" size={18} color={nusachColor} />
              <Text style={st.sectionTitle}>שבת</Text>
            </View>
            <View style={st.sectionCard}>
              <SlotPrayerSection label={'קבלת שבת / מנחה ע"ש'} slots={syn.shabbatSchedule.minchaFriday} color={nusachColor} zmanim={fridayZmanim} />
              <SlotPrayerSection label="שחרית" slots={syn.shabbatSchedule.shacharit} color={nusachColor} zmanim={shabbatZmanim} />
              <SlotPrayerSection label="מנחה"  slots={syn.shabbatSchedule.mincha}    color={nusachColor} zmanim={shabbatZmanim} />
              <SlotPrayerSection label="ערבית" slots={syn.shabbatSchedule.maariv}    color={nusachColor} zmanim={shabbatZmanim} />
              {shabbatShiurim.length > 0 && (
                <View style={st.prayerSection}>
                  <Text style={st.prayerSectionLabel}>שיעורים</Text>
                  {shabbatShiurim.map((sh) => <ShiurRow key={sh.id} sh={sh} hideDay />)}
                </View>
              )}
              {!!syn.shabbatSchedule.notes && (
                <Text style={st.shabbatNotes}>{syn.shabbatSchedule.notes}</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Selichot — seasonal, shown from a week before this shul starts ── */}
        {(syn.weeklySchedule?.selichot ?? []).length > 0 && shouldShowSelichot(syn) && (() => {
          const daysAway = daysUntilSelichot(syn);
          return (
            <View style={st.section}>
              <View style={st.sectionHdr}>
                <Ionicons name="moon-outline" size={18} color={Colors.gold} />
                <Text style={st.sectionTitle}>סליחות</Text>
                {daysAway > 0 && (
                  <Text style={st.selichotCountdown}>
                    {daysAway === 1 ? 'מתחילות מחר' : `בעוד ${daysAway} ימים`}
                  </Text>
                )}
              </View>
              <View style={st.sectionCard}>
                {(syn.weeklySchedule.selichot ?? []).map((slot, i) => (
                  <View key={i} style={st.weekSlotRow}>
                    <Text style={[st.weekSlotTime, { color: Colors.gold }]}>
                      {getSlotLabel(slot, todayZmanim)}
                    </Text>
                    <Text style={st.weekSlotDays}>
                      {slot.dates?.length
                        ? formatSelichotDates(slot.dates)
                        : formatDays(slot.days ?? [])}
                    </Text>
                    {!!slot.notes && <Text style={st.weekSlotNote}>{slot.notes}</Text>}
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── Synagogue announcements / events ─────────────────────────────── */}
        {/* Upcoming only — a resident has no use for an announcement whose
            event already happened, and the gabay's own screen is where a
            past one gets recycled forward rather than re-shown here as is. */}
        {(() => {
          const { upcoming } = splitAnnouncements(syn.synagogueEvents ?? []);
          if (upcoming.length === 0) return null;
          const hasAlerts = upcoming.some((a) => a.isAlert);
          return (
            <View style={st.section}>
              <View style={st.sectionHdr}>
                <Ionicons
                  name={hasAlerts ? 'warning-outline' : 'megaphone-outline'}
                  size={18}
                  color={hasAlerts ? Colors.danger : Colors.events}
                />
                <Text style={st.sectionTitle}>אירועים והודעות</Text>
              </View>
              <View style={st.sectionCard}>
                {upcoming.map((ann) => (
                  <AnnouncementRow key={ann.id} ann={ann} synagogueId={syn.id} />
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── Shiurim ───────────────────────────────────────────────────────── */}
        {weekdayShiurim.length > 0 && (
          <View style={st.section}>
            <View style={st.sectionHdr}>
              <Ionicons name="book-outline" size={18} color={nusachColor} />
              {/* Named only when a Shabbat list exists too — otherwise this one
                  holds everything and the qualifier would be a lie. */}
              <Text style={st.sectionTitle}>
                {shabbatShiurim.length > 0 ? 'שיעורים בימות החול' : 'שיעורים'}
              </Text>
            </View>
            <View style={st.sectionCard}>
              {weekdayShiurim.map((sh) => <ShiurRow key={sh.id} sh={sh} />)}
            </View>
          </View>
        )}

      </ScrollView>

      {/* Favourite prayer picker */}
      <FavoritePrayerModal
        visible={modalVisible}
        synName={syn.name}
        current={getFavoriteSetting(syn.id)}
        options={modalOptions}
        onSave={(setting) => { setFavorite(syn.id, setting); setModalVisible(false); }}
        onRemove={() => { removeFavorite(syn.id); setModalVisible(false); }}
        onClose={() => setModalVisible(false)}
      />

      {navSheet}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ── Main card (matches BusinessDetailScreen / MikvehDetailScreen) ────────
  card: {
    backgroundColor:  Colors.cardBackground,
    marginHorizontal: Spacing.md,
    borderRadius:     Radius.lg,
    ...Shadow.card,
    shadowOpacity: 0.13,
    elevation:     6,
    marginBottom:  Spacing.md,
  },

  // Nusach-coloured mood area at the top of the card
  moodWrap: {
    height:               MOOD_H,
    borderTopLeftRadius:  Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow:             'hidden',
  },
  moodPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  moodEmoji: { fontSize: 64 },
  moodLabel: { fontSize: 16, fontWeight: '700' },

  // Extra-image circles — same geometry as business/mikveh
  circlesRow: {
    position:       'absolute',
    top:            MOOD_H - CIRCLE_OVERLAP,
    left:           0,
    right:          0,
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            10,
    zIndex:         10,
  },
  circleWrap: {
    width:           CIRCLE_OUTER,
    height:          CIRCLE_OUTER,
    borderRadius:    CIRCLE_OUTER / 2,
    borderWidth:     CBORDER,
    borderColor:     Colors.cardBackground,
    overflow:        'hidden',
    backgroundColor: Colors.cardBackground,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.22,
    shadowRadius:    4,
    elevation:       5,
  },
  circleImg: { width: CIRCLE_D, height: CIRCLE_D, borderRadius: CIRCLE_D / 2 },

  // Card body
  cardBody: { padding: Spacing.md },

  // Name + fav row
  nameRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  badgeRow:     { flexDirection: 'row', marginBottom: 4 },
  nusachBadge:  { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  nusachBadgeTxt: { fontSize: 11, fontWeight: '800' },
  name:         { fontSize: 22, fontWeight: '800', color: Colors.text,  },
  neighborhood: { fontSize: 12, color: Colors.textSecondary, marginTop: 2,  },
  favBtn:       { marginTop: 4 },

  // Next prayer inline card
  nextCard: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    borderRadius:      Radius.md,
    borderWidth:       1,
    paddingHorizontal: Spacing.md,
    paddingVertical:   12,
    marginBottom:      Spacing.sm,
  },
  nextLeft:  { gap: 2 },
  nextLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.7,  },
  nextName:  { fontSize: 18, fontWeight: '800',  },
  nextDiff:  { fontSize: 12, fontWeight: '600',  },
  nextTime:  { fontSize: 34, fontWeight: '800', letterSpacing: 1 },

  // Meta rows (address / phone)
  metaRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingVertical:   5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  metaText:  { flex: 1, fontSize: 13, color: Colors.textSecondary,  },
  metaLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600',  },
  metaValue: { fontSize: 13, color: Colors.text, fontWeight: '600', flex: 1,  },

  // Favourite notice
  favNoticeRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    marginTop:         Spacing.sm,
    backgroundColor:   Colors.goldBright + '18',
    borderRadius:      Radius.full,
    paddingHorizontal: 10,
    paddingVertical:   5,
    alignSelf:         'flex-end',
  },
  favNoticeTxt: { fontSize: 11, color: Colors.gold, fontWeight: '600' },

  // Action buttons — full-width row inside card (same as business/mikveh)
  actionsRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    marginTop:     Spacing.md,
    flexWrap:      'wrap',
  },
  actionBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    paddingVertical: 10,
    borderRadius:    Radius.md,
    borderWidth:     1.5,
    minWidth:        72,
  },
  actionBtnPrimary: { /* backgroundColor and borderColor applied inline */ },
  actionBtnTxt:     { fontSize: 14, fontWeight: '700' },

  // ── Sections ───────────────────────────────────────────────────────────────
  section:     { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionHdr:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  sectionTitle:{ fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1,  },
  selichotCountdown: { fontSize: 12, fontWeight: '700', color: Colors.gold },

  // Inner section card (same visual as business hoursCard / certCard container)
  sectionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius:    Radius.md,
    padding:         Spacing.md,
    ...Shadow.card,
  },

  // Info rows (פרטים section)
  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoIcon:  { width: 20 },
  infoLabel: { fontSize: 13, color: Colors.textMuted, width: 56,  },
  infoValue: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600',  },

  // Prayer time chips
  prayerSection:      { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 6,  },
  prayerSectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.text,  },
  timeChipsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  timeChip:           { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  timeChipPast:       { backgroundColor: Colors.border, borderColor: 'transparent' },
  timeChipTxt:        { fontSize: 13, fontWeight: '700' },
  timeChipTxtPast:    { color: Colors.textMuted },
  noTimes:            { fontSize: 13, color: Colors.textMuted,  },

  // Shabbat slot chips
  slotChipWrap: { alignItems: 'center', gap: 2 },
  slotChipNote: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', maxWidth: 80, textAlign: 'center' },
  shabbatNotes: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: Spacing.sm,  },

  // Weekly schedule
  weekPrayerBlock:    { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  weekPrayerTitleRow: { borderRightWidth: 3, paddingRight: 8, marginBottom: 8, alignItems: 'flex-start' },
  weekPrayerTitle:    { fontSize: 13, fontWeight: '800',  },
  weekSlotRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  weekSlotTime:       { fontSize: 16, fontWeight: '800', minWidth: 48,  },
  weekSlotDays:       { fontSize: 13, fontWeight: '700', color: Colors.text },
  weekSlotNote:       { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', flexShrink: 1 },

  // Announcements / synagogue events
  annRow: {
    paddingVertical:   12,
    paddingRight:      10,
    borderRightWidth:  3,
    marginBottom:      2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap:               4,
  },
  annTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  annBadge:    { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  annBadgeTxt: { fontSize: 10, fontWeight: '700' },
  annDate:     { fontSize: 11, color: Colors.textMuted, flex: 1,  },
  annRemindBtn: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  annRemindBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  annTitle:    { fontSize: 14, fontWeight: '700', color: Colors.text,  },
  annDesc:     { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  annLocRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  annLoc:      { fontSize: 11, color: Colors.textMuted },

  // Shiurim
  shiurRow:   { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  shiurLeft:  { flex: 1 },
  shiurTitle: { fontSize: 14, fontWeight: '700', color: Colors.text,  },
  shiurRabbi: { fontSize: 12, color: Colors.textSecondary, marginTop: 2,  },
  shiurDesc:  { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  shiurRight: { alignItems: 'flex-start' },
  shiurTime:  { fontSize: 14, fontWeight: '700', color: Colors.primaryLight },
  shiurDay:   { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
