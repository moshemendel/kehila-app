import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import TimePicker from '../../components/TimePicker';
import LocationPicker from '../../components/LocationPicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useNavigation } from '@react-navigation/native';
import { useEvents } from '../../hooks/useEvents';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';
import { createEvent, deleteEvent } from '../../services/events';
import { sendPushToCity } from '../../services/pushNotifications';
import { subscribeToPendingEvents, approvePendingEvent, rejectPendingEvent } from '../../services/pendingEvents';
import { CommunityEvent, EventCategory, PendingCommunityEvent } from '../../types';

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORIES: { key: EventCategory; label: string; icon: string; color: string }[] = [
  { key: 'shiur',        label: 'שיעור',  icon: 'book-outline',      color: Colors.primary },
  { key: 'community',   label: 'קהילה',  icon: 'people-outline',    color: Colors.events },
  { key: 'youth',       label: 'נוער',   icon: 'happy-outline',     color: Colors.kosher },
  { key: 'charity',     label: 'צדקה',   icon: 'heart-outline',     color: Colors.danger },
  { key: 'holiday',     label: 'חג',     icon: 'star-outline',      color: Colors.goldBright },
  { key: 'announcement',label: 'הודעה',  icon: 'megaphone-outline', color: Colors.primaryLight },
  { key: 'alert',       label: 'התראה',  icon: 'warning-outline',   color: Colors.danger },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatHebrew(d: Date): string {
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })
       + ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

// ── Picker state ──────────────────────────────────────────────────────────────

type PickerTarget = 'startDate' | 'endDate';

