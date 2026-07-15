import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Switch,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { useRestaurants } from '../../hooks/useRestaurants';
import { useNavigation } from '@react-navigation/native';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';
import { updateRestaurant, addRestaurant, deleteRestaurant, restaurantCategories, detectCertChanges, CertChange, BADATZ_LIST, isLocalRabbanut } from '../../services/restaurants';
import { getUsersByCity, setManagedRestaurants, setUserRole } from '../../services/users';
import { createKashrutUpdate, formatKashrutUpdateTitle, formatKashrutUpdateDetail } from '../../services/kashrutUpdates';
import { sendPushToCity } from '../../services/pushNotifications';
import { addBadatz, addRabbanut } from '../../services/kashrutConfig';
import { useCity } from '../../hooks/useCity';
import { useKashrutConfig } from '../../hooks/useKashrutConfig';
import { Restaurant, KosherCertificate, KosherLevel, BusinessType, AppUser } from '../../types';
import ImageGalleryEditor from '../../components/ImageGalleryEditor';
import AddItemModal from '../../components/AddItemModal';
import Dropdown from '../../components/Dropdown';

const KOSHER_LEVELS: { key: KosherLevel; label: string }[] = [
  { key: 'mehadrin',       label: 'מהדרין' },
  { key: 'regular',        label: 'רגיל' },
  { key: 'chalav_israel',  label: 'חלב ישראל' },
  { key: 'bishul_israel',  label: 'בישול ישראל' },
  { key: 'glatt',          label: 'גלאט' },
];

const CATEGORY_LABELS: Record<string, string> = {
  meat: '🥩 בשרי', dairy: '🧀 חלבי', pareve: '🌿 פרווה', vegan: '🌱 טבעוני', cafe: '☕ קפה', bakery: '🥐 מאפייה',
};

const CAT_OPTIONS = [
  { value: 'meat',   label: '🥩 בשרי' },
  { value: 'dairy',  label: '🧀 חלבי' },
  { value: 'pareve', label: '🌿 פרווה' },
  { value: 'vegan',  label: '🌱 טבעוני' },
  { value: 'cafe',   label: '☕ קפה' },
  { value: 'bakery', label: '🥐 מאפייה' },
];

const BUSINESS_TYPE_CHIPS: { key: BusinessType; label: string }[] = [
  { key: 'serving', label: '🍴 בית אוכל' },
  { key: 'factory', label: '🏭 מפעל' },
];

