import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { DayKey, HoursBlock, ZmanimAnchor } from '../types';
import { formatAnchorFormula } from '../utils/prayerUtils';
import TimePicker from './TimePicker';

const DAY_CHIPS: [DayKey, string][] = [
  ['sunday',    "א'"], ['monday',   "ב'"], ['tuesday',  "ג'"], ['wednesday', "ד'"],
  ['thursday',  "ה'"], ['friday',   "ו'"], ['saturday', "ש'"],
];

const ANCHOR_OPTIONS: { key: ZmanimAnchor; label: string }[] = [
  { key: 'netz',         label: 'הנץ החמה' },
  { key: 'shkia',        label: 'שקיעה' },
  { key: 'tzeit',        label: 'צאת הכוכבים' },
  { key: 'chatzot',      label: 'חצות היום' },
  { key: 'plagHamincha', label: 'פלג המנחה' },
  { key: 'minchaGedola', label: 'מנחה גדולה' },
  { key: 'minchaKetana', label: 'מנחה קטנה' },
];

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Formula text for a whole block's two boundaries, e.g. "שקיעה -30 – 22:00". */
function formatBlockFormula(block: HoursBlock): string {
  const start = block.startAnchor ? formatAnchorFormula(block.startAnchor, block.startOffsetMin ?? 0, block.startProportional) : block.start;
  const end   = block.endAnchor   ? formatAnchorFormula(block.endAnchor,   block.endOffsetMin ?? 0,   block.endProportional)   : block.end;
  return `${start}–${end}`;
}

// ─── One boundary (start or end): fixed clock time, or anchor + offset ───────
function BoundaryEditor({
  label, time, anchor, offsetMin, proportional, onSetFixed, onSetAnchor, onSetOffset, onSetProportional,
}: {
  label: string;
  time: string;
  anchor?: ZmanimAnchor;
  offsetMin?: number;
  proportional?: boolean;
  onSetFixed: (time: string) => void;
  onSetAnchor: (anchor: ZmanimAnchor) => void;
  onSetOffset: (offsetMin: number) => void;
  onSetProportional: (proportional: boolean) => void;
}) {
  const [anchorListOpen, setAnchorListOpen] = useState(false);
  const isAnchor = !!anchor;
  const anchorLabel = anchor ? (ANCHOR_OPTIONS.find((a) => a.key === anchor)?.label ?? anchor) : '';

  return (
    <View style={s.boundary}>
      <Text style={s.draftLabel}>{label}</Text>

      <View style={s.modeRow}>
        <TouchableOpacity
          style={[s.modeBtn, !isAnchor && s.modeBtnOn]}
          onPress={() => onSetFixed(time || '18:00')}
        >
          <Text style={[s.modeBtnTxt, !isAnchor && s.modeBtnTxtOn]}>שעה קבועה</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, isAnchor && s.modeBtnOn]}
          onPress={() => onSetAnchor(anchor ?? 'shkia')}
        >
          <Text style={[s.modeBtnTxt, isAnchor && s.modeBtnTxtOn]}>זמן יחסי</Text>
        </TouchableOpacity>
      </View>

      {!isAnchor ? (
        <TimePicker compact value={time} onChange={onSetFixed} />
      ) : (
        <View style={{ gap: 6 }}>
          <TouchableOpacity style={s.anchorDropBtn} onPress={() => setAnchorListOpen((v) => !v)}>
            <Text style={s.anchorDropTxt}>{anchorLabel}</Text>
            <Ionicons name={anchorListOpen ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textSecondary} />
          </TouchableOpacity>
          {anchorListOpen && (
            <View style={s.anchorDropList}>
              {ANCHOR_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.anchorDropItem, opt.key === anchor && s.anchorDropItemOn]}
                  onPress={() => { onSetAnchor(opt.key); setAnchorListOpen(false); }}
                >
                  <Text style={[s.anchorDropItemTxt, opt.key === anchor && s.anchorDropItemTxtOn]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.offsetRow}>
            <TouchableOpacity style={s.offsetBtn} onPress={() => onSetOffset((offsetMin ?? 0) - 5)} hitSlop={HIT_SLOP}>
              <Text style={s.offsetBtnTxt}>-5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.offsetBtn} onPress={() => onSetOffset((offsetMin ?? 0) - 1)} hitSlop={HIT_SLOP}>
              <Text style={s.offsetBtnTxt}>-1</Text>
            </TouchableOpacity>
            <Text style={s.offsetValue}>{(offsetMin ?? 0) > 0 ? `+${offsetMin}` : (offsetMin ?? 0)}</Text>
            <TouchableOpacity style={s.offsetBtn} onPress={() => onSetOffset((offsetMin ?? 0) + 1)} hitSlop={HIT_SLOP}>
              <Text style={s.offsetBtnTxt}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.offsetBtn} onPress={() => onSetOffset((offsetMin ?? 0) + 5)} hitSlop={HIT_SLOP}>
              <Text style={s.offsetBtnTxt}>+5</Text>
            </TouchableOpacity>
          </View>

          <View style={s.modeRow}>
            <TouchableOpacity style={[s.modeBtn, !proportional && s.modeBtnOn]} onPress={() => onSetProportional(false)}>
              <Text style={[s.modeBtnTxt, !proportional && s.modeBtnTxtOn]}>דקות שוות</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modeBtn, !!proportional && s.modeBtnOn]} onPress={() => onSetProportional(true)}>
              <Text style={[s.modeBtnTxt, !!proportional && s.modeBtnTxtOn]}>דקות זמניות</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export interface HoursScheduleEditorProps {
  value: HoursBlock[];
  onChange: (blocks: HoursBlock[]) => void;
}

