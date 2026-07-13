import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { getUsersByCity, setUserRoles } from '../../services/users';
import { useSynagogues } from '../../hooks/useSynagogues';
import { useRestaurants } from '../../hooks/useRestaurants';
import { useCityId } from '../../hooks/useCityId';
import { AppUser, UserRole } from '../../types';

// Priority only used for DB write (single role field kept for auth checks)
const ROLE_PRIORITY: UserRole[] = [
  'super_admin', 'dev', 'city_admin', 'event_manager',
  'kosher_manager', 'eruv_manager', 'business_manager', 'gabbai', 'user',
];

const ROLES: { key: UserRole; label: string; color: string; icon: string }[] = [
  { key: 'user',             label: 'משתמש רגיל',    color: Colors.textSecondary, icon: 'person-outline' },
  { key: 'gabbai',           label: 'גבאי',           color: Colors.primaryLight,  icon: 'business-outline' },
  { key: 'business_manager', label: 'מנהל עסק',       color: Colors.kosher,        icon: 'restaurant-outline' },
  { key: 'kosher_manager',   label: 'מנהל כשרות',     color: Colors.success,       icon: 'shield-checkmark-outline' },
  { key: 'event_manager',    label: 'מנהל אירועים',   color: Colors.events,        icon: 'megaphone-outline' },
  { key: 'eruv_manager',     label: 'ממונה על עירוב', color: Colors.gold,          icon: 'shield-outline' },
  { key: 'city_admin',       label: 'מנהל מערכת',     color: Colors.danger,        icon: 'key-outline' },
];

// Roles that require assigning specific managed items
const LIST_ROLES = new Set<UserRole>(['gabbai', 'business_manager']);

type UserDraft = {
  roles: UserRole[];
  managedSynagogueIds: string[];
  managedRestaurantIds: string[];
};

type SubListState = { syn: boolean; rest: boolean };

function computePrimaryRole(roles: UserRole[]): UserRole {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return 'user';
}

// Pill display: city_admin wins, single role shows name, multiple → "N תפקידים"
function getPillInfo(draft: UserDraft): { label: string; color: string } {
  if (draft.roles.includes('city_admin')) {
    return { label: 'מנהל מערכת', color: Colors.danger };
  }
  const active = draft.roles.filter((r) => r !== 'user');
  if (active.length === 0) return { label: 'משתמש רגיל', color: Colors.textSecondary };
  if (active.length === 1) {
    const info = ROLES.find((r) => r.key === active[0]);
    return { label: info?.label ?? active[0], color: info?.color ?? Colors.primary };
  }
  return { label: `${active.length} תפקידים`, color: Colors.primary };
}

function initDraft(user: AppUser): UserDraft {
  return {
    roles: user.roles ?? [user.role ?? 'user'],
    managedSynagogueIds: user.managedSynagogueIds ?? [],
    managedRestaurantIds: user.managedRestaurantIds ?? [],
  };
}

