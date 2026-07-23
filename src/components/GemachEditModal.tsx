import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Colors, Spacing, Radius } from '../utils/theme';
import { Gemach, GemachCategory } from '../types';
import TimeRangePicker from './TimeRangePicker';

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

interface Props {
  gemach: Gemach;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function GemachEditModal({ gemach, visible, onClose, onSaved, onDeleted }: Props) {
  const [name,         setName]         = useState(gemach.name);
  const [category,     setCategory]     = useState<GemachCategory>(gemach.category);
  const [contactName,  setContactName]  = useState(gemach.contactName ?? '');
  const [phone,        setPhone]        = useState(gemach.phone ?? '');
  const [neighborhood, setNeighborhood] = useState(gemach.neighborhood ?? '');
  const [hours,        setHours]        = useState(gemach.hours ?? '');
  const [description,  setDescription]  = useState(gemach.description ?? '');
  const [isActive,     setIsActive]     = useState(gemach.isActive);
  const [saving,       setSaving]       = useState(false);

  // Re-seed the form whenever a different gemach (or a fresh copy) is opened.
  useEffect(() => {
    if (!visible) return;
    setName(gemach.name);
    setCategory(gemach.category);
    setContactName(gemach.contactName ?? '');
    setPhone(gemach.phone ?? '');
    setNeighborhood(gemach.neighborhood ?? '');
    setHours(gemach.hours ?? '');
    setDescription(gemach.description ?? '');
    setIsActive(gemach.isActive);
  }, [visible, gemach]);

  async function handleSave() {
    if (!name.trim()) { Alert.alert('שגיאה', 'יש להזין שם גמ"ח'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'gemachs', gemach.id), {
        name: name.trim(),
        category,
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        neighborhood: neighborhood.trim() || null,
        hours: hours.trim() || null,
        description: description.trim() || null,
        isActive,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('שגיאה', e.message ?? 'לא ניתן לשמור');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert('מחיקת גמ"ח', `למחוק את "${gemach.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'gemachs', gemach.id));
            onDeleted();
            onClose();
          } catch (e: any) {
            Alert.alert('שגיאה', e.message ?? 'לא ניתן למחוק');
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>עריכת הגמ"ח שלי</Text>

          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>שם הגמ"ח *</Text>
            <TextInput scrollEnabled={false} style={s.input} value={name} onChangeText={setName}
              placeholderTextColor={Colors.textMuted} textAlign="right" />

            <Text style={s.label}>קטגוריה</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
              {CATEGORIES.map(({ key, label, icon }) => {
                const active = category === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[s.catChip, active && s.catChipActive]}
                    onPress={() => setCategory(key)}
                  >
                    <Ionicons name={icon as any} size={13} color={active ? Colors.white : GEMACH_COLOR} />
                    <Text style={[s.catChipTxt, active && s.catChipTxtActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={s.rowTwo}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>שם איש קשר</Text>
                <TextInput scrollEnabled={false} style={s.input} value={contactName} onChangeText={setContactName}
                  placeholderTextColor={Colors.textMuted} textAlign="right" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>טלפון</Text>
                <TextInput scrollEnabled={false} style={s.input} value={phone} onChangeText={setPhone}
                  placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="phone-pad" />
              </View>
            </View>

            <Text style={s.label}>שכונה</Text>
            <TextInput scrollEnabled={false} style={s.input} value={neighborhood} onChangeText={setNeighborhood}
              placeholderTextColor={Colors.textMuted} textAlign="right" />

            <Text style={s.label}>שעות פעילות</Text>
            <TimeRangePicker value={hours} onChange={setHours} />

            <Text style={s.label}>תיאור</Text>
            <TextInput scrollEnabled={false} style={[s.input, s.textarea]} value={description} onChangeText={setDescription}
              placeholderTextColor={Colors.textMuted} textAlign="right" multiline textAlignVertical="top" />

            <View style={s.activeRow}>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: GEMACH_COLOR }} thumbColor={Colors.white} />
              <Text style={s.activeLabel}>{isActive ? 'פעיל — מוצג ברשימה' : 'לא פעיל — מוסתר מהרשימה'}</Text>
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.saveBtnTxt}>שמור</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={s.deleteBtnTxt}>מחק גמ"ח</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', paddingTop: 10,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },

  form: { padding: Spacing.md, paddingTop: 4, gap: 4 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginTop: 12, marginBottom: 6 },

  input: {
    backgroundColor: Colors.background,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: 15, color: Colors.text,
  },
  textarea: { height: 80, paddingTop: 10 },

  rowTwo: { flexDirection: 'row', gap: Spacing.md },

  catRow: { gap: 8, paddingVertical: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  catChipActive: { backgroundColor: GEMACH_COLOR, borderColor: GEMACH_COLOR },
  catChipTxt: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  catChipTxtActive: { color: Colors.white },

  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  activeLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },

  saveBtn: {
    marginTop: 20, backgroundColor: GEMACH_COLOR, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnTxt: { fontSize: 16, fontWeight: '800', color: Colors.white },

  deleteBtn: {
    marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.danger,
  },
  deleteBtnTxt: { fontSize: 14, fontWeight: '700', color: Colors.danger },
});
