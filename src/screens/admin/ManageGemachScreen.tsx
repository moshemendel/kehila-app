import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, getDocs, query, where,
  doc, deleteDoc, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';
import { Gemach, GemachCategory, PendingGemach } from '../../types';
import TimeRangePicker from '../../components/TimeRangePicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const GEMACH_COLOR = '#B06B3A';

const CATEGORIES: { key: GemachCategory; label: string; icon: string }[] = [
  { key: 'clothing',  label: 'ביגוד',       icon: 'shirt-outline' },
  { key: 'baby',      label: 'תינוקות',     icon: 'happy-outline' },
  { key: 'medical',   label: 'ציוד רפואי',  icon: 'medkit-outline' },
  { key: 'food',      label: 'מזון',         icon: 'nutrition-outline' },
  { key: 'books',     label: 'ספרים',        icon: 'book-outline' },
  { key: 'wedding',   label: 'חתנות',        icon: 'heart-outline' },
  { key: 'household', label: 'ציוד בית',     icon: 'home-outline' },
  { key: 'tools',     label: 'כלים',         icon: 'construct-outline' },
  { key: 'other',     label: 'אחר',          icon: 'apps-outline' },
];

const CATEGORY_LABEL: Record<GemachCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
) as Record<GemachCategory, string>;

