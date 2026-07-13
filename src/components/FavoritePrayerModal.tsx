import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TouchableWithoutFeedback, ScrollView, PanResponder, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../utils/theme';
import {
  FavoriteSetting, FavoriteCustom, PrayerType, SlotIndices,
} from '../context/FavoritesContext';

// ─── Public option types (built by parent screens) ────────────────────────────

export interface SlotOption {
  index: number;
  label: string;   // "HH:MM" or anchor formula
  notes?: string;
}

export interface ShiurOption {
  index:     number;  // position in the combined shiurim list
  title:     string;
  rabbi:     string;
  time:      string;
  daysLabel: string;
}

/** All options passed to the modal — renamed from SlotsPerPrayer */
export interface ModalOptions {
  shacharit: SlotOption[];
  mincha:    SlotOption[];
  maariv:    SlotOption[];
  shiurim:   ShiurOption[];
}

interface Props {
  visible:  boolean;
  synName:  string;
  current:  FavoriteSetting | null;
  options:  ModalOptions;
  onSave:   (setting: FavoriteSetting) => void;
  onRemove: () => void;
  onClose:  () => void;
}

// ─── Draft state ──────────────────────────────────────────────────────────────

type Mode = 'all' | 'custom';

interface PrayerDraft {
  on:    boolean;
  slots: number[];
}

interface Draft {
  mode:        Mode;
  allShiurim:  boolean;       // "כל האירועים" toggle
  shiurim:     number[];      // specific shiurim indices when allShiurim=false
  shacharit:   PrayerDraft;
  mincha:      PrayerDraft;
  maariv:      PrayerDraft;
}

const PRAYERS: { key: PrayerType; label: string; icon: string }[] = [
  { key: 'shacharit', label: 'שחרית', icon: 'sunny-outline' },
  { key: 'mincha',    label: 'מנחה',  icon: 'partly-sunny-outline' },
  { key: 'maariv',   label: 'ערבית', icon: 'moon-outline' },
];

function allSlotIndices(opts: SlotOption[]): number[] {
  return opts.map((o) => o.index);
}

function settingToDraft(setting: FavoriteSetting | null, options: ModalOptions): Draft {
  const allPrayer = (key: PrayerType): PrayerDraft => ({
    on:    true,
    slots: allSlotIndices(options[key]),
  });

  if (!setting || setting === 'all') {
    return {
      mode:       'all',
      allShiurim: true,
      shiurim:    options.shiurim.map((s) => s.index),
      shacharit:  allPrayer('shacharit'),
      mincha:     allPrayer('mincha'),
      maariv:     allPrayer('maariv'),
    };
  }

  const c = setting as FavoriteCustom;
  const toPrayerDraft = (key: PrayerType): PrayerDraft => {
    const indices = c[key];
    if (!indices || indices.length === 0) return { on: false, slots: [] };
    return { on: true, slots: indices };
  };

  const shiurSetting = c.shiurim;
  const allShiurim   = shiurSetting === 'all';
  const shiurim      = allShiurim
    ? options.shiurim.map((s) => s.index)
    : (Array.isArray(shiurSetting) ? shiurSetting : []);

  return {
    mode:      'custom',
    allShiurim,
    shiurim,
    shacharit:  toPrayerDraft('shacharit'),
    mincha:     toPrayerDraft('mincha'),
    maariv:     toPrayerDraft('maariv'),
  };
}

