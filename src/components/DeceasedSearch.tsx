import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, CardShell } from '../utils/theme';
import { searchDeceased, DeceasedRecord } from '../services/deceased';

/** How many matches are drawn. A search past this is asked to narrow. */
const SHOWN = 50;
const DEBOUNCE_MS = 400;

/** "1940-05-03" → "03.05.1940" */
const dmy = (iso?: string) => (iso ? iso.split('-').reverse().join('.') : '');

/**
 * Finding where someone is buried, in the cemeteries tab of a city whose
 * burial society publishes its register (City.deceasedSearch). Each result
 * gives cemetery, plot, row and grave, the date of death, and a way to the
 * right cemetery when the register names one we know.
 */
export default function DeceasedSearch({ cityId, onNavigate }: {
  cityId: string;
  /** A way to the grave's plot, or its cemetery; undefined when neither has
   *  a location. */
  onNavigate: (cemeteryId: string, plot: string) => { label: string; go: () => void } | undefined;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ results: DeceasedRecord[]; truncated: boolean } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = text.trim();
    if (q.replace(/\s/g, '').length < 2) { setFound(null); setBusy(false); return; }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      searchDeceased(cityId, q)
        .then((r) => { if (mine === seq.current) { setFound(r); setError(null); } })
        .catch(() => { if (mine === seq.current) setError('החיפוש נכשל. בדקו את החיבור ונסו שוב.'); })
        .finally(() => { if (mine === seq.current) setBusy(false); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, cityId]);

  const results = found?.results ?? [];

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="search-outline" size={18} color={Colors.cemetery} />
        <Text style={s.title}>איתור נפטרים</Text>
      </View>
      <Text style={s.hint}>שם פרטי ושם משפחה. לפי שם האב: משה בן אריה, שרה בת דוד</Text>

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="לדוגמה: כהן משה"
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
          autoCorrect={false}
          returnKeyType="search"
        />
        {busy ? (
          <ActivityIndicator size="small" color={Colors.cemetery} />
        ) : text.length > 0 ? (
          <TouchableOpacity onPress={() => setText('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {!!error && <Text style={s.empty}>{error}</Text>}
      {!error && found && results.length === 0 && !busy && (
        <Text style={s.empty}>לא נמצאו תוצאות. נסו כתיב אחר או פחות מילים.</Text>
      )}
      {!error && results.length > 0 && (
        <Text style={s.count}>
          {found!.truncated || results.length > SHOWN
            ? `מוצגות ${Math.min(results.length, SHOWN)} תוצאות ראשונות. הוסיפו שם פרטי, או בן/בת ושם האב, כדי לצמצם.`
            : `${results.length} תוצאות`}
        </Text>
      )}

      {results.slice(0, SHOWN).map((r) => {
        const nav = r.cemeteryId ? onNavigate(r.cemeteryId, r.plot) : undefined;
        const when = [r.deathDateHe, r.deathDate ? `(${dmy(r.deathDate)})` : r.deathDateRaw].filter(Boolean).join(' ');
        return (
          <View key={r.id} style={s.result}>
            <Text style={s.name}>
              {r.firstName} {r.lastName}
              {!!r.fatherName && <Text style={s.father}>{`  ·  שם האב: ${r.fatherName}`}</Text>}
            </Text>
            <Text style={s.place}>
              {[r.cemeteryName, r.plot && `חלקה ${r.plot}`, r.row && `שורה ${r.row}`, r.grave && `קבר ${r.grave}`]
                .filter(Boolean).join(' · ')}
            </Text>
            {!!when && <Text style={s.date}>נפטר/ה: {when}</Text>}
            {nav && (
              <TouchableOpacity style={s.navBtn} onPress={nav.go} activeOpacity={0.75}>
                <Ionicons name="navigate-outline" size={13} color={Colors.cemetery} />
                <Text style={s.navTxt}>{nav.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card:   { ...CardShell },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:  { fontSize: 16, fontWeight: '700', color: Colors.text },
  hint:   { fontSize: 12.5, color: Colors.textMuted, marginTop: 2, marginRight: 26 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.background,
  },
  input: { flex: 1, fontSize: 15, color: Colors.text, padding: 0 },

  count: { fontSize: 12, color: Colors.textMuted, marginTop: 10 },
  empty: { fontSize: 13, color: Colors.textMuted, marginTop: 12, textAlign: 'center' },

  result: { paddingVertical: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, marginTop: 8 },
  name:   { fontSize: 15, fontWeight: '700', color: Colors.text },
  father: { fontSize: 13, fontWeight: '400', color: Colors.textSecondary },
  place:  { fontSize: 13, color: Colors.textSecondary, marginTop: 3 },
  date:   { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 6, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.cemetery + '55',
  },
  navTxt: { fontSize: 12, fontWeight: '600', color: Colors.cemetery },
});
