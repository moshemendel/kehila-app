import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '../utils/theme';
import {
  ZMANIM_PRESETS, calcZmanim, minToStr,
  ZmanimSettings, ZmanimRule, RuleMethod, MisheyakirMethod, AlotMethod,
} from '../utils/zmanim';

/**
 * Edits one zmanim method: pick a ready-made one (חזון שמים, אור החיים, …), then
 * adjust any single definition — צאת הכוכבים in degrees, the city's Shabbat
 * exit, how many minutes before sunset the candles are lit.
 *
 * Used for a city's method and for a synagogue's. It edits a whole
 * ZmanimSettings and hands it back, so what is saved is exactly what
 * calcZmanim runs on; the preview underneath runs the same function on today's
 * date, so what a manager sees is what residents will.
 */

const METHOD_LABEL: Record<RuleMethod, string> = {
  fixed: 'קבועות', proportional: 'זמניות', degrees: 'מעלות', longer: 'הארוך (זמניות/קבועות)',
};
const UNIT: Record<RuleMethod, string> = {
  fixed: "דק' קבועות", proportional: "דק' זמניות", degrees: '° מתחת לאופק', longer: "דק' (הארוך מבין השניים)",
};
const MISHEYAKIR_LABEL: Record<MisheyakirMethod, string> = {
  third: 'שליש מעלות→נץ', degrees: 'מעלות', fixed: "דק' לפני הנץ", afterAlotProportional: "דק' זמניות אחרי עלות",
};
const ALL_METHODS: RuleMethod[] = ['fixed', 'proportional', 'degrees', 'longer'];

