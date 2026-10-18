import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../utils/theme';
import {
  ZMANIM_PRESETS, ZMANIM_CATALOG, PRESET_ABOUT, relevantKeys, calcZmanim, describeSettings, minToStr,
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
const MGA_END_KEYS = ['13.5', '18', '72', 'custom'] as const;
const MGA_END_LABEL: Record<(typeof MGA_END_KEYS)[number], string> = {
  '13.5': "הגאונים — 13.5 דק' זמניות", '18': "הגאונים — 18 דק' זמניות", '72': "רבנו תם — 72 דק' זמניות", custom: 'מותאם',
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

export default function ZmanimMethodEditor({ value, onChange, point, shown, onShownChange }: {
  value: ZmanimSettings;
  onChange: (s: ZmanimSettings) => void;
  /** Which zmanim residents see (a city's choice). Omitted = the preview just lists them, with no ticks. */
  shown?: Set<string>;
  onShownChange?: (s: Set<string>) => void;
  /** Where the preview is computed; omitted = no preview. */
  point?: { latitude: number; longitude: number; timezone: string } | null;
}) {
  // Any manual edit leaves the preset it started from, so the selected chip
  // does not claim a method that has been changed.
  const edit = (patch: Partial<ZmanimSettings>) =>
    onChange({ ...value, ...patch, presetKey: 'custom', basedOn: value.presetKey === 'custom' ? value.basedOn : value.presetKey });
  // Choosing a ready-made method also unticks the times it does not have (a GRA
  // calendar has no MGA shma), so what residents see matches what that method publishes.
  const pick = (settings: ZmanimSettings) => {
    onChange(settings);
    onShownChange?.(relevantKeys(settings));
  };

  const activeKey = value.presetKey ?? ZMANIM_PRESETS.find((p) => JSON.stringify(p.settings) === JSON.stringify(value))?.key;
  const preview = useMemo(
    () => (point ? calcZmanim(new Date(), point.latitude, point.longitude, value, point.timezone, 0, 0) : null),
    [point, value],
  );

  // Fine-tuning stays folded away until wanted (most managers only pick a
  // method), but opens by itself on a method that has already been edited.
  const [customOpen, setCustomOpen] = useState(activeKey === 'custom');
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const infoPreset = ZMANIM_PRESETS.find((p) => p.key === infoKey);
  const infoAbout = infoKey ? PRESET_ABOUT[infoKey] : undefined;

  const defaultMgaAlot: ZmanimRule = { method: 'proportional', value: 72 };
  const defaultMgaTzet: ZmanimRule = { method: 'proportional', value: 13.5 };
  // The MGA's day ends at tzeit — by the Geonim (13.5 or 18 zmaniyot minutes after
  // sunset) or by Rabbeinu Tam (72); anything else is the hand-built case.
  const mgaTzet = value.mgaDay?.tzet ?? defaultMgaTzet;
  const mgaChoice = mgaTzet.method === 'proportional' && [13.5, 18, 72].includes(mgaTzet.value) ? String(mgaTzet.value) as (typeof MGA_END_KEYS)[number] : 'custom';

  const mish = value.misheyakir ?? { method: 'third' as MisheyakirMethod, value: 0 };

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
              onPress={() => pick(p.settings)}
              activeOpacity={0.7}
            >
              <View style={[s.radio, on && s.radioOn]}>{on && <View style={s.radioDot} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={[s.presetTitle, on && s.presetTitleOn]}>{p.label}<Text style={s.posek}> · {p.posek}</Text></Text>
                <Text style={s.hint}>{p.description}</Text>
              </View>
              <TouchableOpacity onPress={() => setInfoKey(p.key)} hitSlop={10} accessibilityLabel={`הסבר על שיטת ${p.label}`}>
                <Ionicons name="information-circle-outline" size={22} color={Colors.primary} />
              </TouchableOpacity>
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

      <TouchableOpacity style={[s.card, s.customHead]} onPress={() => setCustomOpen((o) => !o)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={s.blockTitle}>התאמה אישית</Text>
          <Text style={s.hint}>לשנות הגדרה אחת בשיטה שנבחרה — צאת השבת, הדלקת נרות ועוד</Text>
        </View>
        <Ionicons name={customOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>
      {customOpen && <View style={[s.card, { marginTop: 8 }]}>
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
          <Text style={s.blockTitle}>יום המג"א (לחישוב סוף זמן ק"ש, תפילה ופלג)</Text>
          <Text style={s.hint}>סוף היום — צאת הכוכבים:</Text>
          <Chips
            options={MGA_END_KEYS}
            labels={MGA_END_LABEL}
            value={mgaChoice}
            onPick={(k) => k === 'custom'
              ? edit({ mgaDay: value.mgaDay ?? { alot: defaultMgaAlot, tzet: mgaTzet } })
              : edit({ mgaDay: { alot: value.mgaDay?.alot ?? defaultMgaAlot, tzet: { method: 'proportional', value: Number(k) } } })}
          />
          {!!value.mgaDay && mgaChoice === 'custom' && (
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
          )}
        </View>
        <View style={[s.block, { borderBottomWidth: 0 }]}>
          <Text style={s.blockTitle}>הדלקת נרות</Text>
          <NumberField value={value.candleLightingMin ?? 20} suffix="דק' לפני השקיעה (מנהג העיר)"
            onCommit={(v) => edit({ candleLightingMin: v })} />
          <NumberField value={value.candleLightingAltMin ?? 0} suffix="דק' לפני השקיעה — לנוהגים להקדים (0 = אין מנהג כזה בעיר)"
            onCommit={(v) => edit({ candleLightingAltMin: v })} />
        </View>
      </View>}

      <Modal visible={!!infoPreset} animationType="slide" transparent onRequestClose={() => setInfoKey(null)}>
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{infoPreset?.label} · {infoPreset?.posek}</Text>
              <TouchableOpacity onPress={() => setInfoKey(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: 14 }}>
              {!!infoAbout && <Text style={s.aboutTxt}>{infoAbout.about}</Text>}
              <Text style={s.blockTitle}>איך מחושב כל זמן</Text>
              <View style={s.card}>
                {infoPreset && describeSettings(infoPreset.settings).map((r, i, a) => (
                  <View key={r.label} style={[s.descRow, i < a.length - 1 && s.divider]}>
                    <Text style={s.descLabel}>{r.label}</Text>
                    <Text style={s.descText}>{r.text}</Text>
                  </View>
                ))}
              </View>
              {!!infoAbout?.source && (
                <Text style={s.hint}>
                  מקור:{' '}
                  {infoAbout.source.url
                    ? <Text style={{ color: Colors.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(infoAbout.source!.url!)}>{infoAbout.source.label}</Text>
                    : infoAbout.source.label}
                </Text>
              )}
              <TouchableOpacity
                style={s.pickBtn}
                onPress={() => { if (infoPreset) pick(infoPreset.settings); setInfoKey(null); }}
                activeOpacity={0.8}
              >
                <Text style={s.pickBtnTxt}>בחירת שיטה זו</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {preview && (
        <>
          <Text style={s.section}>תצוגה מקדימה להיום</Text>
          {!!shown && <Text style={[s.hint, { marginBottom: 8, paddingHorizontal: 4 }]}>סמנו את הזמנים שיוצגו לתושבים</Text>}
          <View style={s.card}>
            {ZMANIM_CATALOG.map((z, i, a) => {
              const on = !shown || shown.has(z.key);
              const toggle = () => {
                if (!shown) return;
                const n = new Set(shown);
                if (n.has(z.key)) n.delete(z.key); else n.add(z.key);
                onShownChange?.(n);
              };
              return (
                <TouchableOpacity
                  key={z.key}
                  style={[s.prevRow, i < a.length - 1 && s.divider, { alignItems: 'center', gap: 10 }]}
                  onPress={toggle}
                  disabled={!shown}
                  activeOpacity={0.6}
                >
                  {!!shown && <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? Colors.primary : Colors.textMuted} />}
                  <Text style={[s.prevLabel, { flex: 1 }, !on && { color: Colors.textMuted }]}>{z.label}</Text>
                  <Text style={[s.prevTime, !on && { color: Colors.textMuted, fontWeight: '400' }]}>{minToStr(preview[z.key] as number, false, z.key === 'candleLighting' ? 'down' : 'up')}</Text>
                </TouchableOpacity>
              );
            })}
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
  customHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingVertical: 12, marginTop: 20 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: Colors.background, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text },
  aboutTxt: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  descRow: { paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 2 },
  descLabel: { fontSize: 12, color: Colors.textMuted },
  descText: { fontSize: 14, color: Colors.text },
  pickBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  pickBtnTxt: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  prevRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 9 },
  prevLabel: { fontSize: 14, color: Colors.textSecondary },
  prevTime: { fontSize: 14, fontWeight: '700', color: Colors.text },
});
