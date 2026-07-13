import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useSynagogues } from '../../hooks/useSynagogues';
import { useNavigation } from '@react-navigation/native';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';
import { useNusachOptions } from '../../hooks/useNusachOptions';
import { updateSynagogue, addSynagogue, deleteSynagogue } from '../../services/synagogues';
import { submitPendingEvent } from '../../services/pendingEvents';
import { Synagogue, PrayerTimeSlot, ZmanimAnchor, Shiur, EventCategory, SynagogueAnnouncement } from '../../types';
import LocationEditModal from '../../components/LocationEditModal';
import AddItemModal from '../../components/AddItemModal';
import ImageGalleryEditor from '../../components/ImageGalleryEditor';
import TimePicker from '../../components/TimePicker';

// ─── Constants ────────────────────────────────────────────────────────────────

// Days א–ו only (Shabbat is a separate schedule, not a weekday slot)
const DAYS = [
  { num: 1, label: 'א' }, { num: 2, label: 'ב' }, { num: 3, label: 'ג' },
  { num: 4, label: 'ד' }, { num: 5, label: 'ה' }, { num: 6, label: 'ו' },
];
// Days א–ש — for shiurim which can be on Shabbat too
const DAYS_ALL = [
  { num: 1, label: 'א' }, { num: 2, label: 'ב' }, { num: 3, label: 'ג' },
  { num: 4, label: 'ד' }, { num: 5, label: 'ה' }, { num: 6, label: 'ו' }, { num: 7, label: 'ש' },
];

