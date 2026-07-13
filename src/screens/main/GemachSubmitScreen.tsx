import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { useAuth } from '../../context/AuthContext';
import { useCityId } from '../../hooks/useCityId';
import { GemachCategory } from '../../types';
import type { City } from '../../types';
import TimeRangePicker from '../../components/TimeRangePicker';

const GEMACH_COLOR = '#B06B3A';

const CATEGORIES: { key: GemachCategory; label: string }[] = [
  { key: 'clothing',  label: 'ביגוד' },
  { key: 'baby',      label: 'תינוקות' },
  { key: 'medical',   label: 'ציוד רפואי' },
  { key: 'food',      label: 'מזון' },
  { key: 'books',     label: 'ספרים' },
  { key: 'wedding',   label: 'חתנות' },
  { key: 'household', label: 'ציוד בית' },
  { key: 'tools',     label: 'כלים' },
  { key: 'other',     label: 'אחר' },
];

export default function GemachSubmitScreen() {
  const navigation = useNavigation();
  const { top, bottom } = useSafeAreaInsets();
  const { appUser, firebaseUser } = useAuth();
  const cityId = useCityId();

  const [name,        setName]        = useState('');
  const [category,    setCategory]    = useState<GemachCategory>('clothing');
  const [contactName, setContactName] = useState('');
  const [phone,       setPhone]       = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [description, setDescription] = useState('');
  const [hours,       setHours]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);

  useEffect(() => {
    if (!cityId) return;
    getDoc(doc(db, 'cities', cityId)).then(snap => {
      const d = snap.data() as City | undefined;
      setNeighborhoods(d?.neighborhoods ?? []);
    });
  }, [cityId]);

  async function handleSubmit() {
    if (!cityId)             { Alert.alert('שגיאה', 'לא נמצאה עיר — נסה לבחור עיר בפרופיל'); return; }
    if (!name.trim())        { Alert.alert('שגיאה', 'יש להזין שם גמ"ח'); return; }
    if (!contactName.trim()) { Alert.alert('שגיאה', 'יש להזין שם איש קשר'); return; }
    if (!phone.trim())       { Alert.alert('שגיאה', 'יש להזין מספר טלפון'); return; }

    setSaving(true);
    try {
      await addDoc(collection(db, 'pending_gemachs'), {
        cityId,
        name:        name.trim(),
        category,
        contactName: contactName.trim(),
        phone:       phone.trim(),
        neighborhood: neighborhood.trim() || null,
        description: description.trim() || null,
        hours:       hours.trim() || null,
        submittedBy:     appUser?.uid ?? firebaseUser?.uid ?? null,
        submittedByName: appUser?.displayName ?? null,
        submittedAt: serverTimestamp(),
        status: 'pending',
      });
      Alert.alert(
        'תודה!',
        'הגמ"ח נשלח לאישור. לאחר בדיקה הוא יופיע ברשימה.',
        [{ text: 'סגור', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      const msg = err?.code === 'permission-denied'
        ? 'אין הרשאה לשלוח — ודא שהינך מחובר'
        : 'לא ניתן לשלוח. נסה שנית.';
      Alert.alert('שגיאה', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.root}>
      <LinearGradient
        colors={[Colors.primaryDark, GEMACH_COLOR]}
        style={[s.header, { paddingTop: top + 10 }]}
      >
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-forward" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>הוספת גמ"ח</Text>
          <Text style={s.headerSub}>הבקשה תשלח לאישור מנהל</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[s.form, { paddingBottom: bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Category picker */}
        <Text style={s.label}>קטגוריה</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryChips}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={[s.catChip, category === cat.key && s.catChipActive]}
              onPress={() => setCategory(cat.key)}
            >
              <Text style={[s.catChipTxt, category === cat.key && s.catChipTxtActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.label}>שם הגמ"ח <Text style={s.required}>*</Text></Text>
        <TextInput scrollEnabled={false}
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder='לדוגמה: גמ"ח בגדי ילדים'
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
        />

        <Text style={s.label}>שם איש קשר <Text style={s.required}>*</Text></Text>
        <TextInput scrollEnabled={false}
          style={s.input}
          value={contactName}
          onChangeText={setContactName}
          placeholder="שם מלא"
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
        />

        <Text style={s.label}>טלפון <Text style={s.required}>*</Text></Text>
        <TextInput scrollEnabled={false}
          style={s.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="050-0000000"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
          textAlign="right"
        />

        {neighborhoods.length > 0 && (
          <>
            <Text style={s.label}>שכונה</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryChips}>
              <TouchableOpacity
                style={[s.catChip, !neighborhood && s.catChipActive]}
                onPress={() => setNeighborhood('')}
              >
                <Text style={[s.catChipTxt, !neighborhood && s.catChipTxtActive]}>לא רלוונטי</Text>
              </TouchableOpacity>
              {neighborhoods.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.catChip, neighborhood === n && s.catChipActive]}
                  onPress={() => setNeighborhood(n)}
                >
                  <Text style={[s.catChipTxt, neighborhood === n && s.catChipTxtActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={s.label}>שעות פעילות</Text>
        <TimeRangePicker value={hours} onChange={setHours} />

        <Text style={s.label}>תיאור</Text>
        <TextInput scrollEnabled={false}
          style={[s.input, s.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder={'פרטים נוספים על הגמ"ח...'}
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlign="right"
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[s.submitBtn, saving && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={s.submitTxt}>שלח לאישור</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header:      { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.white },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  form:  { padding: Spacing.md, gap: 4 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 14, marginBottom: 6 },
  required: { color: Colors.danger },

  input: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: 15, color: Colors.text,
  },
  textarea: { height: 90, paddingTop: 12 },

  categoryChips: { gap: 8, paddingBottom: 4 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  catChipActive:   { backgroundColor: GEMACH_COLOR, borderColor: GEMACH_COLOR },
  catChipTxt:      { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  catChipTxtActive: { color: Colors.white, fontWeight: '700' },

  submitBtn: {
    marginTop: 24,
    backgroundColor: GEMACH_COLOR,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitTxt: { fontSize: 16, fontWeight: '800', color: Colors.white },
});