const EMPTY_FORM = {
  name: '', category: 'clothing' as GemachCategory,
  contactName: '', phone: '', neighborhood: '', hours: '', description: '',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManageGemachScreen() {
  const cityId  = useCityId();
  const { appUser } = useAuth();
  const navigation = useNavigation();

  const [gemachs,  setGemachs]  = useState<Gemach[]>([]);
  const [pending,  setPending]  = useState<PendingGemach[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState<'gemachs' | 'pending'>('gemachs');

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!cityId) return;
    setLoading(true);
    try {
      const [gSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db, 'gemachs'), where('cityId', '==', cityId))),
        getDocs(query(
          collection(db, 'pending_gemachs'),
          where('cityId', '==', cityId),
          where('status', '==', 'pending'),
        )),
      ]);
      const sorted = gSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Gemach)
        .sort((a, b) => {
          const ta = (a as any).createdAt?.toMillis?.() ?? 0;
          const tb = (b as any).createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
      setGemachs(sorted);
      setPending(pSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PendingGemach));
    } catch (err) {
      console.error('ManageGemachScreen load error:', err);
    } finally {
      setLoading(false);
    }
  }, [cityId]);

  useEffect(() => { load(); }, [load]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setFormOpen(true);
  }

  function openEdit(g: Gemach) {
    setForm({
      name: g.name,
      category: g.category,
      contactName: g.contactName ?? '',
      phone: g.phone ?? '',
      neighborhood: g.neighborhood ?? '',
      hours: g.hours ?? '',
      description: g.description ?? '',
    });
    setEditId(g.id);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert('שדה חסר', 'נא להזין שם גמ"ח');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        hours: form.hours.trim() || null,
        description: form.description.trim() || null,
      };
      if (editId) {
        await updateDoc(doc(db, 'gemachs', editId), payload);
      } else {
        await addDoc(collection(db, 'gemachs'), {
          ...payload, cityId,
          isActive: true, createdAt: serverTimestamp(),
          createdBy: appUser?.uid ?? '',
        });
      }
      closeForm();
      await load();
      Alert.alert('✓', editId ? 'הגמ"ח עודכן' : 'הגמ"ח נוסף בהצלחה');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message ?? 'פעולה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(g: Gemach) {
    Alert.alert('מחיקת גמ"ח', `למחוק את "${g.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'gemachs', g.id)).catch((e) => Alert.alert('שגיאה', e.message));
          await load();
        },
      },
    ]);
  }

  async function handleToggleActive(g: Gemach) {
    await updateDoc(doc(db, 'gemachs', g.id), { isActive: !g.isActive }).catch((e) =>
      Alert.alert('שגיאה', e.message),
    );
    await load();
  }

  async function handleApprove(p: PendingGemach) {
    Alert.alert('אישור גמ"ח', `לאשר ולפרסם את "${p.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'אשר',
        onPress: async () => {
          try {
            await addDoc(collection(db, 'gemachs'), {
              cityId: p.cityId, name: p.name, category: p.category,
              contactName: p.contactName, phone: p.phone,
              neighborhood: p.neighborhood ?? null,
              description: p.description ?? null,
              hours: p.hours ?? null,
              isActive: true, createdAt: serverTimestamp(),
              // The original submitter owns the gemach once approved — not
              // whoever happened to click approve.
              createdBy: p.submittedBy ?? '',
            });
            await updateDoc(doc(db, 'pending_gemachs', p.id), { status: 'approved' });
            await load();
            Alert.alert('✓ אושר', 'הגמ"ח פורסם בהצלחה');
          } catch (e: any) {
            Alert.alert('שגיאה', e.message);
          }
        },
      },
    ]);
  }

  function handleReject(p: PendingGemach) {
    Alert.alert('דחיית גמ"ח', `לדחות את "${p.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'דחה',
        style: 'destructive',
        onPress: async () => {
          await updateDoc(doc(db, 'pending_gemachs', p.id), { status: 'rejected' }).catch((e) =>
            Alert.alert('שגיאה', e.message),
          );
          await load();
        },
      },
    ]);
  }

  // ── Nav header button ─────────────────────────────────────────────────────

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={formOpen ? closeForm : openAdd}
          style={{ marginRight: 4, padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={formOpen ? 'close' : 'add'} size={26} color={Colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, formOpen]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

        {/* ── Form ───────────────────────────────────────────────────────── */}
        {formOpen && (
          <View style={styles.formCard}>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>שם הגמ"ח *</Text>
              <TextInput scrollEnabled={false}
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setField('name', v)}
                placeholder='לדוגמה: גמ"ח בגדי ילדים'
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>קטגוריה</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                {CATEGORIES.map(({ key, label, icon }) => {
                  const active = form.category === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.catChip, active && styles.catChipActive]}
                      onPress={() => setField('category', key)}
                    >
                      <Ionicons name={icon as any} size={13} color={active ? Colors.white : GEMACH_COLOR} />
                      <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.rowTwo}>
              <View style={[styles.section, { flex: 1 }]}>
                <Text style={styles.sectionLabel}>שם איש קשר</Text>
                <TextInput scrollEnabled={false}
                  style={styles.input}
                  value={form.contactName}
                  onChangeText={(v) => setField('contactName', v)}
                  placeholder="שם מלא"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />
              </View>
              <View style={[styles.section, { flex: 1 }]}>
                <Text style={styles.sectionLabel}>טלפון</Text>
                <TextInput scrollEnabled={false}
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(v) => setField('phone', v)}
                  placeholder="050-0000000"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.rowTwo}>
              <View style={[styles.section, { flex: 1 }]}>
                <Text style={styles.sectionLabel}>שכונה</Text>
                <TextInput scrollEnabled={false}
                  style={styles.input}
                  value={form.neighborhood}
                  onChangeText={(v) => setField('neighborhood', v)}
                  placeholder="שם השכונה"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>שעות פעילות</Text>
              <TimeRangePicker
                value={form.hours}
                onChange={(v) => setField('hours', v)}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>תיאור</Text>
              <TextInput scrollEnabled={false}
                style={[styles.input, styles.inputMulti]}
                value={form.description}
                onChangeText={(v) => setField('description', v)}
                placeholder={'פרטים נוספים על הגמ"ח...'}
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
                multiline
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <>
                    <Ionicons name="checkmark-outline" size={20} color={Colors.white} />
                    <Text style={styles.saveBtnText}>{editId ? 'עדכן' : 'הוסף גמ"ח'}</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Tab switcher ────────────────────────────────────────────────── */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'gemachs' && styles.tabActive]}
            onPress={() => setActiveTab('gemachs')}
          >
            <Text style={[styles.tabText, activeTab === 'gemachs' && styles.tabTextActive]}>
              {loading ? 'גמ"חים' : `גמ"חים (${gemachs.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
              ממתינים לאישור
            </Text>
            {pending.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pending.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Gemachs list ────────────────────────────────────────────────── */}
        {activeTab === 'gemachs' && (
          <View style={styles.listSection}>
            {loading ? (
              <ActivityIndicator color={GEMACH_COLOR} style={{ marginTop: 20 }} />
            ) : gemachs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="gift-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>אין גמ"חים עדיין</Text>
              </View>
            ) : (
              gemachs.map((g) => (
                <View key={g.id} style={[styles.gemachCard, !g.isActive && styles.gemachCardInactive]}>
                  <View style={styles.gemachIconCircle}>
                    <Ionicons
                      name={(CATEGORIES.find((c) => c.key === g.category)?.icon ?? 'gift-outline') as any}
                      size={18}
                      color={g.isActive ? GEMACH_COLOR : Colors.textMuted}
                    />
                  </View>
                  <View style={styles.gemachInfo}>
                    <Text style={[styles.gemachName, !g.isActive && styles.gemachNameInactive]} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={styles.gemachMeta}>
                      {CATEGORY_LABEL[g.category]}
                      {g.neighborhood ? ` · ${g.neighborhood}` : ''}
                    </Text>
                    {g.phone ? <Text style={styles.gemachPhone}>{g.phone}</Text> : null}
                  </View>
                  <View style={styles.gemachActions}>
                    <Switch
                      value={g.isActive}
                      onValueChange={() => handleToggleActive(g)}
                      trackColor={{ true: GEMACH_COLOR }}
                      thumbColor={Colors.white}
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                    />
                    <TouchableOpacity onPress={() => openEdit(g)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(g)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── Pending queue ────────────────────────────────────────────────── */}
        {activeTab === 'pending' && (
          <View style={styles.listSection}>
            {loading ? (
              <ActivityIndicator color={GEMACH_COLOR} style={{ marginTop: 20 }} />
            ) : pending.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>אין בקשות ממתינות</Text>
              </View>
            ) : (
              pending.map((p) => (
                <View key={p.id} style={styles.pendingCard}>
                  <View style={styles.pendingTop}>
                    <View style={styles.gemachIconCircle}>
                      <Ionicons
                        name={(CATEGORIES.find((c) => c.key === p.category)?.icon ?? 'gift-outline') as any}
                        size={18}
                        color={GEMACH_COLOR}
                      />
                    </View>
                    <View style={styles.gemachInfo}>
                      <Text style={styles.gemachName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.gemachMeta}>
                        {CATEGORY_LABEL[p.category]}
                        {p.neighborhood ? ` · ${p.neighborhood}` : ''}
                      </Text>
                      <Text style={styles.gemachPhone}>{p.contactName} · {p.phone}</Text>
                      {p.submittedByName ? (
                        <Text style={styles.pendingBy}>הוגש ע"י: {p.submittedByName}</Text>
                      ) : null}
                      {p.description ? (
                        <Text style={styles.pendingDesc} numberOfLines={2}>{p.description}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.pendingActions}>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(p)}>
                      <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                      <Text style={styles.rejectBtnText}>דחה</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(p)}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
                      <Text style={styles.approveBtnText}>אשר ופרסם</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },



  formCard: {
    margin: Spacing.md,
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.card,
  },
  section: { marginBottom: Spacing.md },
  rowTwo: { flexDirection: 'row', gap: Spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 6 },

  input: {
    fontSize: 15, color: Colors.text,
    borderBottomWidth: 1.5, borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  inputMulti: {
    minHeight: 72, textAlignVertical: 'top',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.sm, padding: 10, borderBottomWidth: 1.5,
  },

  catRow: { gap: 8, paddingVertical: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  catChipActive: { backgroundColor: GEMACH_COLOR, borderColor: GEMACH_COLOR },
  catChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  catChipTextActive: { color: Colors.white },

  saveBtn: {
    backgroundColor: GEMACH_COLOR, borderRadius: Radius.md,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginTop: Spacing.sm,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },

  tabRow: {
    flexDirection: 'row', marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: 4, ...Shadow.card,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: Radius.sm - 2,
  },
  tabActive: { backgroundColor: GEMACH_COLOR },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },
  tabBadge: {
    backgroundColor: Colors.danger, borderRadius: Radius.full,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 11, color: Colors.white, fontWeight: '800' },

  listSection: { paddingHorizontal: Spacing.md },

  emptyBox: { alignItems: 'center', paddingTop: 40, gap: Spacing.sm },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },

  gemachCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.cardBackground, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderRightWidth: 4, borderRightColor: GEMACH_COLOR, ...Shadow.card,
  },
  gemachCardInactive: { borderRightColor: Colors.border, opacity: 0.7 },
  gemachIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: GEMACH_COLOR + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  gemachInfo: { flex: 1 },
  gemachName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  gemachNameInactive: { color: Colors.textMuted },
  gemachMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  gemachPhone: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  gemachActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  pendingCard: {
    backgroundColor: Colors.cardBackground, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderRightWidth: 4, borderRightColor: GEMACH_COLOR, ...Shadow.card,
  },
  pendingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  pendingBy: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  pendingDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  pendingActions: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm,
  },
  rejectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: Colors.danger, borderRadius: Radius.md,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: Colors.danger },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 10,
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
