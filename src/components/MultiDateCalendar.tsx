import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { JewishCalendar, HebrewDateFormatter } from 'kosher-zmanim';
import { Colors, Spacing, Radius } from '../utils/theme';

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const GREG_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const hebFmt = new HebrewDateFormatter();
hebFmt.setHebrewFormat(true);

const p2 = (n: number) => String(n).padStart(2, '0');
/** Local "YYYY-MM-DD" — toISOString() would shift late-night dates a day back. */
const isoOf = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

type Mode = 'hebrew' | 'gregorian';

interface Props {
  /** Selected dates, "YYYY-MM-DD". */
  value: string[];
  onChange: (dates: string[]) => void;
  /** Dates before this are not selectable. Defaults to today. */
  minDate?: Date;
  color?: string;
  /** Which calendar to show first. Hebrew suits seasonal minyanim like selichot,
   *  where the season is defined by Hebrew months, not Gregorian ones. */
  initialMode?: Mode;
}

/** Civil date of the first day of the Hebrew month containing `d`. */
function hebrewMonthStart(d: Date): Date {
  const jc = new JewishCalendar(d);
  return startOfDay(addDays(d, -(jc.getJewishDayOfMonth() - 1)));
}

/** Days in the Hebrew month containing `d` — varies 29/30, and Adar I/II exist. */
function hebrewMonthLength(d: Date): number {
  return new JewishCalendar(d).getDaysInJewishMonth();
}

/**
 * Month grid with multi-select, in either the Hebrew or Gregorian calendar.
 *
 * Built rather than pulled in: the project has no calendar dependency, and a
 * native picker can't be used here — it opens its own window, which on Android
 * routinely fails to appear when mounted inside a modal (this lives inside the
 * slot editor sheet). A native picker also can't show Hebrew months at all.
 *
 * Paging follows the CHOSEN calendar: in Hebrew mode a page is one Hebrew month
 * (אלול, תשרי…), which is what a gabbai scheduling selichot is actually thinking
 * in. Selection is always stored as a civil "YYYY-MM-DD" either way.
 *
 * Laid out RTL — Sunday is the rightmost column, like a Hebrew wall calendar.
 * The app calls I18nManager.forceRTL(true), so plain `flexDirection: 'row'` is
 * ALREADY right-to-left here; using 'row-reverse' double-reverses it back to
 * left-to-right. The one exception is the month header, which needs
 * 'row-reverse' so the chevrons point the way they travel.
 */