const PRAYER_TYPES = [
  { key: 'shacharit' as const, label: 'שחרית', color: Colors.shacharit },
  { key: 'mincha'    as const, label: 'מנחה',  color: Colors.primary },
  { key: 'maariv'   as const, label: 'ערבית',  color: Colors.maariv },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isValidTime(t: string): boolean {
  const [hPart = '', mPart = ''] = t.split(':');
  const h = parseInt(hPart, 10);
  const m = parseInt(mPart, 10);
  return !isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59 && mPart.length === 2;
}

type ShabbatKey = 'minchaFriday' | 'shacharit' | 'mincha' | 'maariv';
const SHABBAT_PRAYER_TYPES: { key: ShabbatKey; label: string; color: string }[] = [
  { key: 'minchaFriday', label: 'מנחה ע"ש', color: Colors.events },
  { key: 'shacharit',    label: 'שחרית',     color: Colors.shacharit },
  { key: 'mincha',       label: 'מנחה',      color: Colors.primary },
  { key: 'maariv',       label: 'ערבית',     color: Colors.maariv },
];

// ─── Relative time anchors ────────────────────────────────────────────────────
const ANCHOR_OPTIONS: { key: ZmanimAnchor; label: string }[] = [
  { key: 'netz',         label: 'הנץ' },
  { key: 'shkia',        label: 'שקיעה' },
  { key: 'chatzot',      label: 'חצות' },
  { key: 'plagHamincha', label: 'פלג המנחה' },
  { key: 'minchaGedola', label: 'מנחה גדולה' },
  { key: 'minchaKetana', label: 'מנחה קטנה' },
];

const ANCHOR_SHORT: Record<ZmanimAnchor, string> = {
  netz: 'הנץ', shkia: 'שקיעה', chatzot: 'חצות',
  plagHamincha: 'פלג', minchaGedola: 'מנחה גד׳', minchaKetana: 'מנחה קט׳',
};

function formatSlotLabel(slot: PrayerTimeSlot): string {
  if (!slot.anchor) return slot.time || '—';
  const anchor = ANCHOR_SHORT[slot.anchor] ?? slot.anchor;
  if (!slot.offsetMin || slot.offsetMin === 0) return anchor;
  const sign = slot.offsetMin > 0 ? '+' : '';
  const suffix = slot.proportional ? 'ז׳' : '׳';
  return `${anchor} ${sign}${slot.offsetMin}${suffix}`;
}

// ─── Slot edit bottom-sheet modal ────────────────────────────────────────────
const EMPTY_WEEKDAY_SLOT: PrayerTimeSlot = { time: '', days: [1, 2, 3, 4, 5, 6] };
const EMPTY_SHABBAT_SLOT: PrayerTimeSlot = { time: '' };

type PrayerKey = 'shacharit' | 'mincha' | 'maariv';

function SlotEditModal({ visible, slot, prayerType: initialType, showTypeSelector = false, typeOptions, hideDays = false, isNew, onSave, onDelete, onClose }: {
  visible: boolean;
  slot: PrayerTimeSlot;
  prayerType: string;
  showTypeSelector?: boolean;
  typeOptions?: { key: string; label: string; color: string }[];
  hideDays?: boolean;
  isNew: boolean;
  onSave: (s: PrayerTimeSlot, type: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft,             setDraft]             = useState<PrayerTimeSlot>(slot);
  const [draftType,         setDraftType]         = useState<string>(initialType);
  const [isRelative,        setIsRelative]        = useState<boolean>(!!slot.anchor);
  const [draftAnchor,       setDraftAnchor]       = useState<ZmanimAnchor | undefined>(slot.anchor);
  const [draftOffset,       setDraftOffset]       = useState<number>(slot.offsetMin ?? 0);
  const [draftProportional, setDraftProportional] = useState<boolean>(slot.proportional ?? false);
  const [anchorOpen,        setAnchorOpen]        = useState(false);
  const resolvedTypeOptions = typeOptions ?? PRAYER_TYPES;

  useEffect(() => {
    if (visible) {
      setDraft(slot);
      setDraftType(initialType);
      setIsRelative(!!slot.anchor);
      setDraftAnchor(slot.anchor);
      setDraftOffset(slot.offsetMin ?? 0);
      setDraftProportional(slot.proportional ?? false);
    }
  }, [visible]);

  function toggleDay(day: number) {
    const days = draft.days ?? [];
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
    setDraft({ ...draft, days: next });
  }

  function handleSave() {
    if (isRelative) {
      if (!draftAnchor) {
        Alert.alert('שגיאה', 'יש לבחור עוגן זמן');
        return;
      }
      onSave({ ...draft, time: '', anchor: draftAnchor, offsetMin: draftOffset, proportional: draftProportional || undefined }, draftType);
      onClose();
      return;
    }
    if (!isValidTime(draft.time)) {
      Alert.alert('שגיאה', 'יש להזין שעה תקינה (לדוגמה: 07:30)');
      return;
    }
    const [h, mPart] = draft.time.split(':');
    const normalized = `${h.padStart(2, '0')}:${mPart}`;
    onSave({ ...draft, time: normalized, anchor: undefined, offsetMin: undefined }, draftType);
    onClose();
  }

  function handleDelete() {
    Alert.alert('מחיקת זמן', 'למחוק זמן זה?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () => { onDelete(); onClose(); } },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sm.overlay}>
        <View style={sm.sheet}>
          {/* Header */}
          <View style={sm.header}>
            <Text style={sm.title}>{isNew ? 'הוסף זמן תפילה' : 'עריכת זמן'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Prayer type selector (add mode only) */}
          {showTypeSelector && (
            <>
              <Text style={sm.label}>סוג תפילה</Text>
              <View style={sm.typeRow}>
                {resolvedTypeOptions.map(({ key, label, color }) => {
                  const active = draftType === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[sm.typeChip, active && { borderColor: color, backgroundColor: color + '18' }]}
                      onPress={() => setDraftType(key)}
                    >
                      <Text style={[sm.typeChipTxt, active && { color }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Mode toggle — fixed vs relative */}
          <View style={sm.modeRow}>
            <TouchableOpacity
              style={[sm.modeBtn, !isRelative && sm.modeBtnActive]}
              onPress={() => setIsRelative(false)}
            >
              <Text style={[sm.modeBtnTxt, !isRelative && sm.modeBtnTxtActive]}>שעה קבועה</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sm.modeBtn, isRelative && sm.modeBtnActive]}
              onPress={() => setIsRelative(true)}
            >
              <Text style={[sm.modeBtnTxt, isRelative && sm.modeBtnTxtActive]}>זמן יחסי</Text>
            </TouchableOpacity>
          </View>

          {isRelative ? (
            <>
              {/* Anchor picker — dropdown */}
              <Text style={sm.label}>עוגן</Text>
              <TouchableOpacity
                style={sm.anchorDropBtn}
                onPress={() => setAnchorOpen(v => !v)}
                activeOpacity={0.8}
              >
                <Text style={draftAnchor ? sm.anchorDropTxt : sm.anchorDropPlaceholder}>
                  {draftAnchor ? ANCHOR_OPTIONS.find(a => a.key === draftAnchor)?.label ?? 'בחר עוגן' : 'בחר עוגן'}
                </Text>
                <Ionicons
                  name={anchorOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
              {anchorOpen && (
                <View style={sm.anchorDropList}>
                  {ANCHOR_OPTIONS.map(({ key, label }) => {
                    const active = draftAnchor === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[sm.anchorDropItem, active && sm.anchorDropItemActive]}
                        onPress={() => { setDraftAnchor(key); setAnchorOpen(false); }}
                      >
                        <Text style={[sm.anchorDropItemTxt, active && sm.anchorDropItemTxtActive]}>{label}</Text>
                        {active && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Offset stepper */}
              <Text style={sm.label}>הזזה (דקות)</Text>
              <View style={sm.offsetRow}>
                <TouchableOpacity
                  style={sm.stepBtn}
                  onPress={() => setDraftOffset((v) => v - 5)}
                >
                  <Ionicons name="remove" size={20} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={sm.stepBtn} onPress={() => setDraftOffset((v) => v - 1)}>
                  <Text style={sm.stepSmall}>-1</Text>
                </TouchableOpacity>
                <Text style={sm.offsetVal}>
                  {draftOffset > 0 ? `+${draftOffset}` : draftOffset}׳
                </Text>
                <TouchableOpacity style={sm.stepBtn} onPress={() => setDraftOffset((v) => v + 1)}>
                  <Text style={sm.stepSmall}>+1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sm.stepBtn}
                  onPress={() => setDraftOffset((v) => v + 5)}
                >
                  <Ionicons name="add" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>
              {/* Minute type toggle */}
              <Text style={[sm.label, { marginTop: 12 }]}>סוג דקות</Text>
              <View style={sm.modeRow}>
                <TouchableOpacity
                  style={[sm.modeBtn, !draftProportional && sm.modeBtnActive]}
                  onPress={() => setDraftProportional(false)}
                >
                  <Text style={[sm.modeBtnTxt, !draftProportional && sm.modeBtnTxtActive]}>דקות שוות</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sm.modeBtn, draftProportional && sm.modeBtnActive]}
                  onPress={() => setDraftProportional(true)}
                >
                  <Text style={[sm.modeBtnTxt, draftProportional && sm.modeBtnTxtActive]}>דקות זמניות</Text>
                </TouchableOpacity>
              </View>

              {draftAnchor && (
                <Text style={sm.relativePreview}>
                  {draftOffset === 0
                    ? `בזמן ${ANCHOR_OPTIONS.find((a) => a.key === draftAnchor)?.label}`
                    : `${Math.abs(draftOffset)} ${draftProportional ? 'דקות זמניות' : 'דקות'} ${draftOffset > 0 ? 'אחרי' : 'לפני'} ${ANCHOR_OPTIONS.find((a) => a.key === draftAnchor)?.label}`}
                </Text>
              )}
            </>
          ) : (
            <>
              {/* <Text style={sm.label}>שעה</Text> */}
              <TimePicker
                value={draft.time}
                onChange={(t) => setDraft({ ...draft, time: t })}
              />
            </>
          )}

          {/* Day chips — hidden for Shabbat slots */}
          {!hideDays && (
            <>
              <Text style={sm.label}>ימים</Text>
              <View style={sm.daysRow}>
                {DAYS.map(({ num, label }) => {
                  const active = (draft.days ?? []).includes(num);
                  return (
                    <TouchableOpacity key={num} style={[sm.dayChip, active && sm.dayChipOn]} onPress={() => toggleDay(num)}>
                      <Text style={[sm.dayChipTxt, active && sm.dayChipTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Note */}
          <Text style={sm.label}>הערה (אופציונלי)</Text>
          <TextInput scrollEnabled={false}
            style={sm.noteInput}
            value={draft.notes ?? ''}
            onChangeText={(v) => setDraft({ ...draft, notes: v || null })}
            placeholder="לדוגמה: רק בחורף, ללא מוסף..."
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Actions */}
          <View style={sm.actions}>
            {!isNew && (
              <TouchableOpacity style={sm.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                <Text style={sm.deleteTxt}>מחק</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={sm.cancelBtn} onPress={onClose}>
              <Text style={sm.cancelTxt}>ביטול</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sm.saveBtn} onPress={handleSave}>
              <Text style={sm.saveTxt}>שמור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Compact slot card ────────────────────────────────────────────────────────
function SlotCard({ slot, onPress }: { slot: PrayerTimeSlot; onPress: () => void }) {
  const days = slot.days ?? [];
  const daysLabel = days.length === 0 || days.length === 6
    ? 'א–ו'
    : days.map((d) => DAYS.find((day) => day.num === d)?.label ?? '').join(' ');

  return (
    <TouchableOpacity style={sm.slotCard} onPress={onPress} activeOpacity={0.75}>
      <Text style={[sm.slotCardTime, !!slot.anchor && sm.slotCardTimeRelative]}>
        {formatSlotLabel(slot)}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={sm.slotCardDays}>{daysLabel}</Text>
        {!!slot.notes && (
          <Text style={sm.slotCardNote} numberOfLines={1}>{slot.notes}</Text>
        )}
      </View>
      <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Shiur edit modal ─────────────────────────────────────────────────────────
function ShiurEditModal({ visible, shiur, isNew, onSave, onDelete, onClose }: {
  visible: boolean;
  shiur: Partial<Shiur>;
  isNew: boolean;
  onSave: (s: Shiur) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title,       setTitle]       = useState('');
  const [rabbi,       setRabbi]       = useState('');
  const [time,        setTime]        = useState('');
  const [days,        setDays]        = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [daily,       setDaily]       = useState(false);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(shiur.title ?? '');
    setRabbi(shiur.rabbi ?? '');
    setTime(shiur.time ?? '');
    const d = shiur.days;
    if (d === 'daily') { setDaily(true); setDays([1, 2, 3, 4, 5, 6, 7]); }
    else { setDaily(false); setDays(Array.isArray(d) ? d : [1, 2, 3, 4, 5, 6]); }
    setDescription(shiur.description ?? '');
  }, [visible]);

  function toggleDay(num: number) {
    setDays((prev) => prev.includes(num) ? prev.filter((d) => d !== num) : [...prev, num].sort((a, b) => a - b));
  }

  function handleSave() {
    if (!title.trim()) { Alert.alert('שגיאה', 'יש להזין שם שיעור'); return; }
    if (!rabbi.trim()) { Alert.alert('שגיאה', 'יש להזין שם מוסר השיעור'); return; }
    if (!isValidTime(time)) { Alert.alert('שגיאה', 'יש להזין שעה תקינה (לדוגמה: 20:00)'); return; }
    const [h, m] = time.split(':');
    onSave({
      id:          shiur.id ?? `sh_${Date.now()}`,
      title:       title.trim(),
      rabbi:       rabbi.trim(),
      time:        `${h.padStart(2, '0')}:${m.padStart(2, '0')}`,
      days:        daily ? 'daily' : days,
      description: description.trim() || undefined,
    });
    onClose();
  }

  function handleDelete() {
    Alert.alert('מחיקת שיעור', `למחוק את "${title}"?`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () => { onDelete(); onClose(); } },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sm.overlay}>
        <View style={sm.sheet}>
          {/* Header */}
          <View style={sm.header}>
            <Text style={sm.title}>{isNew ? 'הוסף שיעור' : 'עריכת שיעור'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={sm.label}>שם השיעור *</Text>
          <TextInput scrollEnabled={false}
            style={[sm.noteInput, { minHeight: undefined, paddingVertical: 10 }]}
            value={title} onChangeText={setTitle}
            placeholder="לדוגמה: גמרא מסכת ברכות"
            placeholderTextColor={Colors.textMuted} textAlign="right"
          />

          {/* Rabbi */}
          <Text style={sm.label}>מוסר השיעור *</Text>
          <TextInput scrollEnabled={false}
            style={[sm.noteInput, { minHeight: undefined, paddingVertical: 10 }]}
            value={rabbi} onChangeText={setRabbi}
            placeholder="שם הרב / המרצה"
            placeholderTextColor={Colors.textMuted} textAlign="right"
          />

          {/* Time */}
          <Text style={sm.label}>שעה</Text>
          <TimePicker value={time} onChange={setTime} />

          {/* Days */}
          <Text style={sm.label}>ימים</Text>
          <TouchableOpacity
            style={[sm.typeChip, { alignSelf: 'flex-start', paddingHorizontal: 16 },
              daily && { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' }]}
            onPress={() => setDaily((v) => !v)}
          >
            <Text style={[sm.typeChipTxt, daily && { color: Colors.primary }]}>יומי (כל יום)</Text>
          </TouchableOpacity>
          {!daily && (
            <View style={sm.daysRow}>
              {DAYS_ALL.map(({ num, label }) => {
                const active = days.includes(num);
                return (
                  <TouchableOpacity key={num} style={[sm.dayChip, active && sm.dayChipOn]} onPress={() => toggleDay(num)}>
                    <Text style={[sm.dayChipTxt, active && sm.dayChipTxtOn]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Description */}
          <Text style={sm.label}>תיאור (אופציונלי)</Text>
          <TextInput scrollEnabled={false}
            style={sm.noteInput}
            value={description} onChangeText={setDescription}
            placeholder="פרטים נוספים על השיעור..."
            placeholderTextColor={Colors.textMuted} textAlign="right"
            multiline numberOfLines={2} textAlignVertical="top"
          />

          {/* Actions */}
          <View style={[sm.actions, { marginTop: 8 }]}>
            {!isNew && (
              <TouchableOpacity style={sm.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                <Text style={sm.deleteTxt}>מחק</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={sm.cancelBtn} onPress={onClose}>
              <Text style={sm.cancelTxt}>ביטול</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sm.saveBtn} onPress={handleSave}>
              <Text style={sm.saveTxt}>שמור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Prayer type block ────────────────────────────────────────────────────────
function PrayerBlock({ label, color, prayerKey, slots, onChange, hideDays = false }: {
  label: string; color: string; prayerKey: string;
  slots: PrayerTimeSlot[];
  onChange: (slots: PrayerTimeSlot[]) => void;
  hideDays?: boolean;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  return (
    <>
      <View style={[s.prayerBlock, { borderLeftColor: color }]}>
        <Text style={[s.prayerBlockLabel, { color }]}>{label}</Text>
        {slots.length === 0
          ? <Text style={sm.emptySlots}>אין זמנים</Text>
          : slots.map((slot, i) => (
              <SlotCard key={i} slot={slot} onPress={() => setEditingIdx(i)} />
            ))
        }
      </View>

      {editingIdx !== null && (
        <SlotEditModal
          visible
          slot={slots[editingIdx]}
          prayerType={prayerKey}
          hideDays={hideDays}
          isNew={false}
          onSave={(updated) => {
            onChange(slots.map((sl, j) => (j === editingIdx ? updated : sl)));
          }}
          onDelete={() => {
            onChange(slots.filter((_, j) => j !== editingIdx));
          }}
          onClose={() => setEditingIdx(null)}
        />
      )}
    </>
  );
}

// ─── Gabay "submit event for public approval" modal ──────────────────────────

const EVENT_CATEGORIES: { key: EventCategory; label: string; icon: string }[] = [
  { key: 'shiur',        label: 'שיעור',  icon: 'book-outline' },
  { key: 'community',   label: 'קהילה',  icon: 'people-outline' },
  { key: 'holiday',     label: 'חג',     icon: 'star-outline' },
  { key: 'announcement',label: 'הודעה',  icon: 'megaphone-outline' },
  { key: 'alert',       label: 'התראה',  icon: 'warning-outline' },
];

function SubmitEventModal({ visible, onSave, onClose }: {
  visible: boolean;
  onSave: (ann: SynagogueAnnouncement, submitForApproval: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [title,              setTitle]              = useState('');
  const [description,        setDescription]        = useState('');
  const [category,           setCategory]           = useState<EventCategory>('announcement');
  const [location,           setLocation]           = useState('');
  const [isAlert,            setIsAlert]            = useState(false);
  const [submitForApproval,  setSubmitForApproval]  = useState(false);
  const [startDt,     setStartDt]     = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); return d; });
  const [pickerOpen,  setPickerOpen]  = useState(false);
  const [androidTmp,  setAndroidTmp]  = useState<Date>(new Date());
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDescription(''); setCategory('announcement');
    setLocation(''); setIsAlert(false); setSubmitForApproval(false);
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0);
    setStartDt(d); setPickerOpen(false); setSaving(false);
  }, [visible]);

  function formatDt(d: Date) {
    return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
      + ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  async function handleSubmit() {
    if (!title.trim())       { Alert.alert('שגיאה', 'יש להזין כותרת'); return; }
    if (!description.trim()) { Alert.alert('שגיאה', 'יש להזין תיאור'); return; }
    setSaving(true);
    try {
      const ann: SynagogueAnnouncement = {
        id:          `ev_${Date.now()}`,
        title:       title.trim(),
        description: description.trim(),
        category,
        startDate:   startDt.toISOString(),
        isAlert,
        createdAt:   new Date().toISOString(),
        // omit location entirely when empty — Firestore rejects undefined values
        ...(location.trim() ? { location: location.trim() } : {}),
      };
      await onSave(ann, submitForApproval);
      onClose();
    } catch (e: any) {
      Alert.alert('שגיאה', e.message ?? 'לא ניתן לשמור את האירוע');
    } finally {
      setSaving(false);
    }
  }

  function openPicker() {
    if (Platform.OS === 'android') { setAndroidTmp(startDt); setAndroidStep('date'); setPickerOpen(true); }
    else setPickerOpen(true);
  }

  function handleAndroidChange(_: any, date?: Date) {
    if (!date) { setPickerOpen(false); return; }
    if (androidStep === 'date') {
      setAndroidTmp(date); setAndroidStep('time');
    } else {
      const merged = new Date(androidTmp);
      merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
      setStartDt(merged); setPickerOpen(false); setAndroidStep('date');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sm.overlay}>
        <ScrollView style={sm.sheet} contentContainerStyle={{ gap: 4, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={sm.header}>
            <Text style={sm.title}>הוספת אירוע לבית הכנסת</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={sm.label}>כותרת *</Text>
          <TextInput scrollEnabled={false}
            style={[sm.noteInput, { minHeight: undefined, paddingVertical: 10 }]}
            value={title} onChangeText={setTitle}
            placeholder="לדוגמה: שיעור גמרא שבועי"
            placeholderTextColor={Colors.textMuted} textAlign="right"
          />

          {/* Category */}
          <Text style={sm.label}>קטגוריה</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {EVENT_CATEGORIES.map(({ key, label, icon }) => {
              const active = category === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[sm.typeChip, active && { borderColor: Colors.events, backgroundColor: Colors.events + '18' }]}
                  onPress={() => setCategory(key)}
                >
                  <Ionicons name={icon as any} size={13} color={active ? Colors.events : Colors.textMuted} />
                  <Text style={[sm.typeChipTxt, active && { color: Colors.events }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Description */}
          <Text style={sm.label}>תיאור *</Text>
          <TextInput scrollEnabled={false}
            style={sm.noteInput}
            value={description} onChangeText={setDescription}
            placeholder="פרטים על האירוע..."
            placeholderTextColor={Colors.textMuted} textAlign="right"
            multiline numberOfLines={3} textAlignVertical="top"
          />

          {/* Date */}
          <Text style={sm.label}>תאריך ושעה</Text>
          <TouchableOpacity style={[sm.noteInput, { minHeight: undefined, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={openPicker}>
            <Ionicons name="calendar-outline" size={16} color={Colors.events} />
            <Text style={{ flex: 1, fontSize: 14, color: Colors.text }}>{formatDt(startDt)}</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && pickerOpen && (
            <View>
              <DateTimePicker value={startDt} mode="datetime" display="spinner" locale="he"
                onChange={(_, d) => { if (d) setStartDt(d); }} />
              <TouchableOpacity style={[sm.saveBtn, { alignSelf: 'center', paddingHorizontal: 32, marginTop: 4 }]} onPress={() => setPickerOpen(false)}>
                <Text style={sm.saveTxt}>אישור</Text>
              </TouchableOpacity>
            </View>
          )}
          {Platform.OS === 'android' && pickerOpen && (
            <DateTimePicker
              value={androidStep === 'date' ? androidTmp : androidTmp}
              mode={androidStep}
              display="default"
              onChange={handleAndroidChange}
            />
          )}

          {/* Location */}
          <Text style={sm.label}>מיקום (אופציונלי)</Text>
          <TextInput scrollEnabled={false}
            style={[sm.noteInput, { minHeight: undefined, paddingVertical: 10 }]}
            value={location} onChangeText={setLocation}
            placeholder="כתובת / שם האולם"
            placeholderTextColor={Colors.textMuted} textAlign="right"
          />

          {/* Alert toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
            <Text style={sm.label}>התראה דחופה</Text>
            <Switch value={isAlert} onValueChange={setIsAlert} trackColor={{ true: Colors.danger }} />
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />

          {/* Submit for community approval toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <Switch
              value={submitForApproval}
              onValueChange={setSubmitForApproval}
              trackColor={{ true: Colors.events }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[sm.label, { marginBottom: 2 }]}>הגש לפרסום קהילתי</Text>
              <Text style={{ fontSize: 11, color: Colors.textMuted, lineHeight: 16 }}>
                {submitForApproval
                  ? 'האירוע יופיע בדף בית הכנסת וישלח לאישור מנהל הקהילה לפרסום בפיד הקהילתי'
                  : 'האירוע יופיע רק בדף בית הכנסת'}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={[sm.actions, { marginTop: 8 }]}>
            <TouchableOpacity style={sm.cancelBtn} onPress={onClose}>
              <Text style={sm.cancelTxt}>ביטול</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sm.saveBtn, { flex: 1, justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: Colors.events }, saving && { opacity: 0.6 }]}
              onPress={handleSubmit} disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <><Ionicons name={submitForApproval ? 'send-outline' : 'add-circle-outline'} size={15} color={Colors.white} />
                   <Text style={sm.saveTxt}>{submitForApproval ? 'הוסף ושלח לאישור' : 'הוסף לבית הכנסת'}</Text></>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function Field({ label, value, onChangeText, placeholder, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean;
}) {
  return (
    <View style={[s.fieldRow, multiline && { alignItems: 'flex-start' }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput scrollEnabled={false}
        style={[s.fieldInput, multiline && s.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        textAlign="right"
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────
function EditForm({ syn, onBack, isDemo, userId, userName }: {
  syn: Synagogue; onBack: () => void; isDemo: boolean; userId: string; userName: string;
}) {
  const { appUser } = useAuth();
  const isAdmin = ['city_admin', 'super_admin', 'dev'].includes(appUser?.role ?? '');
  const { options: nusachOptions, addOption: addNusach, labelFor: nusachLabel } = useNusachOptions(syn.cityId);
  const [showAddNusach, setShowAddNusach] = useState(false);
  const [newNusachText, setNewNusachText] = useState('');

  const toArr = (v: unknown): string[] =>
    Array.isArray(v) ? v as string[] : (v ? [v as string] : []);
  const [form, setForm] = useState<Synagogue>({ ...syn, nusach: toArr(syn.nusach) });
  const [saving,        setSaving]        = useState(false);
  const [editingLoc,    setEditingLoc]    = useState(false);
  const [addSlotOpen,   setAddSlotOpen]   = useState(false);
  const [addShabbatOpen,setAddShabbatOpen]= useState(false);
  const [addShiurOpen,   setAddShiurOpen]   = useState(false);
  const [shiurEditIdx,   setShiurEditIdx]   = useState<number | null>(null);
  const [submitEventOpen,setSubmitEventOpen]= useState(false);

  function setShiurim(shiurim: Shiur[]) {
    setForm((p) => ({ ...p, shiurim }));
  }

  async function handleSaveEvent(ann: SynagogueAnnouncement, submitForApproval: boolean) {
    const updated = [...(form.synagogueEvents ?? []), ann];
    // Save directly to the synagogue doc — no approval needed for synagogue-level visibility
    await updateSynagogue(form.id, { synagogueEvents: updated });
    setForm((p) => ({ ...p, synagogueEvents: updated }));
    if (submitForApproval) {
      await submitPendingEvent({
        cityId:          form.cityId,
        synagogueId:     form.id,
        synagogueName:   form.name,
        submittedBy:     userId,
        submittedByName: userName,
        title:           ann.title,
        description:     ann.description,
        category:        ann.category,
        startDate:       ann.startDate,
        location:        ann.location,
        organizer:       form.name,
        isAlert:         ann.isAlert,
      });
      Alert.alert('✓ נוסף ונשלח', 'האירוע נוסף לדף בית הכנסת ונשלח לאישור מנהל הקהילה לפרסום קהילתי.');
    } else {
      Alert.alert('✓ נוסף', 'האירוע נוסף לדף בית הכנסת.');
    }
  }

  function handleDeleteEvent(annId: string) {
    Alert.alert('מחיקת אירוע', 'למחוק אירוע זה?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () => {
        const updated = (form.synagogueEvents ?? []).filter((e) => e.id !== annId);
        setForm((p) => ({ ...p, synagogueEvents: updated }));
        updateSynagogue(form.id, { synagogueEvents: updated }).catch(() => {});
      }},
    ]);
  }

  function set(key: keyof Synagogue, value: any) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function setSlots(type: 'shacharit' | 'mincha' | 'maariv', slots: PrayerTimeSlot[]) {
    setForm((p) => ({
      ...p,
      weeklySchedule: { ...p.weeklySchedule, [type]: slots },
    }));
  }

  function setShabbatSlots(type: ShabbatKey, slots: PrayerTimeSlot[]) {
    setForm((p) => ({
      ...p,
      shabbatSchedule: { ...p.shabbatSchedule, [type]: slots },
    }));
  }

  async function handleSave() {
    if (isDemo) {
      Alert.alert(
        'מצב הדגמה',
        'בסביבת הדגמה לא ניתן לשמור שינויים ב-Firestore.\n\nכדי לערוך נתונים אמיתיים, התחבר עם חשבון Firebase שיש לו תפקיד admin.',
        [{ text: 'הבנתי' }],
      );
      return;
    }
    setSaving(true);
    try {
      await updateSynagogue(form.id, form);
      Alert.alert('✓ נשמר', 'הנתונים עודכנו בהצלחה', [{ text: 'אישור', onPress: onBack }]);
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={s.editContent}>
      {/* Sub-header */}
      <View style={s.subHeader}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
          <Text style={s.backBtnTxt}>רשימה</Text>
        </TouchableOpacity>
        <Text style={s.subHeaderName} numberOfLines={1}>{form.name}</Text>
      </View>

      {isDemo && (
        <View style={s.demoBanner}>
          <Ionicons name="warning-outline" size={14} color={Colors.gold} />
          <Text style={s.demoBannerTxt}>מצב הדגמה — שמירה לא תישמר ב-DB</Text>
        </View>
      )}

      <View style={s.content}>

        {/* ── Basic info ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>פרטים כלליים</Text>
          <View style={s.card}>
            <Field label="שם" value={form.name} onChangeText={(v) => set('name', v)} />
            <Field label="כתובת" value={form.address?.he ?? ''} onChangeText={(v) => set('address', { ...form.address, he: v })} />
            <Field label="שכונה" value={form.neighborhood ?? ''} onChangeText={(v) => set('neighborhood', v)} />
          </View>
        </View>

        {/* ── Images ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>תמונות</Text>
          <Text style={s.sectionHint}>תמונה ראשית מוצגת בכרטיס בית הכנסת, תמונות נוספות יוצגו בעיגולים</Text>
          <View style={s.card}>
            <ImageGalleryEditor
              images={[form.imageUrl, ...(form.images ?? [])].filter(Boolean) as string[]}
              onChange={(imgs) => setForm((p) => ({ ...p, imageUrl: imgs[0] ?? undefined, images: imgs.slice(1) }))}
              storagePath={`synagogues/${form.id}/gallery`}
              maxImages={4}
            />
          </View>
        </View>

        {/* ── Nusach ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>נוסח</Text>
          <View style={s.card}>
            <View style={s.nusachRow}>
              {nusachOptions.map(({ key, label }) => {
                const active = (form.nusach ?? []).includes(key);
                return (
                  <TouchableOpacity key={key}
                    style={[s.nusachChip, active && s.nusachChipOn]}
                    onPress={() => {
                      const cur = form.nusach ?? [];
                      set('nusach', active ? cur.filter(k => k !== key) : [...cur, key]);
                    }}>
                    <Text style={[s.nusachChipTxt, active && s.nusachChipTxtOn]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
              {isAdmin && (
                <TouchableOpacity
                  style={[s.nusachChip, { borderStyle: 'dashed' }]}
                  onPress={() => { setShowAddNusach(true); setNewNusachText(''); }}>
                  <Text style={s.nusachChipTxt}>+ נוסח</Text>
                </TouchableOpacity>
              )}
            </View>
            {showAddNusach && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <TextInput scrollEnabled={false}
                  style={[s.fieldInput, { flex: 1 }]}
                  value={newNusachText}
                  onChangeText={setNewNusachText}
                  placeholder="שם הנוסח, למשל: תימני"
                  autoFocus
                />
                <TouchableOpacity
                  style={{ backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md }}
                  onPress={async () => {
                    const ok = await addNusach(newNusachText);
                    if (ok) {
                      const cur = form.nusach ?? [];
                      set('nusach', [...cur, newNusachText.trim()]);
                      setShowAddNusach(false);
                    }
                    else Alert.alert('שגיאה', 'נוסח זה כבר קיים ברשימה');
                  }}>
                  <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 13 }}>שמור</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowAddNusach(false)}>
                  <Ionicons name="close-circle-outline" size={24} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ── Contact ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>אנשי קשר</Text>
          <View style={s.card}>
            <Field label="רב"          value={form.rabbiName ?? form.rabbi ?? ''}  onChangeText={(v) => set('rabbiName', v)} />
            <Field label="טלפון רב"    value={form.rabbiPhone ?? ''}               onChangeText={(v) => set('rabbiPhone', v)} />
            <Field label="גבאי"        value={form.gabbaiName ?? ''}               onChangeText={(v) => set('gabbaiName', v)} />
            <Field label="טלפון גבאי"  value={form.gabbaiPhone ?? ''}              onChangeText={(v) => set('gabbaiPhone', v)} />
            <Field label="טלפון כללי"  value={form.phone ?? ''}                    onChangeText={(v) => set('phone', v)} />
          </View>
        </View>

        {/* ── Location ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>מיקום</Text>
          <View style={s.card}>
            <Field label="קישור Waze"    value={form.wazeLink ?? ''}        onChangeText={(v) => set('wazeLink', v || undefined)} />
            <Field label="הוראות ניווט" value={form.navigationNote ?? ''} onChangeText={(v) => set('navigationNote', v || undefined)} multiline />
            <TouchableOpacity style={s.locBtn} onPress={() => setEditingLoc(true)}>
              <Ionicons name={form.latitude ? 'location' : 'location-outline'} size={18} color={Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={s.locBtnTitle}>{form.latitude ? 'מיקום מוצמד' : 'הוסף מיקום מדויק'}</Text>
                {form.latitude
                  ? <Text style={s.locBtnSub}>{form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)}</Text>
                  : <Text style={s.locBtnSub}>לא הוגדר — ניווט לפי כתובת</Text>}
              </View>
              <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Weekly schedule ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>לוח שבועי</Text>
          <Text style={s.sectionHint}>לחץ על זמן קיים לעריכה</Text>
          <View style={s.card}>
            {PRAYER_TYPES.map(({ key, label, color }) => (
              <PrayerBlock
                key={key}
                label={label}
                color={color}
                prayerKey={key}
                slots={form.weeklySchedule[key] ?? []}
                onChange={(slots) => setSlots(key, slots)}
              />
            ))}
            <TouchableOpacity style={s.addSlotBtn} onPress={() => setAddSlotOpen(true)}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={[s.addSlotTxt, { color: Colors.primary }]}>הוסף זמן תפילה</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SlotEditModal
          visible={addSlotOpen}
          slot={{ ...EMPTY_WEEKDAY_SLOT }}
          prayerType="shacharit"
          showTypeSelector
          isNew
          onSave={(slot, type) => setSlots(type as PrayerKey, [...(form.weeklySchedule[type as PrayerKey] ?? []), slot])}
          onDelete={() => {}}
          onClose={() => setAddSlotOpen(false)}
        />

        {/* ── Shabbat schedule ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>לוח שבת</Text>
          <Text style={s.sectionHint}>זמני שבת — מוצגים בנפרד בפרופיל בית הכנסת</Text>
          <View style={s.card}>
            {SHABBAT_PRAYER_TYPES.map(({ key, label, color }) => (
              <PrayerBlock
                key={key}
                label={label}
                color={color}
                prayerKey={key}
                hideDays
                slots={form.shabbatSchedule?.[key] ?? []}
                onChange={(slots) => setShabbatSlots(key, slots)}
              />
            ))}
            <Field
              label="הערות שבת"
              value={form.shabbatSchedule?.notes ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, shabbatSchedule: { ...p.shabbatSchedule, notes: v || undefined } }))}
              placeholder="לדוגמה: קבלת שבת בזמן הדלקת נרות"
              multiline
            />
            <TouchableOpacity style={s.addSlotBtn} onPress={() => setAddShabbatOpen(true)}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.events} />
              <Text style={[s.addSlotTxt, { color: Colors.events }]}>הוסף זמן שבת</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SlotEditModal
          visible={addShabbatOpen}
          slot={{ ...EMPTY_SHABBAT_SLOT }}
          prayerType="minchaFriday"
          showTypeSelector
          typeOptions={SHABBAT_PRAYER_TYPES}
          hideDays
          isNew
          onSave={(slot, type) => setShabbatSlots(type as ShabbatKey, [...(form.shabbatSchedule?.[type as ShabbatKey] ?? []), slot])}
          onDelete={() => {}}
          onClose={() => setAddShabbatOpen(false)}
        />

        {/* ── Shiurim ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>שיעורי תורה</Text>
          <Text style={s.sectionHint}>שיעורים קבועים — יוצגו בפרופיל בית הכנסת</Text>
          <View style={s.card}>
            {(form.shiurim ?? []).length === 0 ? (
              <Text style={sm.emptySlots}>אין שיעורים רשומים</Text>
            ) : (
              (form.shiurim ?? []).map((sh, i) => (
                <TouchableOpacity
                  key={sh.id ?? i}
                  style={[sm.slotCard, { borderLeftColor: Colors.primary }]}
                  onPress={() => setShiurEditIdx(i)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={sm.slotCardTime}>{sh.title}</Text>
                    <Text style={sm.slotCardDays}>{sh.rabbi} · {sh.time}</Text>
                    {!!sh.description && <Text style={sm.slotCardNote} numberOfLines={1}>{sh.description}</Text>}
                  </View>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginHorizontal: 6 }}>
                    {sh.days === 'daily' ? 'יומי' :
                      (sh.days as number[]).map((d) => DAYS_ALL.find((da) => da.num === d)?.label ?? '').join(' ')}
                  </Text>
                  <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity style={s.addSlotBtn} onPress={() => setAddShiurOpen(true)}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={[s.addSlotTxt, { color: Colors.primary }]}>הוסף שיעור</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Shiur edit modal — for existing shiurim */}
        {shiurEditIdx !== null && (
          <ShiurEditModal
            visible
            shiur={form.shiurim?.[shiurEditIdx] ?? {}}
            isNew={false}
            onSave={(updated) => setShiurim((form.shiurim ?? []).map((sh, j) => (j === shiurEditIdx ? updated : sh)))}
            onDelete={() => setShiurim((form.shiurim ?? []).filter((_, j) => j !== shiurEditIdx))}
            onClose={() => setShiurEditIdx(null)}
          />
        )}

        {/* Shiur add modal */}
        <ShiurEditModal
          visible={addShiurOpen}
          shiur={{}}
          isNew
          onSave={(sh) => setShiurim([...(form.shiurim ?? []), sh])}
          onDelete={() => {}}
          onClose={() => setAddShiurOpen(false)}
        />

        {/* ── Notes ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>הערות לציבור</Text>
          <View style={s.card}>
            <TextInput scrollEnabled={false} style={s.notesInput} value={form.notes ?? ''}
              onChangeText={(v) => set('notes', v || undefined)}
              multiline numberOfLines={4} textAlign="right"
              textAlignVertical="top" placeholder="הערות..." placeholderTextColor={Colors.textMuted} />
          </View>
        </View>

        {/* ── Synagogue events / announcements ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>אירועים והודעות</Text>
          <Text style={s.sectionHint}>יוצגו בדף בית הכנסת — ניתן גם לשלוח לאישור לפרסום קהילתי</Text>
          <View style={s.card}>
            {(form.synagogueEvents ?? []).length === 0 ? (
              <Text style={sm.emptySlots}>אין אירועים רשומים</Text>
            ) : (
              (form.synagogueEvents ?? [])
                .slice()
                .sort((a, b) => a.startDate.localeCompare(b.startDate))
                .map((ann) => (
                  <View
                    key={ann.id}
                    style={[sm.slotCard, { borderLeftColor: ann.isAlert ? Colors.danger : Colors.events }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={sm.slotCardTime}>{ann.title}</Text>
                      <Text style={sm.slotCardDays}>
                        {new Date(ann.startDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        {ann.location ? ` · ${ann.location}` : ''}
                      </Text>
                      {!!ann.description && (
                        <Text style={sm.slotCardNote} numberOfLines={1}>{ann.description}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteEvent(ann.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))
            )}
            <TouchableOpacity style={s.addSlotBtn} onPress={() => setSubmitEventOpen(true)}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.events} />
              <Text style={[s.addSlotTxt, { color: Colors.events }]}>הוסף אירוע</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SubmitEventModal
          visible={submitEventOpen}
          onSave={handleSaveEvent}
          onClose={() => setSubmitEventOpen(false)}
        />

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <><Ionicons name="save-outline" size={20} color={Colors.white} /><Text style={s.saveBtnTxt}>שמור שינויים</Text></>}
        </TouchableOpacity>
      </View>
    </ScrollView>

    <LocationEditModal
      visible={editingLoc}
      name={form.name}
      address={form.address?.he ?? form.address?.en ?? ''}
      latitude={form.latitude}
      longitude={form.longitude}
      onSave={async (lat, lon) => {
        set('latitude', lat);
        set('longitude', lon);
      }}
      onClear={async () => {
        set('latitude', undefined);
        set('longitude', undefined);
      }}
      onClose={() => setEditingLoc(false)}
    />
    </KeyboardAvoidingView>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────
export default function ManageSynagogueScreen() {
  const cityId = useCityId();
  const { appUser, isDemo } = useAuth();
  const navigation = useNavigation();
  const { synagogues, loading } = useSynagogues(cityId);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<Synagogue | null>(null);
  const [adding,   setAdding]   = useState(false);
  const [creating, setCreating] = useState(false);
  const isAdmin = ['city_admin', 'super_admin', 'dev'].includes(appUser?.role ?? '');
  const managed = appUser?.managedSynagogueIds ?? [];
  const { options: nusachOptions } = useNusachOptions(cityId);

  async function handleCreate(values: Record<string, string>) {
    setCreating(true);
    try {
      const base: Omit<Synagogue, 'id'> = {
        cityId,
        name: values.name.trim(),
        nusach: values.nusach ? [values.nusach] : [],
        address: { he: values.address.trim() },
        weeklySchedule: { shacharit: [], mincha: [], maariv: [] },
      };
      const id = await addSynagogue(base);
      setAdding(false);
      setSelected({ id, ...base });
    } catch (e: any) {
      Alert.alert('שגיאה', e.message ?? 'לא ניתן ליצור בית כנסת');
    } finally {
      setCreating(false);
    }
  }

  function handleDeleteSynagogue(syn: Synagogue) {
    Alert.alert('מחיקת בית כנסת', `למחוק את "${syn.name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          try {
            await deleteSynagogue(syn.id);
          } catch (e: any) {
            Alert.alert('שגיאה', e.message);
          }
        },
      },
    ]);
  }

  const visible = synagogues
    .filter((s) => isAdmin || managed.includes(s.id))
    .filter((s) => !search || s.name.includes(search) || (s.address.he ?? s.address.en ?? '').includes(search));

  useLayoutEffect(() => {
    if (!isAdmin) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setAdding((a) => !a)}
          style={{ marginRight: 4, padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={adding ? 'close' : 'add'} size={26} color={Colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isAdmin, adding]);

  if (selected) {
    return (
      <EditForm
        syn={selected}
        onBack={() => setSelected(null)}
        isDemo={isDemo}
        userId={appUser?.uid ?? ''}
        userName={appUser?.displayName ?? ''}
      />
    );
  }

  return (
    <View style={s.container}>
      {!adding && (
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput scrollEnabled={false} style={s.searchInput} placeholder="חפש בית כנסת..." value={search}
            onChangeText={setSearch} textAlign="right" />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {adding ? (
          <AddItemModal
            visible
            inline
            title="הוספת בית כנסת"
            accentColor={Colors.primary}
            submitting={creating}
            onClose={() => setAdding(false)}
            onSubmit={handleCreate}
            fields={[
              { key: 'name', label: 'שם בית הכנסת', placeholder: 'לדוגמה: בית כנסת הגדול', required: true },
              { key: 'address', label: 'כתובת', placeholder: 'רחוב ומספר', required: true },
              { key: 'nusach', label: 'נוסח', type: 'select', required: true,
                options: nusachOptions.map(o => ({ value: o.key, label: o.label })) },
            ]}
          />
        ) : loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} size="large" />
        ) : visible.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="business-outline" size={56} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>
              {managed.length === 0 && !isAdmin ? 'אין בתי כנסת מוקצים' : 'לא נמצאו תוצאות'}
            </Text>
            <Text style={s.emptySubtitle}>
              {managed.length === 0 && !isAdmin
                ? 'פנה למנהל המערכת כדי לקבל הרשאות ניהול'
                : 'נסה לשנות את החיפוש'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.listCount}>{visible.length} בתי כנסת</Text>
            {visible.map((syn) => (
              <TouchableOpacity key={syn.id} style={s.listCard}
                onPress={() => setSelected(syn)} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={s.listCardName}>{syn.name}</Text>
                  <Text style={s.listCardSub}>
                    {(syn.nusach ?? []).join(' / ')}{' '}
                    · {syn.address.he ?? syn.address.en ?? ''}
                  </Text>
                  {(syn.rabbiName ?? syn.rabbi) && (
                    <Text style={s.listCardDetail}>רב: {syn.rabbiName ?? syn.rabbi}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleDeleteSynagogue(syn)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                </TouchableOpacity>
                <Ionicons name="chevron-back-outline" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.background },
  searchBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.cardBackground, margin: Spacing.md, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:  { flex: 1, fontSize: 15, color: Colors.text },
  listCount:    { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.sm },
  listCard:     { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, ...Shadow.card },
  listCardName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  listCardSub:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  listCardDetail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  emptyState:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  emptySubtitle:{ fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // Edit form
  editContent:  { paddingBottom: 40 },
  demoBanner:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF9C3', paddingHorizontal: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F9E547' },
  demoBannerTxt:{ fontSize: 13, fontWeight: '600', color: Colors.gold, flex: 1 },
  subHeader:    { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtnTxt:   { color: Colors.white, fontSize: 14, fontWeight: '600' },
  subHeaderName:{ flex: 1, fontSize: 17, fontWeight: '800', color: Colors.white },
  content:      { padding: Spacing.md, gap: Spacing.lg },
  section:      { gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  sectionHint:  { fontSize: 11, color: Colors.textMuted },
  card:         { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.card, gap: 2 },

  fieldRow:     { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, gap: 8 },
  fieldLabel:   { fontSize: 12, color: Colors.textMuted, width: 80,  },
  fieldInput:   { flex: 1, fontSize: 15, color: Colors.text },
  fieldInputMulti: { minHeight: 60, textAlignVertical: 'top', paddingTop: 4 },

  nusachRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  nusachChip:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  nusachChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  nusachChipTxt:{ fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  nusachChipTxtOn: { color: Colors.white },

  prayerBlock:  { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, borderLeftWidth: 3, paddingLeft: 8, marginBottom: 4 },
  prayerBlockLabel: { fontSize: 13, fontWeight: '800', marginBottom: 6 },
  addSlotBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6 },
  addSlotTxt:   { fontSize: 13, fontWeight: '600' },

  notesInput:   { fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: 'top' },
  saveBtn:           { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnTxt:        { fontSize: 16, fontWeight: '700', color: Colors.white },
  submitEventBtn:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.events + '10', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.events + '40', paddingHorizontal: Spacing.md, paddingVertical: 14 },
  submitEventTitle:  { fontSize: 15, fontWeight: '700', color: Colors.text },
  submitEventSub:    { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  locBtn:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  locBtnTitle:  { fontSize: 14, fontWeight: '600', color: Colors.text },
  locBtnSub:    { fontSize: 11, color: Colors.textMuted },
});

// ─── Slot modal styles ────────────────────────────────────────────────────────
const sm = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { backgroundColor: Colors.cardBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: 36, gap: 6, maxHeight: '85%', flexShrink: 1 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title:        { fontSize: 18, fontWeight: '800', color: Colors.text },
  label:        { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: 8 },
  timeRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  timeHalf:     { width: 80, borderWidth: 2, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, fontSize: 28, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  timeHalfError:{ borderColor: Colors.danger },
  timeSep:      { fontSize: 32, fontWeight: '800', color: Colors.textSecondary },
  timeErrorTxt: { fontSize: 12, color: Colors.danger, textAlign: 'center', marginTop: 4 },
  daysRow:      { flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 4 },
  dayChip:      { flex: 1, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.background },
  dayChipOn:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayChipTxt:   { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  dayChipTxtOn: { color: Colors.white },
  noteInput:    { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: 'top', marginTop: 4 },
  actions:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  deleteBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteTxt:    { fontSize: 13, color: Colors.danger, fontWeight: '600' },
  cancelBtn:    { paddingHorizontal: 16, paddingVertical: 10 },
  cancelTxt:    { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn:      { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 24, paddingVertical: 10 },
  saveTxt:      { fontSize: 14, color: Colors.white, fontWeight: '700' },

  // Prayer type selector
  typeRow:      { flexDirection: 'row', gap: 8, marginTop: 4 },
  typeChip:     { flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.background },
  typeChipTxt:  { fontSize: 14, fontWeight: '700', color: Colors.textMuted },

  // Fixed / relative mode toggle
  modeRow:      { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primary, overflow: 'hidden', marginTop: 8 },
  modeBtn:      { flex: 1, paddingVertical: 9, alignItems: 'center' },
  modeBtnActive:{ backgroundColor: Colors.primary },
  modeBtnTxt:   { fontSize: 13, fontWeight: '700', color: Colors.primary },
  modeBtnTxtActive: { color: Colors.white },

  // Anchor grid
  anchorDropBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.background, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4,
  },
  anchorDropTxt:         { fontSize: 14, fontWeight: '600', color: Colors.text },
  anchorDropPlaceholder: { fontSize: 14, color: Colors.textMuted },
  anchorDropList: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.cardBackground, marginTop: 4, overflow: 'hidden',
  },
  anchorDropItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  anchorDropItemActive: { backgroundColor: Colors.primary + '15' },
  anchorDropItemTxt:    { fontSize: 14, color: Colors.text },
  anchorDropItemTxtActive: { fontWeight: '700', color: Colors.primary },

  // Offset stepper
  offsetRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
  stepBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepSmall:    { fontSize: 13, fontWeight: '700', color: Colors.text },
  offsetVal:    { fontSize: 22, fontWeight: '800', color: Colors.text, minWidth: 60, textAlign: 'center' },
  relativePreview: { fontSize: 12, color: Colors.primaryLight, textAlign: 'center', marginTop: 4, fontWeight: '600' },

  // Slot card
  slotCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  slotCardTime: { fontSize: 18, fontWeight: '800', color: Colors.text, minWidth: 50, textAlign: 'center' },
  slotCardTimeRelative: { fontSize: 14, color: Colors.primaryLight },
  slotCardDays: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  slotCardNote: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  emptySlots:   { fontSize: 12, color: Colors.textMuted, paddingVertical: 4 },
});