// ─── Cert editor ──────────────────────────────────────────────────────────────
function CertEditor({ rest, onBack, onDelete }: { rest: Restaurant; onBack: () => void; onDelete: () => void }) {
  const cityId = useCityId();
  const config = useKashrutConfig(cityId);
  const [certs, setCerts] = useState<KosherCertificate[]>(rest.kosherCertificates ?? []);
  const [mashgiachName, setMashgiachName]   = useState(rest.mashgiachName ?? '');
  const [mashgiachPhone, setMashgiachPhone] = useState(rest.mashgiachPhone ?? '');
  const [businessType, setBusinessType]     = useState<BusinessType>(rest.businessType ?? 'serving');
  const [categories, setCategories]         = useState<string[]>(restaurantCategories(rest));
  const [saving, setSaving]         = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [expandedIdx, setExpandedIdx]             = useState<number | null>(null);
  const [addList, setAddList]                     = useState<null | 'badatz' | 'rabbanut'>(null);
  const [addingList, setAddingList]               = useState(false);
  const [alertsToConfirm, setAlertsToConfirm]     = useState<CertChange[] | null>(null);
  const [selectedAlerts, setSelectedAlerts]       = useState<Set<number>>(new Set());

  // Built-in defaults + the authority's custom additions
  const badatzOptions   = [...new Set([...BADATZ_LIST, ...config.badatzList])];
  const rabbanutOptions = [...new Set(config.rabbanutList)];

  function toggleCategory(cat: string) {
    setCategories((p) => (p.includes(cat) ? p.filter((c) => c !== cat) : [...p, cat]));
  }

  async function handleAddCertifier(values: Record<string, string>) {
    const name = (values.name ?? '').trim();
    if (!name) return;
    setAddingList(true);
    try {
      if (addList === 'rabbanut') await addRabbanut(cityId, name);
      else                        await addBadatz(cityId, name);
      setAddList(null);
    } catch (e: any) {
      Alert.alert('שגיאה', e.message ?? 'לא ניתן להוסיף לרשימה');
    } finally {
      setAddingList(false);
    }
  }

  // New certs are third-party badatzim (the local rabbanut is the pinned primary).
  function addCert() {
    const newCert: KosherCertificate = {
      id: `cert-${Date.now()}`,
      certifierType: 'badatz',
      issuedBy: '',
      kosherLevel: ['mehadrin'],
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: '',
      isActive: true,
    };
    setCerts((p) => [...p, newCert]);
    setExpandedIdx(certs.length);
  }

  function updateCert(idx: number, patch: Partial<KosherCertificate>) {
    setCerts((p) => p.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function toggleLevel(idx: number, level: KosherLevel) {
    const cert = certs[idx];
    const has = cert.kosherLevel.includes(level);
    updateCert(idx, {
      kosherLevel: has
        ? cert.kosherLevel.filter((l) => l !== level)
        : [...cert.kosherLevel, level],
    });
  }

  function removeCert(idx: number) {
    Alert.alert('מחיקת תעודה', 'האם אתה בטוח?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () => {
        setCerts((p) => p.filter((_, i) => i !== idx));
        setExpandedIdx(null);
      }},
    ]);
  }

  // ── Display helpers for the confirmation modal ──────────────────────────────
  function changeTitle(ch: CertChange): string {
    const down = ch.direction === 'down';
    if (ch.certType === 'local_rabbanut') return down ? 'שינוי כשרות רבנות' : 'שדרוג כשרות רבנות';
    if (ch.certType === 'badatz')         return down ? 'הסרת בד"ץ'          : 'הוספת בד"ץ';
    return down ? 'ירידת כשרות' : 'שדרוג כשרות';
  }

  function changeDetail(ch: CertChange): string {
    const tag = ch.tags.join(' · ');
    if (ch.certType === 'local_rabbanut') return ch.direction === 'up' ? `שודרגה ל${tag}` : `שונתה ל${tag}`;
    if (ch.certType === 'badatz')         return ch.direction === 'up' ? `נוסף: ${tag}`    : `הוסר: ${tag}`;
    return tag;
  }

  function toggleAlert(i: number) {
    setSelectedAlerts((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  // ── Permanently delete this business ────────────────────────────────────────
  function handleDelete() {
    Alert.alert(
      'מחיקת עסק לצמיתות',
      `למחוק את "${rest.name}"? לא ניתן לשחזר פעולה זו.`,
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחק', style: 'destructive', onPress: async () => {
          try {
            await deleteRestaurant(rest.id);
            onDelete();
          } catch (e: any) {
            Alert.alert('שגיאה', e.message);
          }
        }},
      ],
    );
  }

  // ── Save: persist data, then open the confirmation modal if needed ───────────
  async function handleSave() {
    setSaving(true);
    try {
      const certChanges = detectCertChanges(rest.kosherCertificates ?? [], certs);

      // Sync isHidden with rabbanut cert active state
      const rabbanutDeactivated = certChanges.some((c) => c.certType === 'local_rabbanut' && c.direction === 'down' && c.tags.includes('הושבתה'));
      const rabbanutReactivated = certChanges.some((c) => c.certType === 'local_rabbanut' && c.direction === 'up'   && c.tags.includes('הופעלה'));

      await updateRestaurant(rest.id, {
        kosherCertificates: certs,
        mashgiachName:  mashgiachName.trim()  || undefined,
        mashgiachPhone: mashgiachPhone.trim() || undefined,
        businessType,
        categories,
        category: categories[0] ?? rest.category ?? 'meat',
        ...(rabbanutDeactivated ? { isHidden: true  } : {}),
        ...(rabbanutReactivated ? { isHidden: false } : {}),
      });

      if (certChanges.length > 0) {
        // Let the admin choose which alerts to publish
        setAlertsToConfirm(certChanges);
        setSelectedAlerts(new Set(certChanges.map((_, i) => i))); // all checked by default
      } else {
        Alert.alert('✓ נשמר', 'פרטי הכשרות עודכנו בהצלחה', [{ text: 'אישור', onPress: onBack }]);
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Publish: send only the alerts the admin confirmed ────────────────────────
  async function handlePublish() {
    setPublishing(true);
    try {
      const toPublish = (alertsToConfirm ?? []).filter((_, i) => selectedAlerts.has(i));
      for (const ch of toPublish) {
        await createKashrutUpdate({
          cityId: rest.cityId, businessId: rest.id, businessName: rest.name,
          direction: ch.direction, certType: ch.certType, tags: ch.tags, note: ch.note,
        });
        // Awaited (unlike a typical fire-and-forget push call) because handlePublish
        // navigates away right after this loop — an un-awaited fetch here could get
        // abandoned mid-flight when the screen unmounts before it resolves.
        await sendPushToCity(
          rest.cityId,
          `${rest.name} — ${formatKashrutUpdateTitle(ch)}`,
          ch.note || formatKashrutUpdateDetail(ch),
        );
      }
      setAlertsToConfirm(null);
      onBack();
    } catch (e: any) {
      Alert.alert('שגיאה בפרסום', e.message ?? 'נסה שנית');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Sub-header */}
      <View style={[s.subHeader, rest.isHidden && { backgroundColor: Colors.danger }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
          <Text style={s.backBtnText}>רשימה</Text>
        </TouchableOpacity>
        <View style={s.subHeaderInfo}>
          <Text style={s.subHeaderName}>{rest.name}</Text>
          <Text style={s.subHeaderSub}>{CATEGORY_LABELS[rest.category] ?? ''} · {rest.address}</Text>
        </View>
      </View>

      {/* Suspended banner */}
      {rest.isHidden && (
        <View style={s.suspendedBanner}>
          <Ionicons name="eye-off-outline" size={20} color={Colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={s.suspendedTitle}>העסק מושהה ומוסתר מהציבור</Text>
            <Text style={s.suspendedSub}>הפעל את תעודת הרבנות כדי להסיר את ההשהיה</Text>
          </View>
        </View>
      )}

      <View style={s.content}>
        {/* Business classification — kashrut-controlled */}
        <Text style={s.sectionTitle}>אופי העסק</Text>
        <View style={s.certCard}>
          <View style={s.certBody}>
            <View style={s.levelsRow}>
              {BUSINESS_TYPE_CHIPS.map(({ key, label }) => {
                const active = businessType === key;
                return (
                  <TouchableOpacity key={key} style={[s.levelChip, active && s.levelChipActive]} onPress={() => setBusinessType(key)}>
                    <Text style={[s.levelChipText, active && s.levelChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={[s.sectionTitle, { marginTop: Spacing.lg }]}>סוג כשרות (בחירה מרובה)</Text>
        <View style={s.certCard}>
          <View style={s.certBody}>
            <View style={s.levelsRow}>
              {CAT_OPTIONS.map(({ value, label }) => {
                const active = categories.includes(value);
                return (
                  <TouchableOpacity key={value} style={[s.levelChip, active && s.levelChipActive]} onPress={() => toggleCategory(value)}>
                    <Text style={[s.levelChipText, active && s.levelChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Mashgiach (supervisor) — business-level contact, controlled by the kashrut authority */}
        <Text style={[s.sectionTitle, { marginTop: Spacing.lg }]}>פרטי משגיח כשרות</Text>
        <View style={s.certCard}>
          <View style={s.certBody}>
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>שם המשגיח</Text>
              <TextInput scrollEnabled={false}
                style={s.fieldInput}
                value={mashgiachName}
                onChangeText={setMashgiachName}
                textAlign="right"
                placeholder="שם מלא"
              />
            </View>
            <View style={[s.fieldRow, { borderBottomWidth: 0 }]}>
              <Text style={s.fieldLabel}>טלפון המשגיח</Text>
              <TextInput scrollEnabled={false}
                style={s.fieldInput}
                value={mashgiachPhone}
                onChangeText={setMashgiachPhone}
                textAlign="right"
                placeholder="050-0000000"
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>

        <Text style={[s.sectionTitle, { marginTop: Spacing.lg }]}>תעודות כשרות</Text>

        {certs.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="shield-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyText}>אין תעודות כשרות. לחץ על "הוסף" כדי להוסיף.</Text>
          </View>
        )}

        {certs.map((cert, idx) => {
          const isExpanded = expandedIdx === idx;
          return (
            <View key={cert.id} style={s.certCard}>
              <View style={s.certHeader}>
                <View style={s.certHeaderLeft}>
                  <Switch
                    value={cert.isActive}
                    onValueChange={(v) => updateCert(idx, { isActive: v })}
                    trackColor={{ true: Colors.success }}
                  />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={s.certTitle}>
                      {cert.issuedBy || (isLocalRabbanut(cert) ? 'רבנות מקומית' : `תעודה #${idx + 1}`)}
                    </Text>
                    {isLocalRabbanut(cert) && <Text style={s.primaryTag}>ראשי · חובה</Text>}
                  </View>
                </View>
                <View style={s.certHeaderActions}>
                  <TouchableOpacity onPress={() => setExpandedIdx(isExpanded ? null : idx)}>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  {!isLocalRabbanut(cert) && (
                    <TouchableOpacity onPress={() => removeCert(idx)}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {!cert.isActive && (
                <View style={s.inactiveBanner}>
                  <Text style={s.inactiveBannerText}>תעודה לא פעילה</Text>
                </View>
              )}

              {!isExpanded && (
                <View style={s.certSummary}>
                  <Text style={s.certSummaryText}>
                    {cert.kosherLevel.map((l) => KOSHER_LEVELS.find((k) => k.key === l)?.label ?? l).join(', ')}
                  </Text>
                  <Text style={s.certSummaryDate}>תוקף עד: {cert.validUntil || '—'}</Text>
                </View>
              )}

              {isExpanded && (
                <View style={s.certBody}>
                  {/* Certifier dropdown — rabbanut list for the primary, badatz list for additions */}
                  {(isLocalRabbanut(cert) || cert.certifierType === 'badatz') && (
                    <View style={{ marginBottom: Spacing.sm }}>
                      <Text style={s.levelsTitle}>{isLocalRabbanut(cert) ? 'רבנות' : 'גוף מכשיר (בד"ץ)'}</Text>
                      <Dropdown
                        value={cert.issuedBy}
                        placeholder={isLocalRabbanut(cert) ? 'בחר רבנות' : 'בחר בד"ץ'}
                        options={isLocalRabbanut(cert) ? rabbanutOptions : badatzOptions}
                        onSelect={(v) => updateCert(idx, { issuedBy: v })}
                        onAddNew={() => setAddList(isLocalRabbanut(cert) ? 'rabbanut' : 'badatz')}
                        accentColor={Colors.success}
                      />
                      <Text style={[s.fieldLabel, { marginTop: 6 }]}>או הקלד שם אחר בשדה למטה</Text>
                    </View>
                  )}

                  {([
                    { label: isLocalRabbanut(cert) ? 'שם הרבנות' : 'גוף מנפיק', key: 'issuedBy', placeholder: isLocalRabbanut(cert) ? 'רבנות מקומית' : 'בד"ץ...' },
                    { label: 'מספר תעודה',  key: 'certNumber',  placeholder: '' },
                    { label: 'תוקף מ',      key: 'validFrom',   placeholder: 'YYYY-MM-DD' },
                    { label: 'תוקף עד',     key: 'validUntil',  placeholder: 'YYYY-MM-DD' },
                  ] as { label: string; key: keyof KosherCertificate; placeholder: string }[]).map(({ label, key, placeholder }) => (
                    <View key={key} style={s.fieldRow}>
                      <Text style={s.fieldLabel}>{label}</Text>
                      <TextInput scrollEnabled={false}
                        style={s.fieldInput}
                        value={(cert[key] as string) ?? ''}
                        onChangeText={(v) => updateCert(idx, { [key]: v } as any)}
                        textAlign="right"
                        placeholder={placeholder}
                      />
                    </View>
                  ))}

                  <Text style={s.levelsTitle}>רמות כשרות</Text>
                  <View style={s.levelsRow}>
                    {KOSHER_LEVELS.map(({ key, label }) => {
                      const active = cert.kosherLevel.includes(key);
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[s.levelChip, active && s.levelChipActive]}
                          onPress={() => toggleLevel(idx, key)}
                        >
                          <Text style={[s.levelChipText, active && s.levelChipTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>הערות</Text>
                    <TextInput scrollEnabled={false}
                      style={[s.fieldInput, { minHeight: 50, textAlignVertical: 'top' }]}
                      value={cert.notes ?? ''}
                      onChangeText={(v) => updateCert(idx, { notes: v })}
                      textAlign="right"
                      multiline
                    />
                  </View>

                  {/* Certificate image */}
                  <View style={{ marginTop: Spacing.sm }}>
                    <ImageGalleryEditor
                      label="תמונת תעודת הכשרות"
                      images={cert.imageUrl ? [cert.imageUrl] : []}
                      onChange={(imgs) => updateCert(idx, { imageUrl: imgs[0] ?? undefined })}
                      storagePath={`businesses/${rest.id}/certificates/${cert.id}`}
                      maxImages={1}
                    />
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={s.addBtn} onPress={addCert}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.success} />
          <Text style={s.addBtnText}>הוסף תעודת כשרות</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <><Ionicons name="save-outline" size={20} color={Colors.white} /><Text style={s.saveBtnText}>שמור שינויים</Text></>}
        </TouchableOpacity>

        <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
          <Text style={s.deleteBtnText}>מחק עסק לצמיתות</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    {/* Add a certifier to the city-wide list */}
    <AddItemModal
      visible={!!addList}
      title={addList === 'rabbanut' ? 'הוספת רבנות לרשימה' : 'הוספת בד"ץ לרשימה'}
      accentColor={Colors.success}
      submitting={addingList}
      onClose={() => setAddList(null)}
      onSubmit={handleAddCertifier}
      fields={[{ key: 'name', label: 'שם הגוף המכשיר', placeholder: addList === 'rabbanut' ? 'רבנות...' : 'בד"ץ...', required: true }]}
    />

    {/* ── Pre-publish confirmation sheet ── */}
    <Modal visible={!!alertsToConfirm} transparent animationType="slide">
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>עדכוני כשרות לפרסום</Text>
          <Text style={s.modalSub}>בחר אילו שינויים לפרסם לציבור</Text>

          {(alertsToConfirm ?? []).map((ch, i) => {
            const sel  = selectedAlerts.has(i);
            const down = ch.direction === 'down';
            return (
              <TouchableOpacity key={i} style={[s.alertRow, sel && s.alertRowSel]} onPress={() => toggleAlert(i)} activeOpacity={0.75}>
                <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={22} color={sel ? Colors.primary : Colors.textMuted} />
                <Ionicons name={down ? 'warning' : 'arrow-up-circle'} size={18} color={down ? Colors.danger : Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.alertRowTitle, { color: down ? Colors.danger : Colors.success }]}>{changeTitle(ch)}</Text>
                  <Text style={s.alertRowDetail}>{changeDetail(ch)}</Text>
                  {ch.note && (
                    <View style={s.alertRowNoteRow}>
                      <Ionicons name="shield-checkmark-outline" size={11} color={Colors.success} />
                      <Text style={s.alertRowNote}>{ch.note}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[s.publishBtn, selectedAlerts.size === 0 && s.publishBtnDim]}
            onPress={handlePublish}
            disabled={publishing}
            activeOpacity={0.85}
          >
            {publishing ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={s.publishBtnText}>
                {selectedAlerts.size > 0 
                  ? `פרסם ${selectedAlerts.size} ${selectedAlerts.size === 1 ? 'עדכון' : 'עדכונים'}`
                  : 'לא נבחרו עדכונים'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.skipBtn} onPress={() => { setAlertsToConfirm(null); onBack(); }}>
            <Text style={s.skipBtnText}>דלג על הפרסום</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────
export default function ManageKosherScreen() {
  const cityId = useCityId();
  const { appUser } = useAuth();
  const navigation = useNavigation();
  const { city } = useCity(cityId);
  const { restaurants, loading } = useRestaurants(cityId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);

  const roles = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = roles.some((r) => ['city_admin', 'super_admin', 'dev'].includes(r));
  // Kosher certification review is a city-wide responsibility, not tied to specific
  // assigned businesses — mirrors managesBusiness() in firestore.rules, which already
  // grants kosher_manager access to every business regardless of managedRestaurantIds.
  const isKosherManager = roles.includes('kosher_manager');
  const managed = appUser?.managedRestaurantIds ?? [];

  // Load users so the admin (or kosher_manager, who can also create businesses) can
  // assign a business manager at creation time.
  useEffect(() => {
    if (!isAdmin && !isKosherManager) return;
    getUsersByCity(cityId).then(setUsers).catch(() => {});
  }, [cityId, isAdmin, isKosherManager]);

  const managerOptions = users
    .filter((u) => u.role === 'user' || u.role === 'business_manager')
    .map((u) => ({ value: u.uid, label: u.displayName || u.email || u.uid }));

  // A kosher business is born here (in kashrut management), optionally with a
  // manager assigned, then it appears in "ניהול עסקים" for editing business info.
  async function handleCreate(values: Record<string, string>) {
    setCreating(true);
    try {
      const cats = (values.categories ?? '').split(',').filter(Boolean);
      // Every kosher business starts with the mandatory, pinned local-rabbinate cert.
      const localCert: KosherCertificate = {
        id: `cert-local-${Date.now()}`,
        certifierType: 'local_rabbanut',
        issuedBy: city?.name ? `רבנות ${city.name}` : 'רבנות מקומית',
        kosherLevel: ['regular'],
        validFrom: new Date().toISOString().split('T')[0],
        validUntil: '',
        isActive: true,
      };
      const base: Omit<Restaurant, 'id'> = {
        cityId,
        name: values.name.trim(),
        address: values.address.trim(),
        category: cats[0] ?? 'meat',
        categories: cats.length ? cats : ['meat'],
        businessType: (values.businessType as BusinessType) || 'serving',
        openingHours: {},
        kosherCertificates: [localCert],
      };
      const id = await addRestaurant(base);

      // Optional: assign a business manager
      if (values.manager) {
        const u = users.find((x) => x.uid === values.manager);
        if (u) {
          await setManagedRestaurants(u.uid, [...(u.managedRestaurantIds ?? []), id]);
          if (u.role === 'user') await setUserRole(u.uid, 'business_manager');
        }
      }

      setAdding(false);
      setSelected({ id, ...base }); // continue into certificates + mashgiach
    } catch (e: any) {
      Alert.alert('שגיאה', e.message ?? 'לא ניתן ליצור עסק');
    } finally {
      setCreating(false);
    }
  }

  const visible = restaurants
    .filter((r) => isAdmin || isKosherManager || managed.includes(r.id))
    .filter((r) => !search || r.name.includes(search) || r.address.includes(search));

  useLayoutEffect(() => {
    if (!isAdmin && !isKosherManager) return;
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
  }, [navigation, isAdmin, isKosherManager, adding]);

  if (selected) {
    return <CertEditor rest={selected} onBack={() => setSelected(null)} onDelete={() => setSelected(null)} />;
  }

  return (
    <View style={s.container}>
      {!adding && (
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput scrollEnabled={false} style={s.searchInput} placeholder="חפש מסעדה..." value={search}
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
            title="הוספת עסק כשר"
            accentColor={Colors.success}
            submitting={creating}
            onClose={() => setAdding(false)}
            onSubmit={handleCreate}
            fields={[
              { key: 'name', label: 'שם העסק', placeholder: 'לדוגמה: מסעדת הגליל', required: true },
              { key: 'address', label: 'כתובת', placeholder: 'רחוב ומספר', required: true },
              { key: 'businessType', label: 'אופי העסק', type: 'select', required: true, options: [
                { value: 'serving', label: '🍴 בית אוכל' },
                { value: 'factory', label: '🏭 מפעל' },
              ] },
              { key: 'categories', label: 'סוג (ניתן לבחור כמה)', type: 'multiselect', required: true, options: CAT_OPTIONS },
              ...(managerOptions.length > 0
                ? [{ key: 'manager', label: 'מנהל העסק (אופציונלי)', type: 'select' as const, options: managerOptions }]
                : []),
            ]}
          />
        ) : loading ? (
          <ActivityIndicator color={Colors.success} style={{ marginTop: 40 }} size="large" />
        ) : visible.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={56} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>
              {managed.length === 0 && !isAdmin && !isKosherManager ? 'אין מסעדות מוקצות' : 'לא נמצאו תוצאות'}
            </Text>
            <Text style={s.emptySubtitle}>
              {managed.length === 0 && !isAdmin && !isKosherManager
                ? 'פנה למנהל המערכת כדי לקבל הרשאות ניהול'
                : 'נסה לשנות את החיפוש'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.listCount}>{visible.length} מסעדות</Text>
            {visible.map((rest) => {
              const certs = rest.kosherCertificates ?? [];
              const activeCerts = certs.filter((c) => c.isActive);
              return (
                <TouchableOpacity key={rest.id} style={[s.listCard, rest.isHidden && s.listCardHidden]} onPress={() => setSelected(rest)} activeOpacity={0.8}>
                  <Text style={s.listCardEmoji}>
                    {rest.category === 'meat' ? '🥩' : rest.category === 'dairy' ? '🧀' : rest.category === 'cafe' ? '☕' : '🍽️'}
                  </Text>
                  <View style={s.listCardLeft}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.listCardName}>{rest.name}</Text>
                      {rest.isHidden && (
                        <View style={s.suspendedChip}>
                          <Text style={s.suspendedChipText}>מושהה</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.listCardSub}>{CATEGORY_LABELS[rest.category] ?? ''} · {rest.address}</Text>
                    {rest.isHidden ? (
                      <Text style={s.listCardHiddenSub}>מוסתר מהציבור · הרבנות לא פעילה</Text>
                    ) : activeCerts.length > 0 ? (
                      <Text style={s.listCardCert}>✓ {activeCerts.map((c) => c.issuedBy).join(', ')}</Text>
                    ) : (
                      <Text style={s.listCardNoCert}>⚠ אין תעודת כשרות פעילה</Text>
                    )}
                    <Text style={s.listCardCount}>{certs.length} תעודות</Text>
                  </View>
                  <Ionicons name="chevron-back-outline" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.cardBackground, margin: Spacing.md, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
  listCount: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.sm },
  listCard: { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, ...Shadow.card },
  listCardEmoji: { fontSize: 28 },
  listCardLeft: { flex: 1 },
  listCardName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  listCardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  listCardCert: { fontSize: 11, color: Colors.success, marginTop: 2 },
  listCardNoCert: { fontSize: 11, color: Colors.warning, marginTop: 2 },
  listCardCount: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  // Cert editor
  subHeader: { backgroundColor: Colors.success, flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  subHeaderInfo: { flex: 1 },
  subHeaderName: { fontSize: 17, fontWeight: '800', color: Colors.white },
  subHeaderSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  content: { padding: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  certCard: { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, marginBottom: Spacing.md, overflow: 'hidden', ...Shadow.card },
  certHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.background },
  certHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  certTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  primaryTag: { fontSize: 10, fontWeight: '700', color: Colors.kosher, marginTop: 1 },
  certHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  inactiveBanner: { backgroundColor: Colors.danger + '22', padding: 6, alignItems: 'center' },
  inactiveBannerText: { fontSize: 12, color: Colors.danger, fontWeight: '700' },
  certSummary: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: 2 },
  certSummaryText: { fontSize: 13, color: Colors.textSecondary },
  certSummaryDate: { fontSize: 11, color: Colors.textMuted },
  certBody: { padding: Spacing.md },
  fieldRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.sm },
  fieldLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  fieldInput: { fontSize: 15, color: Colors.text, paddingVertical: 2 },
  levelsTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: 6 },
  levelsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.sm },
  levelChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border },
  levelChipActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  levelChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  levelChipTextActive: { color: Colors.white },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderColor: Colors.kosher, borderStyle: 'dashed' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.success, borderStyle: 'dashed', marginBottom: Spacing.lg },
  addBtnText: { fontSize: 15, color: Colors.success, fontWeight: '700' },
  saveBtn: { backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.md, paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.danger },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
  // Suspended state
  suspendedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, margin: Spacing.md, padding: Spacing.md, backgroundColor: Colors.danger + '12', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.danger + '40' },
  suspendedTitle: { fontSize: 14, fontWeight: '800', color: Colors.danger },
  suspendedSub: { fontSize: 12, color: Colors.danger + 'CC', marginTop: 2 },
  listCardHidden: { borderWidth: 1.5, borderColor: Colors.danger + '50' },
  listCardHiddenSub: { fontSize: 11, color: Colors.danger, marginTop: 2, fontWeight: '600' },
  suspendedChip: { backgroundColor: Colors.danger, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  suspendedChipText: { fontSize: 10, fontWeight: '800', color: Colors.white },
  // Pre-publish confirmation modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:      { backgroundColor: Colors.cardBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
  modalTitle:      { fontSize: 19, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 4 },
  modalSub:        { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },
  alertRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.sm, borderWidth: 1.5, borderColor: Colors.border },
  alertRowSel:     { borderColor: Colors.primary, backgroundColor: Colors.primary + '0C' },
  alertRowTitle:   { fontSize: 13, fontWeight: '800' },
  alertRowDetail:  { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  alertRowNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  alertRowNote:    { fontSize: 11, color: Colors.success, fontWeight: '600' },
  publishBtn:      { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md },
  publishBtnDim:   { backgroundColor: Colors.textMuted },
  publishBtnText:  { fontSize: 16, fontWeight: '800', color: Colors.white },
  skipBtn:         { alignItems: 'center', paddingVertical: Spacing.md },
  skipBtnText:     { fontSize: 14, color: Colors.textMuted },
});