export default function UserManagementScreen() {
  const cityId = useCityId();
  const { synagogues } = useSynagogues(cityId);
  const { restaurants } = useRestaurants(cityId);

  const [users, setUsers]             = useState<AppUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [drafts, setDrafts]           = useState<Record<string, UserDraft>>({});
  const [subLists, setSubLists]       = useState<Record<string, SubListState>>({});
  const [saving, setSaving]           = useState<string | null>(null);

  useEffect(() => {
    getUsersByCity(cityId)
      .then(setUsers)
      .catch((e) => Alert.alert('שגיאה', e.message))
      .finally(() => setLoading(false));
  }, [cityId]);

  const filtered = users.filter((u) =>
    u.displayName?.includes(search) || u.email?.includes(search)
  );

  function getDraft(user: AppUser): UserDraft {
    return drafts[user.uid] ?? initDraft(user);
  }

  function getSubList(uid: string): SubListState {
    return subLists[uid] ?? { syn: false, rest: false };
  }

  function updateDraft(user: AppUser, updater: (d: UserDraft) => UserDraft) {
    setDrafts((prev) => ({
      ...prev,
      [user.uid]: updater(prev[user.uid] ?? initDraft(user)),
    }));
  }

  function handleExpand(user: AppUser) {
    if (expandedUid === user.uid) {
      setExpandedUid(null);
    } else {
      if (!drafts[user.uid]) {
        const draft = initDraft(user);
        setDrafts((prev) => ({ ...prev, [user.uid]: draft }));
        setSubLists((prev) => ({
          ...prev,
          [user.uid]: {
            syn:  draft.roles.includes('gabbai'),
            rest: draft.roles.includes('business_manager'),
          },
        }));
      }
      setExpandedUid(user.uid);
    }
  }

  function toggleRole(user: AppUser, role: UserRole) {
    const currentDraft = getDraft(user);
    const wasOn        = currentDraft.roles.includes(role);
    const isListRole   = LIST_ROLES.has(role);

    if (isListRole && wasOn) {
      const hasItems = role === 'gabbai'
        ? currentDraft.managedSynagogueIds.length > 0
        : currentDraft.managedRestaurantIds.length > 0;

      if (hasItems) {
        // Items are assigned → just toggle the accordion, keep the role
        const key = role === 'gabbai' ? 'syn' : 'rest';
        setSubLists((prev) => {
          const cur = prev[user.uid] ?? { syn: false, rest: false };
          return { ...prev, [user.uid]: { ...cur, [key]: !cur[key] } };
        });
        return;
      }
      // No items assigned → fall through to remove the role
    }

    updateDraft(user, (d) => {
      const has = d.roles.includes(role);
      if (has && d.roles.length === 1) return { ...d, roles: ['user'] };
      return { ...d, roles: has ? d.roles.filter((r) => r !== role) : [...d.roles, role] };
    });

    if (isListRole) {
      const key = role === 'gabbai' ? 'syn' : 'rest';
      setSubLists((prev) => ({
        ...prev,
        [user.uid]: { ...(prev[user.uid] ?? { syn: false, rest: false }), [key]: !wasOn },
      }));
    }
  }

  function toggleSynagogue(user: AppUser, synId: string) {
    updateDraft(user, (d) => {
      const has = d.managedSynagogueIds.includes(synId);
      return { ...d, managedSynagogueIds: has ? d.managedSynagogueIds.filter((id) => id !== synId) : [...d.managedSynagogueIds, synId] };
    });
  }

  function toggleRestaurant(user: AppUser, restId: string) {
    updateDraft(user, (d) => {
      const has = d.managedRestaurantIds.includes(restId);
      return { ...d, managedRestaurantIds: has ? d.managedRestaurantIds.filter((id) => id !== restId) : [...d.managedRestaurantIds, restId] };
    });
  }

  async function handleSave(user: AppUser) {
    const draft       = getDraft(user);
    const primaryRole = computePrimaryRole(draft.roles);
    setSaving(user.uid);
    try {
      await setUserRoles(user.uid, draft.roles, primaryRole, draft.managedSynagogueIds, draft.managedRestaurantIds);
      setUsers((prev) => prev.map((u) => u.uid === user.uid
        ? { ...u, roles: draft.roles, role: primaryRole, managedSynagogueIds: draft.managedSynagogueIds, managedRestaurantIds: draft.managedRestaurantIds }
        : u
      ));
      Alert.alert('✓ נשמר', 'הגדרות המשתמש עודכנו');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>{loading ? '...' : `${users.length} משתמשים רשומים`}</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
        <TextInput scrollEnabled={false}
          style={styles.searchInput}
          placeholder="חפש לפי שם או אימייל..."
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} size="large" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
          {filtered.length === 0 && <Text style={styles.empty}>לא נמצאו משתמשים</Text>}
          {filtered.map((user) => {
            const isExpanded = expandedUid === user.uid;
            const isSaving   = saving === user.uid;
            const draft      = getDraft(user);
            const subList    = getSubList(user.uid);
            const pillInfo   = getPillInfo(draft);

            const showSynList  = draft.roles.includes('gabbai') && synagogues.length > 0;
            const showRestList = draft.roles.includes('business_manager') && restaurants.length > 0;

            return (
              <View key={user.uid} style={styles.userCard}>
                {/* ── Collapsed header ── */}
                <TouchableOpacity style={styles.userRow} onPress={() => handleExpand(user)} activeOpacity={0.8}>
                  <View style={[styles.avatar, { backgroundColor: pillInfo.color + '22' }]}>
                    <Text style={styles.avatarText}>
                      {(user.displayName ?? user.email ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.displayName ?? '—'}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                  <View style={styles.userRight}>
                    <View style={[styles.rolePill, { backgroundColor: pillInfo.color + '22', borderColor: pillInfo.color }]}>
                      <Text style={[styles.rolePillText, { color: pillInfo.color }]}>{pillInfo.label}</Text>
                    </View>
                    {isSaving
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                    }
                  </View>
                </TouchableOpacity>

                {/* ── Expanded editor ── */}
                {isExpanded && (
                  <View style={styles.editor}>
                    <Text style={styles.editorLabel}>תפקידים (ניתן לבחור מספר)</Text>
                    <View style={styles.rolesGrid}>
                      {ROLES.map((r) => {
                        const active     = draft.roles.includes(r.key);
                        const isListRole = LIST_ROLES.has(r.key);
                        const itemCount  = r.key === 'gabbai'
                          ? draft.managedSynagogueIds.length
                          : r.key === 'business_manager'
                            ? draft.managedRestaurantIds.length
                            : 0;
                        const hasItems   = itemCount > 0;

                        // Three states for list-roles; two states for others
                        const fullFill   = active && (!isListRole || hasItems);
                        const borderOnly = active && isListRole && !hasItems;

                        return (
                          <View key={r.key} style={styles.chipWrapper}>
                            <TouchableOpacity
                              style={[
                                styles.roleChip,
                                fullFill   && { backgroundColor: r.color, borderColor: r.color },
                                borderOnly && { borderColor: r.color, borderWidth: 2, backgroundColor: r.color + '15' },
                              ]}
                              onPress={() => toggleRole(user, r.key)}
                              disabled={isSaving}
                            >
                              <Ionicons
                                name={r.icon as any}
                                size={13}
                                color={fullFill ? Colors.white : r.color}
                              />
                              <Text style={[
                                styles.roleChipText,
                                fullFill   && { color: Colors.white },
                                borderOnly && { color: r.color },
                              ]}>
                                {r.label}
                              </Text>
                            </TouchableOpacity>
                            {isListRole && active && hasItems && (
                              <View style={styles.chipBadge}>
                                <Text style={styles.chipBadgeText}>{itemCount}</Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    {/* ── Synagogue sub-list (גבאי) ── */}
                    {showSynList && (
                      <View style={styles.subListSection}>
                        <TouchableOpacity
                          style={styles.subListHeader}
                          onPress={() => setSubLists((prev) => ({
                            ...prev,
                            [user.uid]: { ...(prev[user.uid] ?? { syn: false, rest: false }), syn: !subList.syn },
                          }))}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="business-outline" size={15} color={Colors.primaryLight} />
                          <Text style={[styles.subListTitle, { color: Colors.primaryLight }]}>בתי כנסת מנוהלים</Text>
                          <Text style={styles.subListCount}>
                            {draft.managedSynagogueIds.length > 0 ? `${draft.managedSynagogueIds.length} נבחרו` : 'לא נבחר'}
                          </Text>
                          <Ionicons name={subList.syn ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                        {subList.syn && synagogues.map((syn) => {
                          const assigned = draft.managedSynagogueIds.includes(syn.id);
                          return (
                            <TouchableOpacity
                              key={syn.id}
                              style={[styles.assignRow, assigned && styles.assignRowActive]}
                              onPress={() => toggleSynagogue(user, syn.id)}
                              disabled={isSaving}
                            >
                              <Ionicons name={assigned ? 'checkbox' : 'square-outline'} size={20} color={assigned ? Colors.primary : Colors.textMuted} />
                              <Text style={[styles.assignLabel, assigned && styles.assignLabelActive]}>{syn.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* ── Restaurant sub-list (מנהל עסק) ── */}
                    {showRestList && (
                      <View style={styles.subListSection}>
                        <TouchableOpacity
                          style={styles.subListHeader}
                          onPress={() => setSubLists((prev) => ({
                            ...prev,
                            [user.uid]: { ...(prev[user.uid] ?? { syn: false, rest: false }), rest: !subList.rest },
                          }))}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="restaurant-outline" size={15} color={Colors.kosher} />
                          <Text style={[styles.subListTitle, { color: Colors.kosher }]}>עסקים מנוהלים</Text>
                          <Text style={styles.subListCount}>
                            {draft.managedRestaurantIds.length > 0 ? `${draft.managedRestaurantIds.length} נבחרו` : 'לא נבחר'}
                          </Text>
                          <Ionicons name={subList.rest ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                        {subList.rest && restaurants.map((rest) => {
                          const assigned = draft.managedRestaurantIds.includes(rest.id);
                          return (
                            <TouchableOpacity
                              key={rest.id}
                              style={[styles.assignRow, assigned && styles.assignRowActive]}
                              onPress={() => toggleRestaurant(user, rest.id)}
                              disabled={isSaving}
                            >
                              <Ionicons name={assigned ? 'checkbox' : 'square-outline'} size={20} color={assigned ? Colors.kosher : Colors.textMuted} />
                              <Text style={[styles.assignLabel, assigned && { color: Colors.kosher, fontWeight: '600' }]}>{rest.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* ── Save button ── */}
                    <TouchableOpacity
                      style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
                      onPress={() => handleSave(user)}
                      disabled={isSaving}
                    >
                      {isSaving
                        ? <ActivityIndicator color={Colors.white} size="small" />
                        : <><Ionicons name="save-outline" size={16} color={Colors.white} /><Text style={styles.saveBtnText}>שמור שינויים</Text></>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.background },
  header:            { backgroundColor: Colors.danger, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  subtitle:          { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  searchBar:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.cardBackground, margin: Spacing.md, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:       { flex: 1, fontSize: 15, color: Colors.text },
  empty:             { textAlign: 'center', color: Colors.textMuted, marginTop: 40, fontSize: 16 },
  userCard:          { backgroundColor: Colors.cardBackground, borderRadius: Radius.md, marginBottom: Spacing.md, overflow: 'hidden', ...Shadow.card },
  userRow:           { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  avatar:            { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText:        { fontSize: 18, fontWeight: '800', color: Colors.primary },
  userInfo:          { flex: 1 },
  userName:          { fontSize: 15, fontWeight: '700', color: Colors.text },
  userEmail:         { fontSize: 12, color: Colors.textSecondary },
  userRight:         { alignItems: 'flex-end', gap: 4 },
  rolePill:          { borderRadius: Radius.full, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText:      { fontSize: 10, fontWeight: '700' },
  editor:            { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, backgroundColor: Colors.background },
  editorLabel:       { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  rolesGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md, paddingTop: 8 },
  chipWrapper:       { position: 'relative' },
  roleChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border },
  roleChipText:      { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  chipBadge:         { position: 'absolute', top: -7, right: -7, backgroundColor: Colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: Colors.background },
  chipBadgeText:     { fontSize: 9, fontWeight: '900', color: Colors.white },
  subListSection:    { marginBottom: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  subListHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 10, backgroundColor: Colors.cardBackground },
  subListTitle:      { flex: 1, fontSize: 13, fontWeight: '700' },
  subListCount:      { fontSize: 11, color: Colors.textMuted },
  assignRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  assignRowActive:   { backgroundColor: Colors.primary + '11' },
  assignLabel:       { fontSize: 14, color: Colors.textSecondary },
  assignLabelActive: { color: Colors.primary, fontWeight: '600' },
  saveBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, borderRadius: Radius.md, paddingVertical: 12, marginTop: Spacing.md },
  saveBtnText:       { fontSize: 15, fontWeight: '700', color: Colors.white },
});
