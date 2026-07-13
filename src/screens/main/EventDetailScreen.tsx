import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Share, Linking, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEventsFeed } from '../../context/EventsContext';
import { CommunityEvent, EventCategory } from '../../types';
import { formatHebrewDate } from '../../utils/hebrewDate';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CFG: Record<EventCategory, { icon: string; color: string; label: string }> = {
  shiur:        { icon: 'book',          color: Colors.primary,      label: 'שיעור'  },
  community:    { icon: 'people',        color: Colors.events,       label: 'קהילה'  },
  youth:        { icon: 'happy',         color: Colors.kosher,       label: 'נוער'   },
  charity:      { icon: 'heart',         color: Colors.danger,       label: 'צדקה'   },
  holiday:      { icon: 'star',          color: Colors.goldBright,   label: 'חג'     },
  announcement: { icon: 'megaphone',     color: Colors.primaryLight, label: 'הודעה'  },
  alert:        { icon: 'warning',       color: Colors.danger,       label: 'התראה'  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function countdownLabel(iso: string): { text: string; urgent: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return { text: 'הסתיים', urgent: false };
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 60)  return { text: `בעוד ${mins} דקות`, urgent: true };
  if (hours < 24)  return { text: `היום · ${new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`, urgent: true };
  if (days  === 1) return { text: 'מחר', urgent: false };
  if (days  < 7)   return { text: `בעוד ${days} ימים`, urgent: false };
  return { text: `בעוד ${Math.floor(days / 7)} שבועות`, urgent: false };
}

async function openNavigation(event: CommunityEvent) {
  // Prefer coordinates, fall back to address text search
  const wazeCoords = event.latitude && event.longitude
    ? `waze://?ll=${event.latitude},${event.longitude}&navigate=yes`
    : null;
  const wazeSearch = event.location
    ? `waze://?q=${encodeURIComponent(event.location)}&navigate=yes`
    : null;
  const mapsUrl = event.latitude && event.longitude
    ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
    : event.location
      ? `https://maps.google.com/?q=${encodeURIComponent(event.location)}`
      : null;

  const wazeUrl = wazeCoords ?? wazeSearch;
  if (wazeUrl) {
    const canWaze = await Linking.canOpenURL('waze://').catch(() => false);
    if (canWaze) { Linking.openURL(wazeUrl); return; }
  }
  if (mapsUrl) { Linking.openURL(mapsUrl); return; }
}

function hasNavigation(event: CommunityEvent): boolean {
  return !!(event.latitude || event.longitude || event.location);
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { top, bottom } = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { eventId } = route.params as { eventId: string };

  const { findEvent, isFavorite, toggleFavorite, dismiss, markRead } = useEventsFeed();
  const event = findEvent(eventId);

  // Auto-mark as read when the user opens the detail screen
  useEffect(() => {
    if (eventId) markRead(eventId);
  }, [eventId, markRead]);

  // 60-second tick so the countdown chip stays accurate
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!event) {
    return (
      <View style={[styles.notFound, { paddingTop: top + 20 }]}>
        <Ionicons name="calendar-outline" size={52} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>האירוע לא נמצא</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>חזור</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg      = CATEGORY_CFG[event.category] ?? CATEGORY_CFG.announcement;
  const favorite = isFavorite(event.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const countdown = useMemo(() => countdownLabel(event.startDate), [tick, event.startDate]);

  const handleShare = useCallback(async () => {
    const lines = [
      event.title,
      '',
      event.description,
      event.location ? `📍 ${event.location}` : '',
      `📅 ${formatFullDate(event.startDate)}`,
      event.organizer ? `👤 ${event.organizer}` : '',
    ].filter(Boolean).join('\n');
    await Share.share({ message: lines });
  }, [event]);

  const handleWhatsApp = useCallback(async () => {
    const lines = [
      event.title,
      '',
      event.description,
      event.location ? `📍 ${event.location}` : '',
      `📅 ${formatFullDate(event.startDate)}`,
      event.organizer ? `👤 ${event.organizer}` : '',
    ].filter(Boolean).join('\n');
    const url = `whatsapp://send?text=${encodeURIComponent(lines)}`;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      await Share.share({ message: lines });
    }
  }, [event]);

  const handleDismiss = useCallback(() => {
    Alert.alert('הסתר אירוע', 'האירוע יוסר מהפיד שלך. ניתן לשחזר דרך הגדרות.', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'הסתר',
        style: 'destructive',
        onPress: () => { dismiss(event.id); navigation.goBack(); },
      },
    ]);
  }, [event.id, dismiss, navigation]);

  const handleSynagogue = useCallback(() => {
    if (event.synagogueId) {
      navigation.navigate('SynagogueDetail', { synagogueId: event.synagogueId });
    }
  }, [event.synagogueId, navigation]);

  return (
    <View style={styles.root}>
      {/* ── Colored header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: top + 8, backgroundColor: cfg.color }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={handleWhatsApp} style={styles.headerBtn}>
              <Ionicons name="logo-whatsapp" size={22} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
              <Ionicons name="share-social-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.categoryCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name={cfg.icon as any} size={32} color={Colors.white} />
        </View>

        {event.isAlert && (
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>🚨 התראה דחופה</Text>
          </View>
        )}

        <Text style={styles.headerTitle}>{event.title}</Text>
        <Text style={styles.headerCategory}>{cfg.label}</Text>

        {/* Countdown chip */}
        <View style={[styles.countdownChip, countdown.urgent && styles.countdownChipUrgent]}>
          <Ionicons name="time-outline" size={13} color={countdown.urgent ? Colors.danger : Colors.white} />
          <Text style={[styles.countdownText, countdown.urgent && styles.countdownTextUrgent]}>
            {countdown.text}
          </Text>
        </View>
      </View>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 120 }}
      >
        {/* Date card */}
        <InfoCard icon="calendar-outline" iconColor={cfg.color} label="תאריך ושעה">
          <Text style={styles.infoMain}>{formatFullDate(event.startDate)}</Text>
          <Text style={styles.infoSub}>{formatHebrewDate(new Date(event.startDate))}</Text>
          {event.endDate && (
            <Text style={styles.infoSub}>עד {formatFullDate(event.endDate)}</Text>
          )}
        </InfoCard>

        {/* Location card */}
        {event.location && (
          <InfoCard icon="location-outline" iconColor={Colors.danger} label="מיקום">
            <View style={styles.locationRow}>
              <Text style={[styles.infoMain, { flex: 1 }]}>{event.location}</Text>
              {hasNavigation(event) && (
                <TouchableOpacity style={styles.wazeBtn} onPress={() => openNavigation(event)}>
                  <Ionicons name="navigate" size={14} color={Colors.white} />
                  <Text style={styles.wazeBtnText}>ניווט</Text>
                </TouchableOpacity>
              )}
            </View>
          </InfoCard>
        )}

        {/* Organizer */}
        {event.organizer && (
          <InfoCard icon="person-outline" iconColor={Colors.primary} label="מארגן">
            <Text style={styles.infoMain}>{event.organizer}</Text>
          </InfoCard>
        )}

        {/* Synagogue link */}
        {event.synagogueId && (
          <TouchableOpacity onPress={handleSynagogue}>
            <InfoCard icon="business-outline" iconColor={Colors.primary} label="בית כנסת">
              <View style={styles.locationRow}>
                <Text style={[styles.infoMain, styles.linkText, { flex: 1 }]}>פתח דף בית הכנסת</Text>
                <Ionicons name="chevron-back" size={16} color={Colors.primary} />
              </View>
            </InfoCard>
          </TouchableOpacity>
        )}

        {/* Description */}
        <View style={styles.descCard}>
          <Text style={styles.descLabel}>פרטים</Text>
          <Text style={styles.descText}>{event.description}</Text>
        </View>
      </ScrollView>

      {/* ── Fixed bottom action bar ──────────────────────────────────────────── */}
      <View style={[styles.actionBar, { paddingBottom: bottom + 12 }]}>
        {/* Favorite — primary action */}
        <TouchableOpacity
          style={[styles.favBtn, favorite && styles.favBtnActive]}
          onPress={() => toggleFavorite(event)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={favorite ? 'star' : 'star-outline'}
            size={20}
            color={favorite ? Colors.white : Colors.goldBright}
          />
          <Text style={[styles.favBtnText, favorite && styles.favBtnTextActive]}>
            {favorite ? 'במועדפים · תקבל תזכורת' : 'הוסף למועדפים'}
          </Text>
        </TouchableOpacity>

        {/* Dismiss — secondary */}
        <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss}>
          <Ionicons name="eye-off-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.dismissBtnText}>הסתר</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── InfoCard sub-component ────────────────────────────────────────────────────

