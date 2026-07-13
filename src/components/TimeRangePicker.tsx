import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../utils/theme';
import { DrumWheel, DRUM_H, DRUM_ITEM_H } from './DrumWheel';

// ── Constants ─────────────────────────────────────────────────────────────────

const SEP     = '–';
const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

// ── Types ─────────────────────────────────────────────────────────────────────

type HM = { hours: number; minutes: number };
type RangeDraft = { start: HM; end: HM };

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHM(v: string): HM {
  const [h = '0', m = '0'] = (v ?? '').split(':');
  return {
    hours:   Math.max(0, Math.min(23, parseInt(h, 10) || 0)),
    minutes: Math.max(0, Math.min(59, parseInt(m, 10) || 0)),
  };
}

function hmStr({ hours: h, minutes: m }: HM) {
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function toMin({ hours: h, minutes: m }: HM) { return h * 60 + m; }

export function parseRanges(v: string): Array<{ start: string; end: string }> {
  if (!v) return [];
  return v.split(',').map(r => {
    const i = r.indexOf(SEP);
    return i < 0
      ? { start: r.trim(), end: '' }
      : { start: r.slice(0, i).trim(), end: r.slice(i + 1).trim() };
  }).filter(r => r.start || r.end);
}

function initDrafts(ranges: Array<{ start: string; end: string }>): RangeDraft[] {
  if (!ranges.length) return [{ start: { hours: 9, minutes: 0 }, end: { hours: 22, minutes: 0 } }];
  return ranges.map(r => ({
    start: r.start ? parseHM(r.start) : { hours: 9,  minutes: 0 },
    end:   r.end   ? parseHM(r.end)   : { hours: 22, minutes: 0 },
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface TimeRangePickerProps {
  value:      string;    // "HH:MM–HH:MM" | "HH:MM–HH:MM,HH:MM–HH:MM" | ""
  onChange:   (v: string) => void;
  style?:     object;
  labelFrom?: string;
  labelTo?:   string;
}

export default function TimeRangePicker({
  value, onChange, style,
  labelFrom = 'פתיחה',
  labelTo   = 'סגירה',
}: TimeRangePickerProps) {
  const [visible,  setVisible]  = useState(false);
  const [drafts,   setDrafts]   = useState<RangeDraft[]>([]);
  // modalKey increments on each open → forces DrumWheel remount → correct initialValue
  const [modalKey, setModalKey] = useState(0);

  const parsedRanges = parseRanges(value);
  const hasValue     = parsedRanges.length > 0;

  function handleOpen() {
    setDrafts(initDrafts(parsedRanges));
    setModalKey(k => k + 1);
    setVisible(true);
  }

  function updateDraft(rangeIdx: number, field: 'start' | 'end', hm: HM) {
    setDrafts(prev => prev.map((d, i) => i === rangeIdx ? { ...d, [field]: hm } : d));
  }

  function addRange() {
    setDrafts(prev => [
      ...prev,
      { start: { hours: 16, minutes: 0 }, end: { hours: 22, minutes: 0 } },
    ]);
  }

  function removeRange(rangeIdx: number) {
    setDrafts(prev => prev.filter((_, i) => i !== rangeIdx));
  }

  function handleConfirm() {
    for (let i = 0; i < drafts.length; i++) {
      if (toMin(drafts[i].start) >= toMin(drafts[i].end)) {
        Alert.alert('שגיאה', `בטווח ${i + 1}: שעת הפתיחה חייבת להיות לפני שעת הסגירה`);
        return;
      }
    }
    onChange(drafts.map(d => `${hmStr(d.start)}${SEP}${hmStr(d.end)}`).join(','));
    setVisible(false);
  }

  return (
    <>
      {/* ── Collapsed trigger ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[tr.btn, !hasValue && tr.btnEmpty, style]}
        onPress={handleOpen}
        activeOpacity={0.75}
      >
        <Ionicons name="time-outline" size={16} color={hasValue ? Colors.primary : Colors.textMuted} />
        {hasValue ? (
          <View style={{ flex: 1, gap: 2 }}>
            {parsedRanges.map((r, i) => (
              <Text key={i} style={tr.timeVal}>{r.start}–{r.end}</Text>
            ))}
          </View>
        ) : (
          <Text style={tr.placeholder}>--:-- – --:--</Text>
        )}
      </TouchableOpacity>

      {/* ── Modal bottom sheet ────────────────────────────────────────────── */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={tr.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setVisible(false)} />
          <View style={tr.sheet}>

            <Text style={tr.title}>שעות פעילות</Text>

            {drafts.map((draft, ri) => (
              <View key={ri}>
                {ri > 0 && (
                  <View style={tr.rangeHeader}>
                    <TouchableOpacity
                      onPress={() => removeRange(ri)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                    <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <Text style={tr.rangeHeaderTxt}>שעות פעילות נוספות</Text>
                  </View>
                )}

                {/*
                  RTL layout: flexDirection:'row' → first child = RIGHT physically.
                  JSX order: [סגירה (→ RIGHT), divider, פתיחה (→ LEFT)].
                  Inside each timeGroup: row-reverse = physical LTR → HH : MM.
                */}

                <View style={tr.labelsRow}>
                  <Text style={tr.colLabel}>{labelTo}</Text>
                  <View style={tr.labelDivSpacer} />
                  <Text style={tr.colLabel}>{labelFrom}</Text>
                </View>

                <View style={tr.pickersRow}>
                  {/* סגירה — RIGHT in RTL */}
                  <View style={tr.timeGroup}>
                    <View style={tr.lineTop} pointerEvents="none" />
                    <View style={tr.lineBot} pointerEvents="none" />
                    <DrumWheel
                      key={`eh-${ri}-${modalKey}`}
                      values={HOURS}
                      selected={draft.end.hours}
                      onChange={(v) => updateDraft(ri, 'end', { ...draft.end, hours: v })}
                    />
                    <Text style={tr.colon}>:</Text>
                    <DrumWheel
                      key={`em-${ri}-${modalKey}`}
                      values={MINUTES}
                      selected={draft.end.minutes}
                      onChange={(v) => updateDraft(ri, 'end', { ...draft.end, minutes: v })}
                    />
                  </View>

                  <View style={tr.colDivider} />

                  {/* פתיחה — LEFT in RTL */}
                  <View style={tr.timeGroup}>
                    <View style={tr.lineTop} pointerEvents="none" />
                    <View style={tr.lineBot} pointerEvents="none" />
                    <DrumWheel
                      key={`sh-${ri}-${modalKey}`}
                      values={HOURS}
                      selected={draft.start.hours}
                      onChange={(v) => updateDraft(ri, 'start', { ...draft.start, hours: v })}
                    />
                    <Text style={tr.colon}>:</Text>
                    <DrumWheel
                      key={`sm-${ri}-${modalKey}`}
                      values={MINUTES}
                      selected={draft.start.minutes}
                      onChange={(v) => updateDraft(ri, 'start', { ...draft.start, minutes: v })}
                    />
                  </View>
                </View>
              </View>
            ))}

            {drafts.length < 2 && (
              <TouchableOpacity style={tr.addBtn} onPress={addRange}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={tr.addBtnTxt}>הוסף שעות פעילות</Text>
              </TouchableOpacity>
            )}

            <View style={tr.actionRow}>
              <TouchableOpacity style={tr.cancelBtn} onPress={() => setVisible(false)}>
                <Text style={tr.cancelTxt}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity style={tr.confirmBtn} onPress={handleConfirm}>
                <Text style={tr.confirmTxt}>אישור</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const tr = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, flex: 1,
    borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.primary, backgroundColor: Colors.primary + '0D',
  },
  btnEmpty:    { borderColor: Colors.border, backgroundColor: Colors.background },
  timeVal:     { fontSize: 14, fontWeight: '700', color: Colors.primary, letterSpacing: 0.3 },
  placeholder: { fontSize: 14, color: Colors.textMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, paddingBottom: 36, gap: 10,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: 4 },

  rangeHeader: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingTop: 10, marginTop: 2,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  rangeHeaderTxt: { fontSize: 15, fontWeight: '700', color: Colors.primary, paddingLeft: 6 },

  labelsRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  colLabel:       { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  labelDivSpacer: { width: 21, height: 1 },

  pickersRow: { flexDirection: 'row', alignItems: 'center' },
  // row-reverse in RTL = physical LTR → HH : MM
  timeGroup: {
    flex: 1, height: DRUM_H,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  // Meckano-style separator lines spanning both drum columns
  lineTop: { position: 'absolute', left: 0, right: 0, top: DRUM_ITEM_H,     height: 1, backgroundColor: Colors.border, zIndex: 1 },
  lineBot: { position: 'absolute', left: 0, right: 0, top: DRUM_ITEM_H * 2, height: 1, backgroundColor: Colors.border, zIndex: 1 },
  colon:     { fontSize: 28, fontWeight: '700', color: Colors.text, marginHorizontal: 2, lineHeight: DRUM_H, textAlignVertical: 'center' },
  colDivider: { width: 1, height: DRUM_H, backgroundColor: Colors.border, marginHorizontal: 10 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: Colors.primary + '60', borderRadius: Radius.md,
  },
  addBtnTxt: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  cancelTxt:  { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmTxt: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
});