// Flexible opening-hours editor: each block is a time range applied to
// whichever days the manager picks — not fixed day groups, since one mikveh
// might have Sunday open late and another might have Sunday closed. Each
// boundary (start/end) can independently be a fixed clock time or relative
// to a halachic anchor (e.g. "30 min before sunset"), mirroring the anchor
// model already used for synagogue prayer times.
export default function HoursScheduleEditor({ value, onChange }: HoursScheduleEditorProps) {
  const [draft, setDraft] = useState<HoursBlock | null>(null);

  function openNew() {
    setDraft({ id: makeId(), days: [], start: '18:00', end: '22:00' });
  }

  function toggleDay(day: DayKey) {
    if (!draft) return;
    setDraft({
      ...draft,
      days: draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day],
    });
  }

  function saveDraft() {
    if (!draft) return;
    if (draft.days.length === 0) { Alert.alert('שגיאה', 'יש לבחור לפחות יום אחד'); return; }
    // Can't compare unresolved anchor-relative times as strings — only
    // validate ordering when both boundaries are fixed clock times.
    if (!draft.startAnchor && !draft.endAnchor && draft.start >= draft.end) {
      Alert.alert('שגיאה', 'שעת הפתיחה חייבת להיות לפני שעת הסגירה'); return;
    }
    const exists = value.some((b) => b.id === draft.id);
    onChange(exists ? value.map((b) => (b.id === draft.id ? draft : b)) : [...value, draft]);
    setDraft(null);
  }

  function deleteBlock(id: string) {
    Alert.alert('מחיקת שעות פתיחה', 'למחוק את בלוק השעות הזה?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () => onChange(value.filter((b) => b.id !== id)) },
    ]);
  }

  return (
    <View>
      {value.length === 0 && !draft && (
        <Text style={s.emptyTxt}>לא הוגדרו שעות פתיחה</Text>
      )}

      {value.map((block) => (
        <View key={block.id} style={s.blockRow}>
          <View style={s.blockDays}>
            {DAY_CHIPS.map(([key, label]) => (
              <View key={key} style={[s.dayDot, block.days.includes(key) && s.dayDotOn]}>
                <Text style={[s.dayDotTxt, block.days.includes(key) && s.dayDotTxtOn]}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={s.blockHours}>{formatBlockFormula(block)}</Text>
          <TouchableOpacity onPress={() => setDraft({ ...block })} hitSlop={HIT_SLOP} style={s.blockBtn}>
            <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteBlock(block.id)} hitSlop={HIT_SLOP} style={s.blockBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      ))}

      {draft ? (
        <View style={s.draftCard}>
          <Text style={s.draftLabel}>ימים</Text>
          <View style={s.draftDaysRow}>
            {DAY_CHIPS.map(([key, label]) => {
              const active = draft.days.includes(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.dayChip, active && s.dayChipOn]}
                  onPress={() => toggleDay(key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.dayChipTxt, active && s.dayChipTxtOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <BoundaryEditor
            label="פתיחה"
            time={draft.start}
            anchor={draft.startAnchor}
            offsetMin={draft.startOffsetMin}
            proportional={draft.startProportional}
            onSetFixed={(t) => setDraft({ ...draft, start: t, startAnchor: undefined, startOffsetMin: undefined, startProportional: undefined })}
            onSetAnchor={(a) => setDraft({ ...draft, start: '', startAnchor: a, startOffsetMin: draft.startOffsetMin ?? 0 })}
            onSetOffset={(o) => setDraft({ ...draft, startOffsetMin: o })}
            onSetProportional={(p) => setDraft({ ...draft, startProportional: p })}
          />

          <BoundaryEditor
            label="סגירה"
            time={draft.end}
            anchor={draft.endAnchor}
            offsetMin={draft.endOffsetMin}
            proportional={draft.endProportional}
            onSetFixed={(t) => setDraft({ ...draft, end: t, endAnchor: undefined, endOffsetMin: undefined, endProportional: undefined })}
            onSetAnchor={(a) => setDraft({ ...draft, end: '', endAnchor: a, endOffsetMin: draft.endOffsetMin ?? 0 })}
            onSetOffset={(o) => setDraft({ ...draft, endOffsetMin: o })}
            onSetProportional={(p) => setDraft({ ...draft, endProportional: p })}
          />

          <View style={s.draftActions}>
            <TouchableOpacity style={s.draftCancelBtn} onPress={() => setDraft(null)}>
              <Text style={s.draftCancelTxt}>ביטול</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.draftSaveBtn} onPress={saveDraft}>
              <Text style={s.draftSaveTxt}>שמור</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.addBtn} onPress={openNew}>
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={s.addBtnTxt}>הוסף שעות פתיחה</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  emptyTxt: { fontSize: 13, color: Colors.textMuted, paddingVertical: 8, textAlign: 'center' },

  blockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  blockDays: { flexDirection: 'row', gap: 3 },
  dayDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  dayDotOn:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayDotTxt:   { fontSize: 9, fontWeight: '700', color: Colors.textMuted },
  dayDotTxtOn: { color: Colors.white },
  blockHours:  { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'left' },
  blockBtn:    { padding: 2 },

  draftCard: {
    backgroundColor: Colors.background, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.primary + '40',
    padding: Spacing.sm, marginVertical: 6, gap: 8,
  },
  draftLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  draftDaysRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayChip: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  dayChipOn:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayChipTxt:  { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  dayChipTxtOn:{ color: Colors.white },

  // ── Boundary (start/end) editor ──────────────────────────────────────────
  boundary: { gap: 4 },
  modeRow: { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primary, overflow: 'hidden' },
  modeBtn: { flex: 1, paddingVertical: 7, alignItems: 'center' },
  modeBtnOn: { backgroundColor: Colors.primary },
  modeBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  modeBtnTxtOn: { color: Colors.white },

  anchorDropBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.cardBackground, paddingHorizontal: 12, paddingVertical: 10,
  },
  anchorDropTxt: { fontSize: 13, fontWeight: '600', color: Colors.text },
  anchorDropList: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.cardBackground, overflow: 'hidden',
  },
  anchorDropItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  anchorDropItemOn: { backgroundColor: Colors.primary + '15' },
  anchorDropItemTxt: { fontSize: 13, color: Colors.text },
  anchorDropItemTxtOn: { fontWeight: '700', color: Colors.primary },

  offsetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  offsetBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  offsetBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  offsetValue: { fontSize: 15, fontWeight: '800', color: Colors.text, minWidth: 36, textAlign: 'center' },

  draftActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  draftCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  draftCancelTxt: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  draftSaveBtn:   { flex: 1, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  draftSaveTxt:   { fontSize: 13, fontWeight: '700', color: Colors.white },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginTop: 4,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: Colors.primary + '60', borderRadius: Radius.md,
  },
  addBtnTxt: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