function InfoCard({
  icon, iconColor, label, children,
}: { icon: string; iconColor: string; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoCardLeft}>
        <View style={[styles.infoIconCircle, { backgroundColor: iconColor + '18' }]}>
          <Ionicons name={icon as any} size={17} color={iconColor} />
        </View>
      </View>
      <View style={styles.infoCardBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Not found
  notFound:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 17, color: Colors.textSecondary, fontWeight: '600' },
  backLink:     { fontSize: 15, color: Colors.primary, fontWeight: '700', marginTop: 8 },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  headerBtn: {
    padding: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  categoryCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  alertBadge: {
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 3,
  },
  alertBadgeText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  headerTitle:    { fontSize: 22, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  headerCategory: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },

  // Countdown
  countdownChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
    marginTop: 4,
  },
  countdownChipUrgent: { backgroundColor: Colors.white },
  countdownText:       { fontSize: 13, fontWeight: '700', color: Colors.white },
  countdownTextUrgent: { color: Colors.danger },

  // Scroll
  scroll: { flex: 1 },

  // InfoCard
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  infoCardLeft:   { alignItems: 'center', paddingTop: 2 },
  infoIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  infoCardBody:   { flex: 1 },
  infoLabel:      { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 4 },
  infoMain:       { fontSize: 15, fontWeight: '600', color: Colors.text },
  infoSub:        { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  linkText:       { color: Colors.primary },

  // Location row with Waze button
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wazeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  wazeBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  // Description
  descCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.card,
  },
  descLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 8 },
  descText:  { fontSize: 15, color: Colors.text, lineHeight: 24 },

  // Action bar
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
    ...Shadow.card,
  },
  favBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: Radius.md,
    borderWidth: 2, borderColor: Colors.goldBright,
    backgroundColor: 'transparent',
  },
  favBtnActive:    { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  favBtnText:      { fontSize: 15, fontWeight: '700', color: Colors.goldBright },
  favBtnTextActive:{ color: Colors.white },

  dismissBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 14, paddingHorizontal: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
  },
  dismissBtnText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
