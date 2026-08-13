import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { setReportStatus, fetchReportsFor } from '../../services/reports';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';
import { ContentReport, ReportEntityType, ReportReason } from '../../types';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

const REASON_LABELS: Record<ReportReason, string> = {
  wrong_hours:    'שעות לא נכונות',
  wrong_contact:  'טלפון / איש קשר',
  wrong_location: 'מיקום או כתובת',
  closed:         'המקום סגור / לא פעיל',
  wrong_details:  'פרטים אחרים שגויים',
  other:          'אחר',
};

const ENTITY_META: Record<ReportEntityType, { label: string; icon: string; color: string }> = {
  synagogue: { label: 'בית כנסת', icon: 'business-outline',   color: Colors.primary },
  business:  { label: 'בית עסק',  icon: 'restaurant-outline', color: Colors.kosher  },
  mikveh:    { label: 'מקווה',    icon: 'water-outline',      color: Colors.mikveh  },
  event:     { label: 'אירוע',    icon: 'calendar-outline',   color: Colors.events  },
  gemach:    { label: 'גמ"ח',     icon: 'gift-outline',       color: '#B06B3A'      },
};

function fmtDate(ts: any): string {
  const secs = ts?.seconds;
  if (!secs) return '';
  return new Date(secs * 1000).toLocaleDateString('he-IL');
}

/** Where "תקן" sends you, and how the target screen preselects the item. */
const FIX_ROUTE: Record<ReportEntityType, string> = {
  synagogue: 'ManageSynagogue',
  business:  'ManageBusiness',
  mikveh:    'ManageMikveh',
  event:     'ManageEvents',
  gemach:    'ManageGemach',
};

export default function ManageReportsScreen() {
  const cityId = useCityId();
  const { appUser } = useAuth();
  const navigation = useNavigation<any>();

  const [reports, setReports]   = useState<ContentReport[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [showHandled, setShowHandled] = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cityId) return;
    try {
      // Scoped by role — a manager may not read every report in the city, and
      // an unscoped query would fail outright rather than filter.
      setReports(await fetchReportsFor(cityId, appUser));
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message ?? 'לא ניתן לטעון דיווחים');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [cityId, appUser]);

  useEffect(() => { load(); }, [load]);

  async function handle(r: ContentReport, status: 'resolved' | 'dismissed') {
    if (!appUser?.uid) return;
    setBusyId(r.id);
    try {
      await setReportStatus(r.id, status, appUser.uid);
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message ?? 'לא ניתן לעדכן את הדיווח');
    } finally {
      setBusyId(null);
    }
  }

  const visible   = showHandled ? reports : reports.filter((r) => r.status === 'open');
  const openCount = reports.filter((r) => r.status === 'open').length;

  if (loading) {
    return <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 60 }} />;
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); load(); }} />
      }
    >
      <View style={s.headerRow}>
        <Text style={s.headerTxt}>
          {openCount > 0 ? `${openCount} דיווחים פתוחים` : 'אין דיווחים פתוחים'}
        </Text>
        <TouchableOpacity style={s.toggle} onPress={() => setShowHandled((v) => !v)}>
          <Ionicons
            name={showHandled ? 'checkbox' : 'square-outline'}
            size={18}
            color={Colors.primary}
          />
          <Text style={s.toggleTxt}>הצג גם שטופלו</Text>
        </TouchableOpacity>
      </View>

      {visible.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="checkmark-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={s.emptyTxt}>
            {showHandled ? 'אין דיווחים' : 'הכל טופל — אין דיווחים פתוחים'}
          </Text>
        </View>
      ) : (
        visible.map((r) => {
          const meta = ENTITY_META[r.entityType] ?? ENTITY_META.synagogue;
          const handled = r.status !== 'open';
          return (
            <View key={r.id} style={[s.card, handled && s.cardHandled]}>
              <View style={s.cardTop}>
                <View style={[s.badge, { backgroundColor: meta.color + '1A' }]}>
                  <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                  <Text style={[s.badgeTxt, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <Text style={s.date}>{fmtDate(r.createdAt)}</Text>
              </View>

              <Text style={s.entity}>{r.entityName}</Text>
              <Text style={s.reason}>{REASON_LABELS[r.reason] ?? r.reason}</Text>
              {!!r.details && <Text style={s.details}>{r.details}</Text>}
              <Text style={s.reporter}>דווח ע״י {r.userName || 'משתמש אנונימי'}</Text>

              <TouchableOpacity
                style={s.fixRow}
                onPress={() => navigation.navigate(FIX_ROUTE[r.entityType], { focusId: r.entityId })}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={14} color={meta.color} />
                <Text style={[s.fixTxt, { color: meta.color }]}>פתח לתיקון</Text>
              </TouchableOpacity>

              {handled ? (
                <Text style={[s.statusTag, r.status === 'resolved' ? s.statusOk : s.statusDismissed]}>
                  {r.status === 'resolved' ? 'טופל' : 'נדחה'}
                </Text>
              ) : (
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.actionBtn, s.resolveBtn]}
                    onPress={() => handle(r, 'resolved')}
                    disabled={busyId === r.id}
                  >
                    {busyId === r.id
                      ? <ActivityIndicator size="small" color={Colors.white} />
                      : <>
                          <Ionicons name="checkmark" size={15} color={Colors.white} />
                          <Text style={s.resolveTxt}>טופל</Text>
                        </>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, s.dismissBtn]}
                    onPress={() => handle(r, 'dismissed')}
                    disabled={busyId === r.id}
                  >
                    <Ionicons name="close" size={15} color={Colors.textSecondary} />
                    <Text style={s.dismissTxt}>דחה</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { padding: Spacing.md, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  headerTxt: { fontSize: 15, fontWeight: '700', color: Colors.text },
  toggle:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleTxt: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  empty:    { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, gap: 4,
    ...Shadow.card,
  },
  cardHandled: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  badgeTxt:{ fontSize: 11, fontWeight: '700' },
  date:    { fontSize: 11, color: Colors.textMuted },

  entity:  { fontSize: 15, fontWeight: '800', color: Colors.text, marginTop: 2 },
  reason:  { fontSize: 13, fontWeight: '600', color: Colors.danger },
  details: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  reporter:{ fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  fixRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  fixTxt:  { fontSize: 13, fontWeight: '700' },

  actions:    { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  actionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md },
  resolveBtn: { backgroundColor: Colors.success },
  resolveTxt: { fontSize: 14, fontWeight: '700', color: Colors.white },
  dismissBtn: { borderWidth: 1.5, borderColor: Colors.border },
  dismissTxt: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },

  statusTag:      { fontSize: 12, fontWeight: '700', marginTop: 6 },
  statusOk:       { color: Colors.success },
  statusDismissed:{ color: Colors.textMuted },
});
