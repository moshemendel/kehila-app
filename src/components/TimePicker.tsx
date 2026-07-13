import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../utils/theme';
import { DrumWheel, DRUM_H, DRUM_ITEM_H } from './DrumWheel';

// ── Data ──────────────────────────────────────────────────────────────────────
const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseHM(v: string): { hours: number; minutes: number } {
  const [hStr = '0', mStr = '0'] = (v ?? '').split(':');
  return {
    hours:   Math.max(0, Math.min(23, parseInt(hStr,  10) || 0)),
    minutes: Math.max(0, Math.min(59, parseInt(mStr, 10) || 0)),
  };
}

function pad2(n: number) { return n.toString().padStart(2, '0'); }

// ── Component ─────────────────────────────────────────────────────────────────

export interface TimePickerProps {
  value:        string;
  onChange:     (time: string) => void;
  placeholder?: string;
  style?:       object;
  compact?:     boolean;
}

export default function TimePicker({
  value, onChange, placeholder = '--:--', style, compact = false,
}: TimePickerProps) {
  const [visible,  setVisible]  = useState(false);
  const [draft,    setDraft]    = useState({ hours: 0, minutes: 0 });
  const [modalKey, setModalKey] = useState(0);

  const hasValue = /^\d{1,2}:\d{2}$/.test(value ?? '');

  function handleOpen() {
    setDraft(parseHM(value));
    setModalKey(k => k + 1);
    setVisible(true);
  }

  function handleConfirm() {
    onChange(`${pad2(draft.hours)}:${pad2(draft.minutes)}`);
    setVisible(false);
  }

  return (
    <>
      {/* ── Collapsed trigger ──────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[tp.btn, compact && tp.btnCompact, !hasValue && tp.btnEmpty, style]}
        onPress={handleOpen}
        activeOpacity={0.75}
      >
        <Ionicons
          name="time-outline"
          size={compact ? 14 : 17}
          color={hasValue ? Colors.primary : Colors.textMuted}
        />
        <Text style={[tp.txt, compact && tp.txtCompact, !hasValue && tp.txtEmpty]}>
          {hasValue ? value : placeholder}
        </Text>
      </TouchableOpacity>

      {/* ── Modal bottom sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        {/*
          Overlay is a plain View — the transparent tap area is a separate
          TouchableOpacity so it never competes with the drum wheel's scroll.
        */}
        <View style={tp.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setVisible(false)} />
          <View style={tp.sheet}>

            <Text style={tp.title}>שעה</Text>

            <View style={tp.pickerWrap}>
              <View style={tp.lineTop} pointerEvents="none" />
              <View style={tp.lineBot} pointerEvents="none" />
              {/* row-reverse in RTL = physical LTR → HH : MM */}
              <View style={tp.drumsRow}>
                <DrumWheel
                  key={`h-${modalKey}`}
                  values={HOURS}
                  selected={draft.hours}
                  onChange={(h) => setDraft(p => ({ ...p, hours: h }))}
                />
                <Text style={tp.colon}>:</Text>
                <DrumWheel
                  key={`m-${modalKey}`}
                  values={MINUTES}
                  selected={draft.minutes}
                  onChange={(m) => setDraft(p => ({ ...p, minutes: m }))}
                />
              </View>
            </View>

            <View style={tp.actionRow}>
              <TouchableOpacity style={tp.cancelBtn} onPress={() => setVisible(false)}>
                <Text style={tp.cancelTxt}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity style={tp.confirmBtn} onPress={handleConfirm}>
                <Text style={tp.confirmTxt}>אישור</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const tp = StyleSheet.create({
  // Collapsed trigger
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.primary, backgroundColor: Colors.primary + '0D',
  },
  btnCompact: { paddingHorizontal: 10, paddingVertical: 8, gap: 5 },
  btnEmpty:   { borderColor: Colors.border, backgroundColor: Colors.background },
  txt:        { fontSize: 20, fontWeight: '700', color: Colors.primary, letterSpacing: 1 },
  txtCompact: { fontSize: 16 },
  txtEmpty:   { fontSize: 16, fontWeight: '400', color: Colors.textMuted, letterSpacing: 0 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, paddingBottom: 36, gap: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text, textAlign: 'center' },

  // Drum picker
  pickerWrap: { height: DRUM_H },
  lineTop: {
    position: 'absolute', left: 0, right: 0,
    top: DRUM_ITEM_H, height: 1,
    backgroundColor: Colors.border, zIndex: 1,
  },
  lineBot: {
    position: 'absolute', left: 0, right: 0,
    top: DRUM_ITEM_H * 2, height: 1,
    backgroundColor: Colors.border, zIndex: 1,
  },
  drumsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center', justifyContent: 'center',
    height: DRUM_H, gap: 4,
  },
  colon: { fontSize: 26, fontWeight: '700', color: Colors.text, lineHeight: DRUM_H },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  cancelTxt:  { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmTxt: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
});
