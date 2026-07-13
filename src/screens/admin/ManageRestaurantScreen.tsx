import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useRestaurants } from '../../hooks/useRestaurants';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';
import { updateRestaurant, deleteRestaurant } from '../../services/restaurants';
import { Restaurant } from '../../types';
import LocationEditModal from '../../components/LocationEditModal';
import ImageGalleryEditor from '../../components/ImageGalleryEditor';
import TimeRangePicker from '../../components/TimeRangePicker';

const DAYS: [string, string][] = [
  ['sunday','ראשון'],['monday','שני'],['tuesday','שלישי'],
  ['wednesday','רביעי'],['thursday','חמישי'],['friday','שישי'],['saturday','שבת'],
];

const CATEGORY_LABELS: Record<string, string> = {
  meat: '🥩 בשרי', dairy: '🧀 חלבי', pareve: '🌿 פרווה', cafe: '☕ קפה', bakery: '🥐 מאפייה',
};

// ─── Edit form ────────────────────────────────────────────────────────────────
function EditForm({ rest, onBack }: { rest: Restaurant; onBack: () => void }) {
  const [form,       setForm]       = useState<Restaurant>({ ...rest });
  const [saving,     setSaving]     = useState(false);
  const [editingLoc, setEditingLoc] = useState(false);

  // Flat gallery = [imageUrl, ...images].  On change we split back.
  const allImages = [form.imageUrl, ...(form.images ?? [])].filter(Boolean) as string[];
  function handleImagesChange(imgs: string[]) {
    setForm((p) => ({ ...p, imageUrl: imgs[0] ?? undefined, images: imgs.slice(1) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateRestaurant(form.id, form);
      Alert.alert('✓ נשמר', 'פרטי העסק עודכנו', [{ text: 'אישור', onPress: onBack }]);
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.subHeader}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
          <Text style={s.backBtnText}>רשימה</Text>
        </TouchableOpacity>
        <View style={s.subHeaderInfo}>
          <Text style={s.subHeaderName}>{form.name}</Text>
          <Text style={s.subHeaderSub}>{CATEGORY_LABELS[form.category] ?? ''} · {form.address}</Text>
        </View>
      </View>

      <View style={s.content}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>פרטים כלליים</Text>
          <View style={s.card}>
            {([['name','שם העסק'],['address','כתובת'],['phone','טלפון'],['website','אתר אינטרנט']] as [keyof Restaurant, string][]).map(([key, label]) => (
              <View key={key} style={s.fieldRow}>
                <Text style={s.fieldLabel}>{label}</Text>
                <TextInput scrollEnabled={false} style={s.fieldInput} value={(form[key] as string) ?? ''}
                  onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))}
                  textAlign="right" autoCapitalize="none" />
              </View>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>התראה פעילה</Text>
          <View style={s.card}>
            <Text style={s.fieldLabel}>הודעה לציבור (השאר ריק לביטול)</Text>
            <TextInput scrollEnabled={false}
              style={[s.fieldInput, s.alertInput]}
              value={form.activeAlert ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, activeAlert: v || undefined }))}
              placeholder="לדוגמה: סגורים השבוע לצורך שיפוץ"
              textAlign="right" multiline
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>שעות פתיחה</Text>
          <View style={s.card}>
            {DAYS.map(([key, label]) => (
              <View key={key} style={s.hoursRow}>
                <Text style={s.dayLabel}>{label}</Text>
                <TimeRangePicker
                  value={(form.openingHours as any)[key] ?? ''}
                  onChange={(v) => setForm((p) => ({ ...p, openingHours: { ...p.openingHours, [key]: v } }))}
                />
              </View>
            ))}
          </View>
        </View>

        {/* ── Location ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>מיקום</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.locBtn} onPress={() => setEditingLoc(true)}>
              <Ionicons name={form.latitude ? 'location' : 'location-outline'} size={18} color={Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={s.locBtnTitle}>{form.latitude ? 'מיקום מוצמד' : 'הוסף מיקום מדויק'}</Text>
                {form.latitude
                  ? <Text style={s.locBtnSub}>{form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)}</Text>
                  : <Text style={s.locBtnSub}>לא הוגדר — ניווט לפי כתובת</Text>}
              </View>
              <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Images ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>תמונות</Text>
          <View style={s.card}>
            <ImageGalleryEditor
              images={allImages}
              onChange={handleImagesChange}
              storagePath={`businesses/${form.id}/gallery`}
              maxImages={3}
            />
          </View>
        </View>

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <><Ionicons name="save-outline" size={20} color={Colors.white} /><Text style={s.saveBtnText}>שמור שינויים</Text></>}
        </TouchableOpacity>
      </View>
    </ScrollView>

    <LocationEditModal
      visible={editingLoc}
      name={form.name}
      address={form.address}
      latitude={form.latitude}
      longitude={form.longitude}
      onSave={async (lat, lon) => setForm((p) => ({ ...p, latitude: lat, longitude: lon }))}
      onClear={async () => setForm((p) => ({ ...p, latitude: undefined, longitude: undefined }))}
      onClose={() => setEditingLoc(false)}
    />
    </KeyboardAvoidingView>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────
export default function ManageRestaurantScreen() {
  const cityId = useCityId();
  const { appUser } = useAuth();
  const { restaurants, loading } = useRestaurants(cityId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Restaurant | null>(null);

  const roles = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = roles.some((r) => ['city_admin', 'super_admin', 'dev'].includes(r));
  // Unlike ManageKosherScreen (city-wide kashrut cert review), this screen edits a
  // business's general info — here a kosher_manager is scoped to only the businesses
  // a city_admin explicitly granted them via managedRestaurantIds, same as business_manager.
  const managed = appUser?.managedRestaurantIds ?? [];

  const visible = restaurants
    .filter((r) => isAdmin || managed.includes(r.id))
    .filter((r) => !search || r.name.includes(search) || r.address.includes(search));

  function handleDeleteRestaurant(rest: Restaurant) {
    Alert.alert('מחיקת עסק', `למחוק את "${rest.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          try {
            await deleteRestaurant(rest.id);
          } catch (e: any) {
            Alert.alert('שגיאה', e.message);
          }
        },
      },
    ]);
  }

  if (selected) {
    return <EditForm rest={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <View style={s.container}>
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
        <TextInput scrollEnabled={false} style={s.searchInput} placeholder="חפש עסק..." value={search}
          onChangeText={setSearch} textAlign="right" />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} size="large" />
      ) : visible.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="restaurant-outline" size={56} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>
            {managed.length === 0 && !isAdmin ? 'אין עסקים מוקצים' : 'לא נמצאו תוצאות'}
          </Text>
          <Text style={s.emptySubtitle}>
            {managed.length === 0 && !isAdmin
              ? 'פנה למנהל המערכת כדי לקבל הרשאות ניהול'
              : 'נסה לשנות את החיפוש'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
          <Text style={s.listCount}>{visible.length} בתי עסק</Text>
          {visible.map((rest) => {
            const activeCert = rest.kosherCertificates?.find((c) => c.isActive);
            return (
              <TouchableOpacity key={rest.id} style={s.listCard} onPress={() => setSelected(rest)} activeOpacity={0.8}>
                <Text style={s.listCardEmoji}>{rest.category === 'meat' ? '🥩' : rest.category === 'dairy' ? '🧀' : rest.category === 'cafe' ? '☕' : '🍽️'}</Text>
                <View style={s.listCardLeft}>
                  <Text style={s.listCardName}>{rest.name}</Text>
                  <Text style={s.listCardSub}>{CATEGORY_LABELS[rest.category] ?? ''} · {rest.address}</Text>
                  {activeCert && <Text style={s.listCardCert}>✓ {activeCert.issuedBy}</Text>}
                  {rest.activeAlert && (
                    <View style={s.alertPill}>
                      <Ionicons name="warning" size={11} color={Colors.white} />
                      <Text style={s.alertPillText}>התראה פעילה</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleDeleteRestaurant(rest)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
                <Ionicons name="chevron-back-outline" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.cardBackground, margin: Spacing.md, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
  listCount: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.sm },
  listCard: { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, ...Shadow.card },
  listCardEmoji: { fontSize: 28 },
  listCardLeft: { flex: 1 },
  listCardName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  listCardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  listCardCert: { fontSize: 11, color: Colors.success, marginTop: 2 },
  alertPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  alertPillText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  // Edit form
  subHeader: { backgroundColor: Colors.kosher, flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  subHeaderInfo: { flex: 1 },
  subHeaderName: { fontSize: 17, fontWeight: '800', color: Colors.white },
  subHeaderSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  content: { padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  card: { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.card },
  fieldRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.sm },
  fieldLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  fieldInput: { fontSize: 15, color: Colors.text, paddingVertical: 2 },
  alertInput: { backgroundColor: '#FEF5E7', borderRadius: Radius.sm, padding: Spacing.sm, marginTop: 4, borderWidth: 1, borderColor: Colors.warning, minHeight: 60, textAlignVertical: 'top' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md },
  dayLabel: { fontSize: 14, fontWeight: '600', color: Colors.text, width: 50 },
  hoursInput: { flex: 1, fontSize: 14, color: Colors.textSecondary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  saveBtn:     { backgroundColor: Colors.kosher, borderRadius: Radius.md, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  locBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  locBtnTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  locBtnSub:   { fontSize: 11, color: Colors.textMuted },
});
