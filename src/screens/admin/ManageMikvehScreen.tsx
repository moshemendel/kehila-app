import React, { useState, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useMikvaot } from '../../hooks/useMikvaot';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';
import { updateMikveh, addMikveh, deleteMikveh } from '../../services/mikvaot';
import { Mikveh } from '../../types';
import { useNavigation } from '@react-navigation/native';
import LocationEditModal from '../../components/LocationEditModal';
import ImageGalleryEditor from '../../components/ImageGalleryEditor';
import AddItemModal from '../../components/AddItemModal';
import HoursScheduleEditor from '../../components/HoursScheduleEditor';

const TYPE_OPTIONS: { key: Mikveh['type']; label: string }[] = [
  { key: 'women', label: '👩 נשים' },
  { key: 'men',   label: '👨 גברים' },
  { key: 'both',  label: '♾ שניהם' },
];

// ─── Edit form ─────────────────────────────────────────────────────────────────
function EditForm({ mikveh, onBack }: { mikveh: Mikveh; onBack: () => void }) {
  const navigation = useNavigation<any>();
  const [form, setForm] = useState<Mikveh>({ ...mikveh });
  const [saving, setSaving] = useState(false);
  const [editingLoc, setEditingLoc] = useState(false);

  function set(key: keyof Mikveh, value: any) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateMikveh(form.id, form);
      Alert.alert('✓ נשמר', 'פרטי המקווה עודכנו', [{ text: 'אישור', onPress: onBack }]);
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
          <Text style={s.subHeaderName} numberOfLines={1}>{form.name}</Text>
        </View>

        <View style={s.content}>
          {/* ── Basic info ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>פרטים כלליים</Text>
            <View style={s.card}>
              {([['name','שם המקווה'],['address','כתובת'],['phone','טלפון'],['neighborhood','שכונה']] as [keyof Mikveh, string][]).map(([key, label]) => (
                <View key={key} style={s.fieldRow}>
                  <Text style={s.fieldLabel}>{label}</Text>
                  <TextInput scrollEnabled={false} style={s.fieldInput} value={(form[key] as string) ?? ''}
                    onChangeText={(v) => set(key, v)} textAlign="right" autoCapitalize="none" />
                </View>
              ))}
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>תיאור</Text>
                <TextInput scrollEnabled={false}
                  style={[s.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={form.description ?? ''}
                  onChangeText={(v) => set('description', v || undefined)}
                  textAlign="right"
                  multiline
                  placeholder="תיאור קצר על המקווה..."
                />
              </View>
            </View>
          </View>

          {/* ── Images ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>תמונות</Text>
            <View style={s.card}>
              {(() => {
                const allImages = [form.imageUrl, ...(form.images ?? [])].filter(Boolean) as string[];
                return (
                  <ImageGalleryEditor
                    images={allImages}
                    onChange={(imgs) => setForm((p) => ({ ...p, imageUrl: imgs[0] ?? undefined, images: imgs.slice(1) }))}
                    storagePath={`mikvaot/${form.id}/gallery`}
                    maxImages={3}
                  />
                );
              })()}
            </View>
          </View>

          {/* ── Type ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>סוג</Text>
            <View style={s.card}>
              <View style={s.typeRow}>
                {TYPE_OPTIONS.map(({ key, label }) => {
                  const active = form.type === key;
                  return (
                    <TouchableOpacity key={key} style={[s.typeChip, active && s.typeChipOn]} onPress={() => set('type', key)}>
                      <Text style={[s.typeChipTxt, active && s.typeChipTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── Opening hours ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>שעות פתיחה</Text>
            <View style={s.card}>
              <HoursScheduleEditor
                value={form.hoursSchedule ?? []}
                onChange={(v) => set('hoursSchedule', v)}
              />
            </View>
          </View>

          {/* ── Settings ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>הגדרות</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.toggleRow} onPress={() => set('requiresAppointment', !form.requiresAppointment)}>
                <Text style={s.toggleLabel}>נדרשת הזמנה מראש</Text>
                <View style={[s.toggle, form.requiresAppointment && s.toggleOn]}>
                  <View style={[s.toggleThumb, form.requiresAppointment && s.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              {form.requiresAppointment && (
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>טלפון הזמנות</Text>
                  <TextInput scrollEnabled={false} style={s.fieldInput} value={form.appointmentPhone ?? ''}
                    onChangeText={(v) => set('appointmentPhone', v)} textAlign="right" keyboardType="phone-pad" />
                </View>
              )}
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>הערות</Text>
                <TextInput scrollEnabled={false} style={[s.fieldInput, { minHeight: 50, textAlignVertical: 'top' }]}
                  value={form.notes ?? ''} onChangeText={(v) => set('notes', v || undefined)}
                  textAlign="right" multiline />
              </View>
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

          {/* ── Appointment management ── */}
          <TouchableOpacity
            style={s.apptMgmtBtn}
            onPress={() => navigation.navigate('ManageAppointments', { mikvehId: form.id, mikvehName: form.name })}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar-outline" size={20} color={Colors.mikveh} />
            <View style={{ flex: 1 }}>
              <Text style={s.apptMgmtTitle}>ניהול תורים</Text>
              <Text style={s.apptMgmtSub}>
                {form.appointmentConfig
                  ? `${form.appointmentConfig.slotDurationMin} דקות לתור · הגדרות פעילות`
                  : 'הגדר לוח זמנים ואפשר קביעת תורים אונליין'}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

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

// ─── List view ─────────────────────────────────────────────────────────────────
export default function ManageMikvehScreen() {
  const cityId = useCityId();
  const { appUser } = useAuth();
  const navigation = useNavigation<any>();
  const { mikvaot, loading } = useMikvaot(cityId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Mikveh | null>(null);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);

  const isAdmin = ['city_admin', 'super_admin', 'dev'].includes(appUser?.role ?? '');

  async function handleCreate(values: Record<string, string>) {
    setCreating(true);
    try {
      const base: Omit<Mikveh, 'id'> = {
        cityId,
        name: values.name.trim(),
        address: values.address.trim(),
        type: (values.type as Mikveh['type']) || 'women',
        hoursSchedule: [],
        requiresAppointment: false,
      };
      const id = await addMikveh(base);
      setAdding(false);
      setSelected({ id, ...base });
    } catch (e: any) {
      Alert.alert('שגיאה', e.message ?? 'לא ניתן ליצור מקווה');
    } finally {
      setCreating(false);
    }
  }

  function handleDeleteMikveh(m: Mikveh) {
    Alert.alert('מחיקת מקווה', `למחוק את "${m.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          try {
            await deleteMikveh(m.id);
          } catch (e: any) {
            Alert.alert('שגיאה', e.message);
          }
        },
      },
    ]);
  }

  const visible = mikvaot.filter((m) => !search || m.name.includes(search) || m.address.includes(search));

  useLayoutEffect(() => {
    if (!isAdmin) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setAdding((a) => !a)}
          style={{ marginRight: 4, padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={adding ? 'close' : 'add'} size={26} color={Colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isAdmin, adding]);

  if (selected) return <EditForm mikveh={selected} onBack={() => setSelected(null)} />;

  return (
    <View style={s.container}>
      {!adding && (
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput scrollEnabled={false} style={s.searchInput} placeholder="חפש מקווה..." value={search}
            onChangeText={setSearch} textAlign="right" />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {adding ? (
          <AddItemModal
            visible
            inline
            title="הוספת מקווה"
            accentColor={Colors.mikveh}
            submitting={creating}
            onClose={() => setAdding(false)}
            onSubmit={handleCreate}
            fields={[
              { key: 'name', label: 'שם המקווה', placeholder: 'לדוגמה: מקווה מרכזי', required: true },
              { key: 'address', label: 'כתובת', placeholder: 'רחוב ומספר', required: true },
              { key: 'type', label: 'סוג', type: 'select', required: true, options: [
                { value: 'women', label: '👩 נשים' },
                { value: 'men',   label: '👨 גברים' },
                { value: 'both',  label: '♾ שניהם' },
              ] },
            ]}
          />
        ) : loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} size="large" />
        ) : visible.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyTitle}>לא נמצאו מקוואות</Text>
          </View>
        ) : (
          <>
            <Text style={s.listCount}>{visible.length} מקוואות</Text>
            {visible.map((m) => (
              <TouchableOpacity key={m.id} style={s.listCard} onPress={() => setSelected(m)} activeOpacity={0.8}>
                <Text style={s.listCardEmoji}>💧</Text>
                <View style={s.listCardInfo}>
                  <Text style={s.listCardName}>{m.name}</Text>
                  <Text style={s.listCardSub}>{m.address}</Text>
                  {m.latitude && (
                    <View style={s.locPill}>
                      <Ionicons name="location" size={10} color={Colors.success} />
                      <Text style={s.locPillText}>מיקום מוצמד</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleDeleteMikveh(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
                <Ionicons name="chevron-back-outline" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.background },
  searchBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.cardBackground, margin: Spacing.md, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:  { flex: 1, fontSize: 15, color: Colors.text },
  listCount:    { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.sm },
  listCard:     { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, ...Shadow.card },
  listCardEmoji:{ fontSize: 26 },
  listCardInfo: { flex: 1 },
  listCardName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  listCardSub:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  locPill:      { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  locPillText:  { fontSize: 11, color: Colors.success, fontWeight: '600' },
  emptyState:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: Colors.textSecondary },
  // Edit form
  subHeader:    { backgroundColor: Colors.mikveh, flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtnText:  { color: Colors.white, fontSize: 14, fontWeight: '600' },
  subHeaderName:{ flex: 1, fontSize: 17, fontWeight: '800', color: Colors.white },
  content:      { padding: Spacing.md, gap: Spacing.lg },
  section:      { gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  card:         { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.card },
  fieldRow:     { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, gap: 8 },
  fieldLabel:   { fontSize: 12, color: Colors.textMuted, width: 80 },
  fieldInput:   { flex: 1, fontSize: 15, color: Colors.text },
  typeRow:      { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  typeChip:     { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  typeChipOn:   { backgroundColor: Colors.mikveh, borderColor: Colors.mikveh },
  typeChipTxt:  { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  typeChipTxtOn:{ color: Colors.white },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  toggleLabel:  { fontSize: 14, fontWeight: '600', color: Colors.text },
  toggle:       { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.border, justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn:     { backgroundColor: Colors.success },
  toggleThumb:  { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.white },
  toggleThumbOn:{ alignSelf: 'flex-end' },
  locBtn:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  locBtnTitle:  { fontSize: 14, fontWeight: '600', color: Colors.text },
  locBtnSub:    { fontSize: 11, color: Colors.textMuted },
  saveBtn:      { backgroundColor: Colors.mikveh, borderRadius: Radius.md, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText:  { fontSize: 16, fontWeight: '700', color: Colors.white },
  apptMgmtBtn:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.mikveh + '40', marginBottom: Spacing.sm },
  apptMgmtTitle:{ fontSize: 15, fontWeight: '700', color: Colors.mikveh },
  apptMgmtSub:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