export default function MultiDateCalendar({
  value, onChange, minDate, color = Colors.primary, initialMode = 'hebrew',
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const floor = minDate ? startOfDay(minDate) : today;

  const [mode, setMode] = useState<Mode>(initialMode);
  /** Any date inside the displayed month — the anchor we page from. */
  const [cursor, setCursor] = useState<Date>(today);

  const selected = useMemo(() => new Set(value), [value]);

  const { monthLabel, cells, canGoBack } = useMemo(() => {
    const first = mode === 'hebrew'
      ? hebrewMonthStart(cursor)
      : new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const length = mode === 'hebrew'
      ? hebrewMonthLength(cursor)
      : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    // Leading blanks so day 1 sits under its weekday column.
    const out: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let i = 0; i < length; i += 1) out.push(addDays(first, i));

    let label: string;
    if (mode === 'hebrew') {
      const jc = new JewishCalendar(first);
      label = `${hebFmt.formatMonth(jc)} ${hebFmt.formatHebrewNumber(jc.getJewishYear())}`;
    } else {
      label = `${GREG_MONTHS[first.getMonth()]} ${first.getFullYear()}`;
    }

    // The last day of the displayed month is still in the future → can page back
    // only if any part of the previous month is selectable.
    return { monthLabel: label, cells: out, canGoBack: first > floor };
  }, [cursor, mode, floor]);

  /** Page a whole month in the active calendar. */
  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      if (mode === 'hebrew') {
        const first = hebrewMonthStart(c);
        return delta > 0
          ? addDays(first, hebrewMonthLength(first) + 1)   // into the next month
          : addDays(first, -1);                            // last day of the previous
      }
      return new Date(c.getFullYear(), c.getMonth() + delta, 1);
    });
  };

  const toggle = (d: Date) => {
    const iso = isoOf(d);
    onChange(selected.has(iso) ? value.filter((v) => v !== iso) : [...value, iso].sort());
  };

  return (
    <View style={s.wrap}>
      {/* Calendar switcher */}
      <View style={s.modeRow}>
        {(['hebrew', 'gregorian'] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[s.modeBtn, mode === m && { backgroundColor: color }]}
            onPress={() => setMode(m)}
          >
            <Text style={[s.modeTxt, mode === m && s.modeTxtOn]}>
              {m === 'hebrew' ? 'עברי' : 'לועזי'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.header}>
        {/* RTL: "next" sits on the left, "previous" on the right */}
        <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.monthTxt}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={() => canGoBack && shiftMonth(-1)}
          disabled={!canGoBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={20} color={canGoBack ? Colors.text : Colors.border} />
        </TouchableOpacity>
      </View>

      <View style={s.weekRow}>
        {DAY_LETTERS.map((l) => <Text key={l} style={s.weekTxt}>{l}</Text>)}
      </View>

      <View style={s.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`blank-${i}`} style={s.cell} />;
          const iso = isoOf(d);
          const isSel = selected.has(iso);
          const disabled = d < floor;
          // One instance per cell — the sub-label needs it in both modes.
          const jc = new JewishCalendar(d);
          const hebDay = hebFmt.formatHebrewNumber(jc.getJewishDayOfMonth());
          return (
            <TouchableOpacity
              key={iso}
              style={[s.cell, isSel && { backgroundColor: color, borderColor: color }]}
              onPress={() => !disabled && toggle(d)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <Text style={[s.cellTxt, disabled && s.cellTxtDisabled, isSel && s.cellTxtSel]}>
                {mode === 'hebrew' ? hebDay : d.getDate()}
              </Text>
              {/* The other calendar's day, small — a gabbai told "Motzaei Shabbat
                  16/08" needs to find it without converting in his head. */}
              <Text style={[s.cellSub, disabled && s.cellTxtDisabled, isSel && s.cellTxtSel]}>
                {mode === 'hebrew' ? d.getDate() : hebDay}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {value.length > 0 && (
        <View style={s.summaryRow}>
          <Text style={s.summaryTxt}>{value.length === 1 ? 'נבחר תאריך אחד' : `נבחרו ${value.length} תאריכים`}</Text>
          <TouchableOpacity onPress={() => onChange([])}>
            <Text style={[s.clearTxt, { color }]}>נקה</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.sm, backgroundColor: Colors.background, marginTop: 6,
  },

  modeRow: {
    flexDirection: 'row', alignSelf: 'center',
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', marginBottom: 8,
  },
  modeBtn:   { paddingHorizontal: 18, paddingVertical: 5 },
  modeTxt:   { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  modeTxtOn: { color: Colors.white },

  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, paddingBottom: 8,
  },
  monthTxt: { fontSize: 15, fontWeight: '800', color: Colors.text },

  weekRow: { flexDirection: 'row', paddingBottom: 4 },
  weekTxt: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm, borderWidth: 1, borderColor: 'transparent',
  },
  cellTxt:         { fontSize: 14, fontWeight: '600', color: Colors.text },
  cellSub:         { fontSize: 9, color: Colors.textMuted, marginTop: 1 },
  cellTxtDisabled: { color: Colors.border },
  cellTxtSel:      { color: Colors.white, fontWeight: '800' },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 6, paddingTop: 8,
  },
  summaryTxt: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  clearTxt:   { fontSize: 12, fontWeight: '700' },
});