function draftToSetting(draft: Draft): FavoriteSetting {
  if (draft.mode === 'all') return 'all';

  const custom: FavoriteCustom = {};

  // Prayers
  for (const p of PRAYERS) {
    const d = draft[p.key];
    if (d.on && d.slots.length > 0) custom[p.key] = d.slots;
  }

  // Shiurim
  if (draft.allShiurim) {
    custom.shiurim = 'all';
  } else if (draft.shiurim.length > 0) {
    custom.shiurim = draft.shiurim;
  }

  return custom;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FavoritePrayerModal({
  visible, synName, current, options, onSave, onRemove, onClose,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => settingToDraft(null, options));

  // ── Swipe-to-close gesture ────────────────────────────────────────────────────
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 4,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: 700,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      setDraft(settingToDraft(current, options));
    }
  }, [visible]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function setMode(mode: Mode) {
    if (mode === 'all') {
      setDraft({
        mode,
        allShiurim: true,
        shiurim:    options.shiurim.map((s) => s.index),
        shacharit:  { on: true, slots: allSlotIndices(options.shacharit) },
        mincha:     { on: true, slots: allSlotIndices(options.mincha) },
        maariv:     { on: true, slots: allSlotIndices(options.maariv) },
      });
    } else {
      setDraft((d) => ({ ...d, mode }));
    }
  }

  function toggleAllShiurim(on: boolean) {
    setDraft((d) => ({
      ...d,
      allShiurim: on,
      shiurim: on ? options.shiurim.map((s) => s.index) : [],
    }));
  }

  function toggleShiur(idx: number) {
    setDraft((d) => {
      const prev = d.shiurim;
      const next = prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx];
      return { ...d, allShiurim: false, shiurim: next };
    });
  }

  function togglePrayer(p: PrayerType) {
    setDraft((d) => {
      const wasOn = d[p].on;
      return {
        ...d,
        [p]: { on: !wasOn, slots: !wasOn ? allSlotIndices(options[p]) : [] },
      };
    });
  }

  function toggleSlot(p: PrayerType, idx: number) {
    setDraft((d) => {
      const prev = d[p].slots;
      const next = prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx];
      return { ...d, [p]: { on: next.length > 0, slots: next } };
    });
  }

  const anySelected =
    draft.mode === 'all' ||
    draft.allShiurim ||
    draft.shiurim.length > 0 ||
    PRAYERS.some((p) => draft[p.key].on && draft[p.key].slots.length > 0);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={st.backdrop} />
      </TouchableWithoutFeedback>

      <View style={st.sheet} pointerEvents="box-none">
        <Animated.View style={[st.card, { transform: [{ translateY }] }]}>
          <View style={st.handleArea} {...panResponder.panHandlers}>
            <View style={st.handle} />
          </View>

          {/* Title */}
          <View style={st.titleRow}>
            <Ionicons name="star" size={20} color={Colors.goldBright} />
            <Text style={st.title} numberOfLines={2}>{synName}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

            {/* ── Mode: כל התפילות והפעילות ── */}
            <TouchableOpacity
              style={[st.modeRow, draft.mode === 'all' && st.modeRowActive]}
              onPress={() => setMode('all')}
              activeOpacity={0.8}
            >
              <RadioDot active={draft.mode === 'all'} />
              <View style={st.modeText}>
                <Text style={[st.modeTitle, draft.mode === 'all' && st.modeTitleActive]}>
                  כל התפילות והפעילות
                </Text>
                <Text style={st.modeDesc}>תזכורת לכל זמני התפילה והשיעורים</Text>
              </View>
            </TouchableOpacity>

            {/* ── Mode: בחירה מותאמת ── */}
            <TouchableOpacity
              style={[st.modeRow, draft.mode === 'custom' && st.modeRowActive]}
              onPress={() => setMode('custom')}
              activeOpacity={0.8}
            >
              <RadioDot active={draft.mode === 'custom'} />
              <View style={st.modeText}>
                <Text style={[st.modeTitle, draft.mode === 'custom' && st.modeTitleActive]}>
                  בחירה מותאמת אישית
                </Text>
                <Text style={st.modeDesc}>בחר שיעורים, תפילות וזמנים ספציפיים</Text>
              </View>
            </TouchableOpacity>

            {/* ── Custom selection ── */}
            {draft.mode === 'custom' && (
              <View style={st.customSection}>

                {/* ── כל האירועים (all shiurim shortcut) ── */}
                {options.shiurim.length > 0 && (
                  <TouchableOpacity
                    style={[st.allEventsRow, draft.allShiurim && st.allEventsRowOn]}
                    onPress={() => toggleAllShiurim(!draft.allShiurim)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={draft.allShiurim ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={draft.allShiurim ? Colors.white : Colors.textSecondary}
                    />
                    <Text style={[st.allEventsTxt, draft.allShiurim && st.allEventsTxtOn]}>
                      כל האירועים
                    </Text>
                    <Text style={[st.allEventsCount, draft.allShiurim && { color: 'rgba(255,255,255,0.75)' }]}>
                      {options.shiurim.length} שיעורים
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ── שיעורים (individual) — shown when not "all events" ── */}
                {options.shiurim.length > 0 && !draft.allShiurim && (
                  <ShiurBlock
                    shiurim={options.shiurim}
                    selected={draft.shiurim}
                    onToggle={toggleShiur}
                  />
                )}

                {/* ── Prayer blocks — only shown when the synagogue has defined times ── */}
                {PRAYERS.filter((p) => options[p.key].length > 0).map((p) => (
                  <PrayerBlock
                    key={p.key}
                    label={p.label}
                    icon={p.icon}
                    slots={options[p.key]}
                    draft={draft[p.key]}
                    onTogglePrayer={() => togglePrayer(p.key)}
                    onToggleSlot={(idx) => toggleSlot(p.key, idx)}
                  />
                ))}
              </View>
            )}

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Buttons */}
          <View style={st.btnRow}>
            {current !== null && (
              <TouchableOpacity style={st.removeBtn} onPress={onRemove}>
                <Ionicons name="star-outline" size={16} color={Colors.danger} />
                <Text style={st.removeBtnTxt}>הסר</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[st.saveBtn, !anySelected && st.saveBtnOff]}
              onPress={() => onSave(draftToSetting(draft))}
              disabled={!anySelected}
            >
              <Ionicons name="star" size={16} color={Colors.white} />
              <Text style={st.saveBtnTxt}>שמור</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RadioDot({ active }: { active: boolean }) {
  return (
    <View style={[st.radio, active && st.radioActive]}>
      {active && <View style={st.radioDot} />}
    </View>
  );
}

function ShiurBlock({
  shiurim, selected, onToggle,
}: { shiurim: ShiurOption[]; selected: number[]; onToggle: (i: number) => void }) {
  return (
    <View style={st.sectionBlock}>
      {/* Header */}
      <View style={st.sectionHeader}>
        <Ionicons name="book-outline" size={16} color={Colors.primary} />
        <Text style={st.sectionHeaderTxt}>שיעורים</Text>
      </View>
      {/* Shiur chips */}
      <View style={st.slotWrap}>
        {shiurim.map((sh) => {
          const on = selected.includes(sh.index);
          return (
            <TouchableOpacity
              key={sh.index}
              style={[st.shiurChip, on && st.shiurChipOn]}
              onPress={() => onToggle(sh.index)}
              activeOpacity={0.8}
            >
              <Text style={[st.shiurTitle, on && st.shiurTitleOn]} numberOfLines={1}>
                {sh.title}
              </Text>
              <Text style={[st.shiurMeta, on && st.shiurMetaOn]}>
                {sh.time} · {sh.daysLabel}
              </Text>
              {!!sh.rabbi && (
                <Text style={[st.shiurRabbi, on && st.shiurRabbiOn]} numberOfLines={1}>
                  {sh.rabbi}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function PrayerBlock({
  label, icon, slots, draft, onTogglePrayer, onToggleSlot,
}: {
  label:          string;
  icon:           string;
  slots:          SlotOption[];
  draft:          { on: boolean; slots: number[] };
  onTogglePrayer: () => void;
  onToggleSlot:   (idx: number) => void;
}) {
  return (
    <View style={st.prayerBlock}>
      <TouchableOpacity
        style={[st.prayerHeader, draft.on && st.prayerHeaderOn]}
        onPress={onTogglePrayer}
        activeOpacity={0.8}
      >
        <Ionicons
          name={(draft.on ? icon.replace('-outline', '') : icon) as any}
          size={18}
          color={draft.on ? Colors.white : Colors.textSecondary}
        />
        <Text style={[st.prayerLabel, draft.on && st.prayerLabelOn]}>{label}</Text>
        <Ionicons
          name={draft.on ? 'checkbox' : 'square-outline'}
          size={20}
          color={draft.on ? Colors.white : Colors.textMuted}
          style={{ marginRight: 'auto' }}
        />
      </TouchableOpacity>

      {draft.on && slots.length > 0 && (
        <View style={st.slotWrap}>
          <View style={st.slotRow}>
            {slots.map((opt) => {
              const active = draft.slots.includes(opt.index);
              return (
                <TouchableOpacity
                  key={opt.index}
                  style={[st.slotChip, active && st.slotChipOn]}
                  onPress={() => onToggleSlot(opt.index)}
                  activeOpacity={0.75}
                >
                  <Text style={[st.slotTime, active && st.slotTimeOn]}>{opt.label}</Text>
                  {!!opt.notes && (
                    <Text style={[st.slotNote, active && st.slotNoteOn]}>{opt.notes}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {draft.on && slots.length === 0 && (
        <View style={st.slotWrap}>
          <Text style={st.noSlotsTxt}>אין זמנים מוגדרים</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:    { flex: 1, justifyContent: 'flex-end' },
  card: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: 14,
    paddingBottom: 36,
    maxHeight: '92%',
    gap: 12,
  },
  handleArea: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12 },
  handle:     { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title:    { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.text },

  // Mode rows
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  modeRowActive:    { borderColor: Colors.gold, backgroundColor: Colors.gold + '18' },
  radio:            { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive:      { borderColor: Colors.gold },
  radioDot:         { width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.gold },
  modeText:         { flex: 1, gap: 2 },
  modeTitle:        { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  modeTitleActive:  { color: Colors.gold },
  modeDesc:         { fontSize: 12, color: Colors.textMuted },

  // Custom section
  customSection: { gap: 8, marginTop: 4 },

  // "כל האירועים" row
  allEventsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  allEventsRowOn:   { backgroundColor: Colors.events, borderColor: Colors.events },
  allEventsTxt:     { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  allEventsTxtOn:   { color: Colors.white },
  allEventsCount:   { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  // Shiur section
  sectionBlock:     { borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.border },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md, backgroundColor: Colors.background },
  sectionHeaderTxt: { fontSize: 15, fontWeight: '700', color: Colors.events },

  // Shiur chips
  shiurChip: {
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 2,
  },
  shiurChipOn:   { backgroundColor: Colors.events, borderColor: Colors.events },
  shiurTitle:    { fontSize: 13, fontWeight: '700', color: Colors.text },
  shiurTitleOn:  { color: Colors.white },
  shiurMeta:     { fontSize: 11, color: Colors.textSecondary },
  shiurMetaOn:   { color: 'rgba(255,255,255,0.8)' },
  shiurRabbi:    { fontSize: 11, color: Colors.textMuted },
  shiurRabbiOn:  { color: 'rgba(255,255,255,0.65)' },

  // Prayer block
  prayerBlock:       { borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.border },
  prayerHeader:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.md, paddingVertical: 12, backgroundColor: Colors.background },
  prayerHeaderOn:    { backgroundColor: Colors.primary },
  prayerLabel:       { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  prayerLabelOn:     { color: Colors.white },

  // Slot area (shared by shiurim and prayers)
  slotWrap: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.cardBackground, gap: 8 },
  slotRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: 'center' },
  slotChipOn:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  slotTime:     { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  slotTimeOn:   { color: Colors.white },
  slotNote:     { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  slotNoteOn:   { color: 'rgba(255,255,255,0.75)' },
  noSlotsTxt:   { fontSize: 12, color: Colors.textMuted },

  // Buttons
  btnRow:       { flexDirection: 'row', gap: 10 },
  saveBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14 },
  saveBtnOff:   { opacity: 0.4 },
  saveBtnTxt:   { fontSize: 15, fontWeight: '800', color: Colors.white },
  removeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: Colors.danger, borderRadius: Radius.md, paddingVertical: 14, paddingHorizontal: Spacing.md },
  removeBtnTxt: { fontSize: 14, fontWeight: '700', color: Colors.danger },
});
