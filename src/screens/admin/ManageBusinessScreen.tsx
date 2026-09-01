import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useBusinessesFeed } from '../../context/BusinessesContext';
import { useAuth } from '../../context/AuthContext';
import { useCityId } from '../../hooks/useCityId';
import { updateBusiness, deleteBusiness } from '../../services/businesses';
import { Business } from '../../types';
import LocationEditModal from '../../components/LocationEditModal';
import ImageGalleryEditor from '../../components/ImageGalleryEditor';
import { managesContent } from '../../utils/roles';
import HoursScheduleEditor from '../../components/HoursScheduleEditor';
import { scheduleToOpeningHours } from '../../utils/appointmentSlots';


const CATEGORY_LABELS: Record<string, string> = {
  meat: '🥩 בשרי', dairy: '🧀 חלבי', pareve: '🌿 פרווה', cafe: '☕ קפה', bakery: '🥐 מאפייה',
};

// ─── Edit form ────────────────────────────────────────────────────────────────
function EditForm({ rest, onBack, canEditIdentity }: {
  rest: Business;
  onBack: () => void;
  /**
   * Name, address and pinned location are the fields a kashrut certificate is
   * issued against, so they belong to the authority that issued it — an owner
   * asks the kashrut manager to correct a misspelt name rather than moving the
   * certificate to another premises themselves. The rules enforce this; these
   * inputs go read-only to match, so nobody types into a field whose save will
   * bounce.
   */
  canEditIdentity: boolean;
}) {
  const [form,       setForm]       = useState<Business>({ ...rest });
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
      await updateBusiness(form.id, form);
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
      <View style={s.content}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>פרטים כלליים</Text>
          <View style={s.card}>
            {([['name','שם העסק'],['address','כתובת'],['phone','טלפון'],['website','אתר אינטרנט']] as [keyof Business, string][]).map(([key, label]) => {
              const locked = !canEditIdentity && (key === 'name' || key === 'address');
              return (
                <View key={key} style={s.fieldRow}>
                  <Text style={s.fieldLabel}>{label}</Text>
                  <TextInput scrollEnabled={false}
                    style={[s.fieldInput, locked && s.fieldInputLocked]}
                    value={(form[key] as string) ?? ''}
                    editable={!locked}
                    onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))}
                    textAlign="right" autoCapitalize="none" />
                </View>
              );
            })}
            {!canEditIdentity && (
              <Text style={s.identityNote}>
                שם וכתובת קשורים לתעודת הכשרות — לתיקון יש לפנות לאחראי הכשרות
              </Text>
            )}
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
          {/* The same day-set editor the mikvaot use: a shop open the same
              hours Sunday to Thursday says so once. openingHours is still
              written from it on save, so a client on an older bundle keeps
              showing something. */}
          <HoursScheduleEditor
            value={form.hoursSchedule ?? []}
            onChange={(v) => setForm((p) => ({
              ...p,
              hoursSchedule: v,
              openingHours: scheduleToOpeningHours(v),
            }))}
          />
        </View>

        {/* ── Location ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>מיקום</Text>
          <View style={s.card}>
            <TouchableOpacity style={[s.locBtn, !canEditIdentity && s.locBtnLocked]}
              disabled={!canEditIdentity} onPress={() => setEditingLoc(true)}>
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
export default function ManageBusinessScreen() {
  const navigation = useNavigation();
  const { appUser } = useAuth();
  const { businesses, loading } = useBusinessesFeed();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Business | null>(null);
  // Deep-link from a content report ("פתח לתיקון") — preselect the reported
  // item once the list has loaded so the manager lands straight on it.
  const route = useRoute<any>();
  const focusId = route.params?.focusId as string | undefined;
  // Arriving with a focusId means the list was never on screen — back should
  // return wherever the jump came from (the reports queue, or the listing's own
  // public page via its edit button), not drop the user into a list they never
  // saw. Any deep link into one entity gets this, which is what lets a manager
  // edit and check the result without walking the stack in both directions.
  const deepLinked = useRef(!!focusId);
  const onBackFromItem = () => {
    if (deepLinked.current) navigation.goBack();
    else setSelected(null);
  };

  // Native back (header button, hardware back, swipe gesture) should return to
  // the list first, not pop this whole screen off the stack — beforeRemove is
  // the single event React Navigation fires for all three of those triggers.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!selected || deepLinked.current) return;
      e.preventDefault();
      setSelected(null);
    });
  }, [navigation, selected]);

  // Reuses the native header (title + back button) to show which business is
  // open, instead of a second colored bar duplicating it below.
  useLayoutEffect(() => {
    navigation.setOptions({ title: selected ? selected.name : 'ניהול בתי עסק' });
  }, [navigation, selected]);

  const roles = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = managesContent(appUser);
  // Unlike ManageKosherScreen (city-wide kashrut cert review), this screen edits a
  // business's general info — here a kosher_manager is scoped to only the businesses
  // a city_admin explicitly granted them via managedRestaurantIds, same as business_manager.
  const cityId  = useCityId();
  const managed = appUser?.managedRestaurantIds ?? [];
  // Mirrors hasCityRole('kosher_manager', …) in firestore.rules: the authority
  // is pinned to the manager's home city, not their browsing preference.
  const isKosherManager = roles.includes('kosher_manager')
    && appUser?.homeCityId === cityId;

  const visible = businesses
    .filter((r) => isAdmin || managed.includes(r.id))
    .filter((r) => !search || r.name.includes(search) || r.address.includes(search));

  // Matched against `visible`, not the whole collection: `visible` is where this
  // screen encodes who may edit what, and a deep link that searched past it
  // would hand someone an editor the list would never have offered them. A
  // kosher_manager reached this screen that way and got owner-level access to
  // every business in the city.
  useEffect(() => {
    if (!focusId) return;
    const hit = visible.find((x: any) => x.id === focusId);
    if (hit) setSelected(hit);
  }, [focusId, visible]);

  function handleDeleteBusiness(rest: Business) {
    Alert.alert('מחיקת עסק', `למחוק את "${rest.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          try {
            await deleteBusiness(rest.id);
          } catch (e: any) {
            Alert.alert('שגיאה', e.message);
          }
        },
      },
    ]);
  }

  if (selected) {
    return <EditForm rest={selected} onBack={onBackFromItem}
             canEditIdentity={isAdmin || isKosherManager} />;
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
                <TouchableOpacity onPress={() => handleDeleteBusiness(rest)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
  content: { padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  card: { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.card },
  fieldRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.sm },
  fieldLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  fieldInput: { fontSize: 15, color: Colors.text, paddingVertical: 2 },
  fieldInputLocked: { color: Colors.textMuted },
  identityNote: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, paddingTop: Spacing.xs },
  alertInput: { backgroundColor: '#FEF5E7', borderRadius: Radius.sm, padding: Spacing.sm, marginTop: 4, borderWidth: 1, borderColor: Colors.warning, minHeight: 60, textAlignVertical: 'top' },
  hoursInput: { flex: 1, fontSize: 14, color: Colors.textSecondary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  saveBtn:     { backgroundColor: Colors.kosher, borderRadius: Radius.md, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  locBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  locBtnLocked: { opacity: 0.45 },
  locBtnTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  locBtnSub:   { fontSize: 11, color: Colors.textMuted },
});
