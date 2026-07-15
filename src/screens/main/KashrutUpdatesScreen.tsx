import React from 'react';
import { useAnalyticsTrack } from '../../services/analytics';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKashrutUpdates } from '../../context/KashrutUpdatesContext';
import { formatKashrutUpdateTitle as formatTitle, formatKashrutUpdateDetail as formatDetail } from '../../services/kashrutUpdates';
import { KashrutUpdate } from '../../types';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

function formatWhen(u: KashrutUpdate): string {
  const c: any = u.createdAt;
  const d = c?.toDate ? c.toDate() : (c?.seconds ? new Date(c.seconds * 1000) : new Date());
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export default function KashrutUpdatesScreen() {
  useAnalyticsTrack('kashrut_updates');
  const { updates, isRead, dismiss, dismissAll, markRead, markUnread, markAllRead } = useKashrutUpdates();
  const { bottom } = useSafeAreaInsets();

  const hasUnread = updates.some((u) => !isRead(u.id));

  function handleClearAll() {
    Alert.alert('נקה הכל', 'להסתיר את כל העדכונים לצמיתות?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'הסתר הכל', style: 'destructive', onPress: dismissAll },
    ]);
  }

  return (
    <View style={s.container}>

      {/* ── Action bar ────────────────────────────────────────────────────── */}
      {updates.length > 0 && (
        <View style={s.actionBar}>
          {hasUnread && (
            <TouchableOpacity style={s.markAllBtn} onPress={markAllRead} activeOpacity={0.8}>
              <Ionicons name="checkmark-done-outline" size={15} color={Colors.primary} />
              <Text style={s.markAllTxt}>סמן הכל כנקרא</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.clearAllBtn} onPress={handleClearAll}>
            <Ionicons name="archive-outline" size={15} color={Colors.textSecondary} />
            <Text style={s.clearAllTxt}>הסתר הכל</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 32 }}>
        {updates.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="shield-checkmark-outline" size={52} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>אין עדכוני כשרות</Text>
            <Text style={s.emptySub}>כל העדכונים הוסתרו</Text>
          </View>
        ) : (
          updates.map((u) => {
            const down  = u.direction === 'down';
            const read  = isRead(u.id);
            const accentColor = down ? Colors.danger : Colors.success;
            return (
              <View
                key={u.id}
                style={[
                  s.card,
                  down ? s.cardDown : s.cardUp,
                  !read && (down ? s.cardUnreadDown : s.cardUnreadUp),
                ]}
              >
                {/* ── Unread indicator dot (top-left, away from RTL content) ── */}
                {!read && (
                  <View style={[s.unreadDot, { backgroundColor: accentColor }]} />
                )}

                {/* ── Header row ── */}
                <View style={s.row}>
                  <Ionicons
                    name={down ? 'warning' : 'arrow-up-circle'}
                    size={20}
                    color={accentColor}
                  />
                  <Text style={[s.title, { color: accentColor }]}>
                    {formatTitle(u)}
                  </Text>
                </View>

                {/* ── Content ── */}
                <Text style={s.biz}>{u.businessName}</Text>
                <Text style={s.tags}>{formatDetail(u)}</Text>

                {u.note && (
                  <View style={s.noteRow}>
                    <Ionicons name="shield-checkmark-outline" size={13} color={Colors.success} />
                    <Text style={s.noteText}>{u.note}</Text>
                  </View>
                )}

                {/* ── Footer: timestamp + hide + read toggle ── */}
                <View style={s.footer}>
                  <Text style={s.time}>{formatWhen(u)}</Text>
                  <View style={{ flex: 1 }} />

                  {/* Hide button */}
                  <TouchableOpacity
                    style={s.hideBtn}
                    onPress={() => dismiss(u.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="archive-outline" size={13} color={Colors.textSecondary} />
                    <Text style={s.hideBtnTxt}>הסתר</Text>
                  </TouchableOpacity>

                  {/* Read / Unread toggle */}
                  {read ? (
                    <TouchableOpacity
                      style={s.readBtn}
                      onPress={() => markUnread(u.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="checkmark-circle" size={15} color={Colors.primary} />
                      <Text style={s.readBtnTxt}>קראתי · בטל</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={s.markReadBtn}
                      onPress={() => markRead(u.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipse-outline" size={15} color={Colors.primary} />
                      <Text style={s.markReadTxt}>קראתי</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  empty:     { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyTitle:{ fontSize: 17, fontWeight: '700', color: Colors.textSecondary },
  emptySub:  { fontSize: 13, color: Colors.textMuted },

  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + '12',
    borderWidth: 1.5, borderColor: Colors.primary + '40',
  },
  markAllTxt:  { fontSize: 12, fontWeight: '700', color: Colors.primary },
  clearAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clearAllTxt: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  // ── Card ────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRightWidth: 4,
    ...Shadow.card,
    position: 'relative',
  },
  cardDown: { borderRightColor: Colors.danger },
  cardUp:   { borderRightColor: Colors.success },

  // Unread state: colored border on top/bottom/left only, NO background tint.
  // We use individual side widths (not the borderWidth shorthand) to avoid
  // overriding the 4-px right border that comes from cardDown/cardUp.
  cardUnreadDown: {
    borderTopWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2,
    borderTopColor: Colors.danger + '90',
    borderBottomColor: Colors.danger + '90',
    borderLeftColor: Colors.danger + '90',
  },
  cardUnreadUp: {
    borderTopWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2,
    borderTopColor: Colors.success + '90',
    borderBottomColor: Colors.success + '90',
    borderLeftColor: Colors.success + '90',
  },

  // ── Unread dot ────────────────────────────────────────────────────────────────
  // Sits in the physical TOP-LEFT corner. In RTL layout all content flows
  // right→left so the physical left is always "empty" padding — no overlap.
  unreadDot: {
    position: 'absolute',
    top: 14, left: 14,
    width: 10, height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.cardBackground,
    zIndex: 1,
  },

  // ── Content ─────────────────────────────────────────────────────────────────
  row:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title:    { fontSize: 13, fontWeight: '800' },
  biz:      { fontSize: 17, fontWeight: '800', color: Colors.text, marginTop: 4 },
  tags:     { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  noteRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  noteText: { fontSize: 12, color: Colors.success, fontWeight: '600' },

  // ── Footer ──────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  time: { fontSize: 12, color: Colors.textMuted },

  hideBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hideBtnTxt: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },

  markReadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  markReadTxt: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  readBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  readBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.primary },
});
