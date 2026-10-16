import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '../../components/AppAlert';
import ZmanimMethodEditor from '../../components/ZmanimMethodEditor';
import { useAuth } from '../../context/AuthContext';
import { useCityId } from '../../hooks/useCityId';
import { useCity } from '../../hooks/useCity';
import { useAreas } from '../../hooks/useAreas';
import { updateCityZmanim } from '../../services/cities';
import { cityZmanimSettings, zmanimPoint } from '../../utils/zmanimProfile';
import { ZmanimSettings } from '../../utils/zmanim';
import { Colors, Spacing, Radius } from '../../utils/theme';

/**
 * The city manager's page for the zmanim the council publishes: which method the
 * city follows, and any detail of it (the city's Shabbat exit, candle-lighting
 * minhag, …). Residents see it until they pick their own; synagogues follow it
 * until their gabbai picks another.
 */
export default function ManageZmanimScreen() {
  const { bottom } = useSafeAreaInsets();
  const { appUser } = useAuth();
  const browsed = useCityId();
  // A city_admin's authority is their home city; the browsing city is only a
  // preference — same rule ManageCities and the console follow.
  const cityId = appUser?.homeCityId ?? browsed;
  const { city, loading, refetch } = useCity(cityId);
  const { areas } = useAreas(cityId);

  const [value, setValue] = useState<ZmanimSettings | null>(null);
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  // Seed once the city arrives; later edits are the manager's, not the cache's.
  useEffect(() => {
    if (city && value === null) {
      setValue(cityZmanimSettings(city));
      setNote(city.zmanimNote ?? '');
    }
  }, [city, value]);

  async function save() {
    if (!value) return;
    setSaving(true);
    try {
      await updateCityZmanim(cityId, value, note);
      await refetch();
      Alert.alert('נשמר', 'שיטת הזמנים של העיר עודכנה. תושבים יראו אותה בפתיחה הבאה של האפליקציה.');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message ?? 'לא ניתן לשמור');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !value) {
    return <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: bottom + 40 }}>
      <Text style={s.title}>{city?.name}</Text>
      <Text style={s.sub}>
        שיטת החישוב שמפרסמת העיר. תושבים רואים אותה כברירת מחדל, וזמני התפילה המעוגנים בבתי הכנסת
        ("חצי שעה לפני שקיעה") נמדדים לפיה, אלא אם הגבאי בחר שיטה אחרת לבית הכנסת שלו.
        שעות קבועות של המועצה הדתית אינן מושפעות.
      </Text>

      <ZmanimMethodEditor value={value} onChange={setValue} point={zmanimPoint(city, areas)} />

      <Text style={s.label}>הערה מתחת לזמנים (אופציונלי)</Text>
      <TextInput
        style={s.input}
        value={note}
        onChangeText={setNote}
        placeholder="למשל: מנהג העיר — צאת השבת 40 דקות אחרי שקיעה"
        placeholderTextColor={Colors.textMuted}
        multiline
      />

      <TouchableOpacity style={[s.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.8}>
        {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.saveTxt}>שמירה</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  title:  { fontSize: 20, fontWeight: '800', color: Colors.text },
  sub:    { fontSize: 13, color: Colors.textMuted, marginTop: 6, lineHeight: 19 },
  label:  { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  input:  {
    minHeight: 64, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.cardBackground, padding: Spacing.md, fontSize: 15, color: Colors.text, textAlign: 'right',
  },
  save:    { marginTop: 24, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  saveTxt: { color: Colors.white, fontSize: 16, fontWeight: '800' },
});