function Chips<T extends string>({ options, labels, value, onPick }: {
  options: readonly T[]; labels: Record<T, string>; value: T; onPick: (v: T) => void;
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => (
        <TouchableOpacity key={o} style={[s.chip, o === value && s.chipOn]} onPress={() => onPick(o)} activeOpacity={0.7}>
          <Text style={[s.chipTxt, o === value && s.chipTxtOn]}>{labels[o]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Keeps what is being typed ("16." on the way to "16.1") instead of snapping
// back to the last valid number on every keystroke.
function NumberField({ value, onCommit, suffix }: { value: number; onCommit: (n: number) => void; suffix: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <View style={s.numRow}>
      <TextInput
        style={s.numInput}
        keyboardType="decimal-pad"
        value={text ?? String(value)}
        onChangeText={(t) => {
          setText(t);
          const n = parseFloat(t.replace(',', '.'));
          if (Number.isFinite(n) && n >= 0) onCommit(n);
        }}
        onBlur={() => setText(null)}
      />
      <Text style={s.unit}>{suffix}</Text>
    </View>
  );
}

function RuleRow({ title, rule, onChange, methods = ALL_METHODS }: {
  title: string; rule: ZmanimRule; onChange: (r: ZmanimRule) => void; methods?: readonly RuleMethod[];
}) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>{title}</Text>
      <Chips options={methods} labels={METHOD_LABEL} value={rule.method} onPick={(method) => onChange({ ...rule, method })} />
      <NumberField value={rule.value} suffix={UNIT[rule.method]} onCommit={(value) => onChange({ ...rule, value })} />
    </View>
  );
}

/** A rule that may be left to a default ("same as צאת הכוכבים"). */
function OptionalRuleRow({ title, offLabel, rule, onChange }: {
  title: string; offLabel: string; rule: ZmanimRule | undefined; onChange: (r: ZmanimRule | undefined) => void;
}) {
  return (
    <View style={s.block}>
      <View style={s.optHead}>
        <Text style={s.blockTitle}>{title}</Text>
        <TouchableOpacity onPress={() => onChange(rule ? undefined : { method: 'degrees', value: 8.5 })} activeOpacity={0.7}>
          <Text style={s.link}>{rule ? offLabel : 'התאמה אישית'}</Text>
        </TouchableOpacity>
      </View>
      {rule
        ? <>
            <Chips options={ALL_METHODS} labels={METHOD_LABEL} value={rule.method} onPick={(method) => onChange({ ...rule, method })} />
            <NumberField value={rule.value} suffix={UNIT[rule.method]} onCommit={(value) => onChange({ ...rule, value })} />
          </>
        : <Text style={s.hint}>{offLabel}</Text>}
    </View>
  );
}

export default function ZmanimMethodEditor({ value, onChange, point }: {
  value: ZmanimSettings;
  onChange: (s: ZmanimSettings) => void;
  /** Where the preview is computed; omitted = no preview. */
  point?: { latitude: number; longitude: number; timezone: string } | null;
}) {
  // Any manual edit leaves the preset it started from, so the selected chip
  // does not claim a method that has been changed.
  const edit = (patch: Partial<ZmanimSettings>) => onChange({ ...value, ...patch, presetKey: 'custom' });

  const activeKey = value.presetKey ?? ZMANIM_PRESETS.find((p) => JSON.stringify(p.settings) === JSON.stringify(value))?.key;
  const preview = useMemo(
    () => (point ? calcZmanim(new Date(), point.latitude, point.longitude, value, point.timezone, 0, 0) : null),
    [point, value],
  );

  const mish = value.misheyakir ?? { method: 'third' as MisheyakirMethod, value: 0 };
  const defaultMgaAlot: ZmanimRule = { method: 'proportional', value: 72 };
  const defaultMgaTzet: ZmanimRule = { method: 'proportional', value: 13.5 };

  return (
    <View>
      <Text style={s.section}>שיטה מוכנה</Text>
      <View style={s.card}>
        {ZMANIM_PRESETS.map((p, i) => {
          const on = activeKey === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              style={[s.presetRow, i < ZMANIM_PRESETS.length - 1 && s.divider]}
              onPress={() => onChange(p.settings)}
              activeOpacity={0.7}
            >
              <View style={[s.radio, on && s.radioOn]}>{on && <View style={s.radioDot} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={[s.presetTitle, on && s.presetTitleOn]}>{p.label}<Text style={s.posek}> · {p.posek}</Text></Text>
                <Text style={s.hint}>{p.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {activeKey === 'custom' && (
          <View style={[s.presetRow, s.divider]}>
            <View style={[s.radio, s.radioOn]}><View style={s.radioDot} /></View>
            <Text style={s.presetTitleOn}>מותאם אישית</Text>
          </View>
        )}
      </View>

      <Text style={s.section}>עריכת הפרטים</Text>
      <View style={s.card}>
        <RuleRow
          title="עלות השחר"
          rule={{ method: value.alotMethod, value: value.alotValue }}
          methods={['fixed', 'proportional', 'degrees']}
          onChange={(r) => edit({ alotMethod: r.method as AlotMethod, alotValue: r.value })}
        />
        <View style={s.block}>
          <Text style={s.blockTitle}>זמן טלית ותפילין</Text>
          <Chips
            options={['third', 'degrees', 'fixed', 'afterAlotProportional'] as const}
            labels={MISHEYAKIR_LABEL}
            value={mish.method}
            onPick={(method) => edit({ misheyakir: { method, value: method === 'third' ? 0 : (mish.value || 11.5) } })}
          />
          {mish.method !== 'third' && (
            <NumberField
              value={mish.value}
              suffix={mish.method === 'degrees' ? '° מתחת לאופק' : mish.method === 'fixed' ? "דק' לפני הנץ" : "דק' זמניות אחרי עלות"}
              onCommit={(v) => edit({ misheyakir: { method: mish.method, value: v } })}
            />
          )}
        </View>
        <RuleRow
          title="מנחה גדולה (אחרי חצות)"
          rule={value.minchaGedola ?? { method: 'proportional', value: 30 }}
          methods={['fixed', 'proportional', 'longer']}
          onChange={(r) => edit({ minchaGedola: r })}
        />
        <RuleRow
          title="צאת הכוכבים"
          rule={{ method: value.tzetMethod, value: value.tzetMinutes }}
          onChange={(r) => edit({ tzetMethod: r.method, tzetMinutes: r.value })}
        />
        <OptionalRuleRow
          title="צאת השבת"
          offLabel="כמו צאת הכוכבים"
          rule={value.shabbatExit}
          onChange={(r) => edit({ shabbatExit: r })}
        />
        <RuleRow
          title="רבנו תם"
          rule={value.rabbenuTam ?? { method: 'proportional', value: 72 }}
          onChange={(r) => edit({ rabbenuTam: r })}
        />
        <View style={s.block}>
          <View style={s.optHead}>
            <Text style={s.blockTitle}>יום המג"א (לחישוב סוף זמן ק"ש ותפילה)</Text>
            <TouchableOpacity
              onPress={() => edit({ mgaDay: value.mgaDay ? undefined : { alot: defaultMgaAlot, tzet: defaultMgaTzet } })}
              activeOpacity={0.7}
            >
              <Text style={s.link}>{value.mgaDay ? 'ברירת מחדל' : 'התאמה אישית'}</Text>
            </TouchableOpacity>
          </View>
          {value.mgaDay ? (
            <>
              <Text style={s.hint}>תחילת היום (עלות)</Text>
              <Chips options={ALL_METHODS} labels={METHOD_LABEL} value={value.mgaDay.alot.method}
                onPick={(method) => edit({ mgaDay: { ...value.mgaDay!, alot: { ...value.mgaDay!.alot, method } } })} />
              <NumberField value={value.mgaDay.alot.value} suffix={UNIT[value.mgaDay.alot.method]}
                onCommit={(v) => edit({ mgaDay: { ...value.mgaDay!, alot: { ...value.mgaDay!.alot, value: v } } })} />
              <Text style={[s.hint, { marginTop: 8 }]}>סוף היום (צאת)</Text>
              <Chips options={ALL_METHODS} labels={METHOD_LABEL} value={value.mgaDay.tzet.method}
                onPick={(method) => edit({ mgaDay: { ...value.mgaDay!, tzet: { ...value.mgaDay!.tzet, method } } })} />
              <NumberField value={value.mgaDay.tzet.value} suffix={UNIT[value.mgaDay.tzet.method]}
                onCommit={(v) => edit({ mgaDay: { ...value.mgaDay!, tzet: { ...value.mgaDay!.tzet, value: v } } })} />
            </>
          ) : (
            <Text style={s.hint}>עלות 72 דק' זמניות עד צאת 13.5 דק' זמניות</Text>
          )}
        </View>
        <View style={[s.block, { borderBottomWidth: 0 }]}>
          <Text style={s.blockTitle}>הדלקת נרות</Text>
          <NumberField value={value.candleLightingMin ?? 20} suffix="דק' לפני השקיעה (מנהג העיר)"
            onCommit={(v) => edit({ candleLightingMin: v })} />
          <NumberField value={value.candleLightingAltMin ?? 40} suffix="דק' לפני השקיעה (לנוהגים להקדים)"
            onCommit={(v) => edit({ candleLightingAltMin: v })} />
        </View>
      </View>

      {preview && (
        <>
          <Text style={s.section}>תצוגה מקדימה להיום</Text>
          <View style={s.card}>
            {([
              ['עלות השחר', preview.alot], ['משיכיר', preview.misheyakir], ['הנץ החמה', preview.netz],
              ['סוף ק"ש (גר"א)', preview.sofZmanShma], ['סוף ק"ש (מג"א)', preview.sofZmanShmaMga],
              ['חצות', preview.chatzot], ['מנחה גדולה', preview.minchaGedola], ['שקיעה', preview.shkia],
              ['צאת הכוכבים', preview.tzetHakochavim], ['צאת השבת', preview.tzetShabbat],
              ['רבנו תם', preview.tzetRabbenuTam], ['הדלקת נרות', preview.candleLighting],
            ] as [string, number][]).map(([label, min], i, a) => (
              <View key={label} style={[s.prevRow, i < a.length - 1 && s.divider]}>
                <Text style={s.prevLabel}>{label}</Text>
                <Text style={s.prevTime}>{minToStr(min)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  presetTitle: { fontSize: 15, fontWeight: '500', color: Colors.textSecondary },
  presetTitleOn: { fontSize: 15, fontWeight: '700', color: Colors.text },
  posek: { fontSize: 13, fontWeight: '400', color: Colors.textMuted },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  block: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  blockTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  optHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  chipTxtOn: { color: Colors.white },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numInput: {
    minWidth: 70, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm ?? 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
    fontSize: 15, color: Colors.text, textAlign: 'center',
  },
  unit: { fontSize: 12, color: Colors.textMuted, flexShrink: 1 },
  prevRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 9 },
  prevLabel: { fontSize: 14, color: Colors.textSecondary },
  prevTime: { fontSize: 14, fontWeight: '700', color: Colors.text },
});