function dateToTimeStr(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManageEventsScreen() {
  const cityId = useCityId();
  const { appUser } = useAuth();
  const { events, loading } = useEvents(cityId);
  const navigation = useNavigation();

  const [creating, setCreating] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'pending' | 'expired'>('events');
  const [pending,   setPending]   = useState<PendingCommunityEvent[]>([]);

  // useEvents only drops events past their Firestore TTL (expiresAt — a grace window
  // of days/weeks after the event date, kept for late-arriving views/archival), so an
  // event that already happened yesterday still shows up mixed into the same list as
  // upcoming ones. Split by the actual event date instead, matching kehila-admin's
  // EventsPage upcoming/archive split.
  const now = new Date();
  const upcomingEvents = events.filter((e) => !e.startDate || new Date(e.startDate) >= now);
  const pastEvents     = events.filter((e) => e.startDate && new Date(e.startDate) < now);

  // Subscribe to pending (gabay-submitted) events
  useEffect(() => {
    if (!cityId) return;
    return subscribeToPendingEvents(cityId, setPending);
  }, [cityId]);

  // Form values
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<EventCategory>('announcement');
  const [location,    setLocation]    = useState('');
  const [organizer,   setOrganizer]   = useState('');
  const [isAlert,     setIsAlert]     = useState(false);
  const [startDt,     setStartDt]     = useState<Date>(defaultStart);
  const [hasEndDate,  setHasEndDate]  = useState(false);
  const [endDt,       setEndDt]       = useState<Date | null>(null);

  // Picker state
  const [activePicker, setActivePicker] = useState<PickerTarget | null>(null);
  // Android two-step: accumulates date before time is selected
  const [androidTemp,  setAndroidTemp]  = useState<Date>(new Date());
  // iOS: show in modal
  const [iosPickerValue, setIosPickerValue] = useState<Date>(new Date());

  // ── Picker handlers ─────────────────────────────────────────────────────────

  function openPicker(target: PickerTarget) {
    const base = target === 'startDate' ? startDt : endDt ?? startDt;
    if (Platform.OS === 'ios') {
      setIosPickerValue(base);
    } else {
      setAndroidTemp(base);
    }
    setActivePicker(target);
  }

  function onAndroidChange(_: any, selected?: Date) {
    if (!activePicker || !selected) { setActivePicker(null); return; }

    if (activePicker === 'startDate') {
      const next = new Date(startDt);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setStartDt(next);
    } else if (activePicker === 'endDate') {
      const next = new Date(endDt ?? startDt);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setEndDt(next);
    }
    setActivePicker(null);
  }

  function confirmIosPicker() {
    if (!activePicker) return;
    if (activePicker === 'startDate') {
      const next = new Date(startDt);
      next.setFullYear(iosPickerValue.getFullYear(), iosPickerValue.getMonth(), iosPickerValue.getDate());
      setStartDt(next);
    } else {
      const next = new Date(endDt ?? startDt);
      next.setFullYear(iosPickerValue.getFullYear(), iosPickerValue.getMonth(), iosPickerValue.getDate());
      setEndDt(next);
    }
    setActivePicker(null);
  }

  function onStartTimeChange(timeStr: string) {
    const [h, m] = timeStr.split(':').map(Number);
    const next = new Date(startDt);
    next.setHours(h, m, 0, 0);
    setStartDt(next);
  }

  function onEndTimeChange(timeStr: string) {
    if (!endDt) return;
    const [h, m] = timeStr.split(':').map(Number);
    const next = new Date(endDt);
    next.setHours(h, m, 0, 0);
    setEndDt(next);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  function resetForm() {
    setTitle(''); setDescription(''); setCategory('announcement');
    setLocation(''); setOrganizer(''); setIsAlert(false);
    setStartDt(defaultStart()); setHasEndDate(false); setEndDt(null);
  }

  async function handlePublish() {
    if (!title.trim() || !location.trim()) {
      Alert.alert('שדות חסרים', 'יש למלא כותרת ומיקום');
      return;
    }
    setSaving(true);
    try {
      await createEvent({
        cityId,
        title:       title.trim(),
        description: description.trim(),
        category,
        startDate:   startDt.toISOString(),
        endDate:     hasEndDate && endDt ? endDt.toISOString() : undefined,
        location:    location.trim()  || undefined,
        organizer:   organizer.trim() || undefined,
        isAlert,
        createdBy:   appUser?.uid ?? 'unknown',
      });
      resetForm();
      setCreating(false);
      Alert.alert('✓ פורסם', 'האירוע פורסם בהצלחה');
      // Only urgent (isAlert) events broadcast a push to the whole city — regular
      // events used to push everyone regardless, which felt spammy for the pilot.
      if (isAlert) {
        sendPushToCity(cityId, `⚠️ ${title.trim()}`, description.trim().slice(0, 120)).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string, title: string) {
    Alert.alert('מחיקת אירוע', `למחוק את "${title}"?`, [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () => deleteEvent(id).catch((e) => Alert.alert('שגיאה', e.message)) },
    ]);
  }

  function handleApprove(ev: PendingCommunityEvent) {
    Alert.alert('אישור אירוע', `לאשר ולפרסם את "${ev.title}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'אשר ופרסם',
        onPress: () =>
          approvePendingEvent(ev, appUser?.uid ?? '')
            .then(() => {
              Alert.alert('✓ פורסם', 'האירוע פורסם בהצלחה');
              if (ev.isAlert) {
                sendPushToCity(ev.cityId, `⚠️ ${ev.title}`, ev.description.slice(0, 120)).catch(() => {});
              }
            })
            .catch((e) => Alert.alert('שגיאה', e.message)),
      },
    ]);
  }

  function handleReject(ev: PendingCommunityEvent) {
    Alert.prompt(
      'דחיית אירוע',
      `סיבת הדחייה עבור "${ev.title}" (אופציונלי):`,
      (reason) => rejectPendingEvent(ev.id, reason).catch((e) => Alert.alert('שגיאה', e.message)),
      'plain-text',
      '',
    );
  }

  // ── Nav header + button ──────────────────────────────────────────────────────

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => { setCreating((c) => !c); resetForm(); }}
          style={{ marginRight: 4, padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={creating ? 'close' : 'add'} size={26} color={Colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, creating]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectedCat = CATEGORIES.find((c) => c.key === category)!;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

        {/* ── Create form ─────────────────────────────────────────────────── */}
        {creating && (
          <View style={styles.formCard}>

            {/* Title */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>כותרת *</Text>
              <TextInput scrollEnabled={false}
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="שם האירוע או ההודעה"
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
              />
            </View>

            {/* Description */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>תיאור</Text>
              <TextInput scrollEnabled={false}
                style={[styles.input, styles.inputMulti]}
                value={description}
                onChangeText={setDescription}
                placeholder="פרטים נוספים..."
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Category */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>קטגוריה</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRow}
              >
                {CATEGORIES.map(({ key, label, icon, color }) => {
                  const active = category === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.catChip, active && { backgroundColor: color, borderColor: color }]}
                      onPress={() => setCategory(key)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={icon as any} size={13} color={active ? Colors.white : color} />
                      <Text style={[styles.catChipText, active && { color: Colors.white }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Start date & time */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>תאריך ושעת התחלה *</Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity style={styles.dateBtnFlex} onPress={() => openPicker('startDate')}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.events} />
                  <Text style={[styles.dateBtnMain, { flex: 1 }]}>{formatHebrew(startDt)}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
                <TimePicker value={dateToTimeStr(startDt)} onChange={onStartTimeChange} compact />
              </View>
            </View>

            {/* End date toggle */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <Text style={styles.sectionLabel}>תאריך סיום (אופציונלי)</Text>
                <Switch
                  value={hasEndDate}
                  onValueChange={(v) => {
                    setHasEndDate(v);
                    if (v && !endDt) setEndDt(new Date(startDt.getTime() + 2 * 60 * 60 * 1000));
                  }}
                  trackColor={{ true: Colors.events }}
                  thumbColor={Colors.white}
                />
              </View>
              {hasEndDate && endDt && (
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity style={styles.dateBtnFlex} onPress={() => openPicker('endDate')}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.primaryLight} />
                    <Text style={[styles.dateBtnMain, { flex: 1 }]}>{formatHebrew(endDt)}</Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TimePicker value={dateToTimeStr(endDt)} onChange={onEndTimeChange} compact />
                </View>
              )}
            </View>

            {/* Location */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>מיקום *</Text>
              <LocationPicker value={location} onChange={setLocation} />
            </View>


            {/* Organizer */}
            <View style={styles.section}>
              <View style={styles.iconInputRow}>
                <Ionicons name="person-outline" size={17} color={Colors.textMuted} />
                <Text style={styles.sectionLabel}>מארגן</Text>
              </View>
                <TextInput scrollEnabled={false}
                  style={[styles.input, { flex: 1 }]}
                  value={organizer}
                  onChangeText={setOrganizer}
                  placeholder="שם המארגן / הגוף"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />
            </View>

            {/* Alert toggle */}
            <View style={[styles.section, styles.alertToggleRow, isAlert && styles.alertToggleActive]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertToggleTitle, isAlert && { color: Colors.danger }]}>
                  🚨 סמן כהתראה דחופה
                </Text>
                <Text style={styles.alertToggleSub}>יוצג בראש הרשימה עם תגית אדומה</Text>
              </View>
              <Switch
                value={isAlert}
                onValueChange={setIsAlert}
                trackColor={{ true: Colors.danger }}
                thumbColor={Colors.white}
              />
            </View>

            {/* Publish button */}
            <TouchableOpacity style={styles.publishBtn} onPress={handlePublish} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <>
                    <Ionicons name="megaphone-outline" size={20} color={Colors.white} />
                    <Text style={styles.publishBtnText}>פרסם</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Tab switcher ────────────────────────────────────────────────── */}
        {!creating && (<>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'events' && styles.tabActive]}
            onPress={() => setActiveTab('events')}
          >
            <Text style={[styles.tabText, activeTab === 'events' && styles.tabTextActive]}>
              אירועים {!loading && `(${upcomingEvents.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
              ממתין לאישור
            </Text>
            {pending.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pending.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'expired' && styles.tabActive]}
            onPress={() => setActiveTab('expired')}
          >
            <Text style={[styles.tabText, activeTab === 'expired' && styles.tabTextActive]}>
              ארכיון {!loading && `(${pastEvents.length})`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Upcoming events list ────────────────────────────────────────── */}
        {activeTab === 'events' && (
          <View style={styles.listSection}>
            {loading
              ? <ActivityIndicator color={Colors.events} style={{ marginTop: 20 }} />
              : upcomingEvents.length === 0
                ? <Text style={styles.emptyText}>אין אירועים פעילים</Text>
                : upcomingEvents.map((ev) => {
                    const cfg = CATEGORIES.find((c) => c.key === ev.category);
                    return (
                      <View key={ev.id} style={[styles.eventCard, { borderLeftColor: cfg?.color ?? Colors.border }]}>
                        <View style={[styles.eventIconCircle, { backgroundColor: (cfg?.color ?? Colors.border) + '20' }]}>
                          <Ionicons name={(cfg?.icon ?? 'calendar-outline') as any} size={16} color={cfg?.color ?? Colors.border} />
                        </View>
                        <View style={styles.eventInfo}>
                          <View style={styles.eventTitleRow}>
                            <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                            {ev.isAlert && (
                              <View style={styles.alertBadge}><Text style={styles.alertBadgeText}>דחוף</Text></View>
                            )}
                          </View>
                          <Text style={styles.eventDate}>{formatEventDate(ev.startDate)}</Text>
                          {ev.location && <Text style={styles.eventMeta}>📍 {ev.location}</Text>}
                        </View>
                        <TouchableOpacity onPress={() => handleDelete(ev.id, ev.title)} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
            }
          </View>
        )}

        {/* ── Pending (gabay-submitted) queue ─────────────────────────────── */}
        {activeTab === 'pending' && (
          <View style={styles.listSection}>
            {pending.length === 0 ? (
              <View style={styles.emptyPending}>
                <Ionicons name="checkmark-circle-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>אין אירועים ממתינים לאישור</Text>
              </View>
            ) : (
              pending.map((ev) => {
                const cfg = CATEGORIES.find((c) => c.key === ev.category);
                return (
                  <View key={ev.id} style={[styles.pendingCard, ev.isAlert && { borderLeftColor: Colors.danger }]}>
                    <View style={styles.pendingTop}>
                      <View style={[styles.eventIconCircle, { backgroundColor: (cfg?.color ?? Colors.border) + '20' }]}>
                        <Ionicons name={(cfg?.icon ?? 'calendar-outline') as any} size={16} color={cfg?.color ?? Colors.border} />
                      </View>
                      <View style={styles.eventInfo}>
                        <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                        <Text style={styles.eventDate}>{formatEventDate(ev.startDate)}</Text>
                        <Text style={styles.pendingSyn}>📍 {ev.synagogueName ?? ev.synagogueId}</Text>
                        <Text style={styles.pendingBy}>הוגש על-ידי: {ev.submittedByName ?? ev.submittedBy}</Text>
                      </View>
                    </View>
                    {!!ev.location && <Text style={styles.eventMeta}>📍 {ev.location}</Text>}
                    <View style={styles.pendingActions}>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(ev)}>
                        <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                        <Text style={styles.rejectBtnText}>דחה</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(ev)}>
                        <Ionicons name="checkmark-circle-outline" size={16} color={Colors.white} />
                        <Text style={styles.approveBtnText}>אשר ופרסם</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── Archive (already-past events) ───────────────────────────────── */}
        {activeTab === 'expired' && (
          <View style={styles.listSection}>
            {loading
              ? <ActivityIndicator color={Colors.events} style={{ marginTop: 20 }} />
              : pastEvents.length === 0
                ? <Text style={styles.emptyText}>אין אירועים בארכיון</Text>
                : pastEvents.map((ev) => {
                    const cfg = CATEGORIES.find((c) => c.key === ev.category);
                    return (
                      <View key={ev.id} style={[styles.eventCard, styles.eventCardPast, { borderLeftColor: cfg?.color ?? Colors.border }]}>
                        <View style={[styles.eventIconCircle, { backgroundColor: (cfg?.color ?? Colors.border) + '20' }]}>
                          <Ionicons name={(cfg?.icon ?? 'calendar-outline') as any} size={16} color={cfg?.color ?? Colors.border} />
                        </View>
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                          <Text style={styles.eventDate}>{formatEventDate(ev.startDate)}</Text>
                          {ev.location && <Text style={styles.eventMeta}>📍 {ev.location}</Text>}
                        </View>
                        <TouchableOpacity onPress={() => handleDelete(ev.id, ev.title)} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
            }
          </View>
        )}
        </>)}
      </ScrollView>

      {/* ── Android date picker (native dialog) ────────────────────────────── */}
      {Platform.OS === 'android' && activePicker && (
        <DateTimePicker
          value={androidTemp}
          mode="date"
          display="default"
          onChange={onAndroidChange}
          locale="he"
        />
      )}

      {/* ── iOS date/time picker (bottom sheet modal) ───────────────────────── */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={activePicker !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setActivePicker(null)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActivePicker(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setActivePicker(null)}>
                <Text style={styles.modalCancel}>ביטול</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {activePicker === 'endDate' ? 'תאריך סיום' : 'תאריך התחלה'}
              </Text>
              <TouchableOpacity onPress={confirmIosPicker}>
                <Text style={styles.modalConfirm}>אישור</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={iosPickerValue}
              mode="date"
              display="spinner"
              onChange={(_, d) => d && setIosPickerValue(d)}
              locale="he"
              style={{ width: '100%' }}
            />
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Form card
  formCard: {
    margin: Spacing.md,
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.card,
  },
  section: { marginBottom: Spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 0, textAlignVertical: 'center' },

  input: {
    fontSize: 15, color: Colors.text,
    borderBottomWidth: 1.5, borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, borderBottomWidth: 1.5 },

  iconInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Category chips
  catRow: { gap: 8, paddingVertical: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  catChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  // Date + time side by side
  dateTimeRow: { gap: 8, alignItems: 'center' },
  dateBtnFlex: {flexDirection: 'row',
    flex: 1, alignItems: 'center', gap: 15,
    backgroundColor: Colors.background, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },

  // Date button
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.background, borderRadius: Radius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  dateBtnMain: { fontSize: 14, fontWeight: '700', color: Colors.text },
  dateBtnSub:  { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Alert toggle
  alertToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  alertToggleActive: { borderColor: Colors.danger, backgroundColor: Colors.danger + '0C' },
  alertToggleTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  alertToggleSub:   { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // Publish button
  publishBtn: {
    backgroundColor: Colors.events, borderRadius: Radius.md,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginTop: Spacing.sm,
  },
  publishBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },

  // Events list
  listSection: { paddingHorizontal: Spacing.md },
  listTitle: {
    fontSize: 14, fontWeight: '700', color: Colors.textSecondary,
    textAlign: 'right', marginBottom: Spacing.sm, marginTop: Spacing.sm,
  },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 20 },

  // Tabs
  tabRow:          { flexDirection: 'row', marginHorizontal: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: 4, ...Shadow.card },
  tab:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: Radius.sm - 2 },
  tabActive:       { backgroundColor: Colors.events },
  tabText:         { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  tabTextActive:   { color: Colors.white },
  tabBadge:        { backgroundColor: Colors.danger, borderRadius: Radius.full, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText:    { fontSize: 11, color: Colors.white, fontWeight: '800' },

  // Pending queue
  pendingCard:     { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderLeftWidth: 4, borderLeftColor: Colors.events, ...Shadow.card },
  pendingTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  pendingSyn:      { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 3 },
  pendingBy:       { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pendingActions:  { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  emptyPending:    { alignItems: 'center', paddingTop: 40, gap: Spacing.sm },
  approveBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 10 },
  approveBtnText:  { fontSize: 14, fontWeight: '700', color: Colors.white },
  rejectBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: Colors.danger, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 16 },
  rejectBtnText:   { fontSize: 14, fontWeight: '700', color: Colors.danger },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.cardBackground, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderLeftWidth: 4, ...Shadow.card,
  },
  eventCardPast: { opacity: 0.6 },
  eventIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  eventInfo: { flex: 1 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
  alertBadge: { backgroundColor: Colors.danger, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  alertBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  eventDate: { fontSize: 12, color: Colors.textSecondary },
  eventMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: 6 },

  // iOS modal picker
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle:   { fontSize: 15, fontWeight: '700', color: Colors.text },
  modalCancel:  { fontSize: 15, color: Colors.textMuted },
  modalConfirm: { fontSize: 15, fontWeight: '700', color: Colors.events },
});
