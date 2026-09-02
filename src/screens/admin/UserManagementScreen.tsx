import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { getUsersByCity, setUserRoles } from '../../services/users';
import { useSynagoguesFeed } from '../../context/SynagoguesContext';
import { useBusinessesFeed } from '../../context/BusinessesContext';
import { useCityId } from '../../hooks/useCityId';
import { AppUser, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  rolesOf, ADMIN_ROLES, ROLE_PRIORITY, BLANKET_ROLES, LIST_ROLES,
  ROLE_LABELS, ROLE_COLORS, ROLE_ICONS, assignableBy, isCityScoped, computePrimaryRole,
} from '../../utils/roles';


type UserDraft = {
  roles: UserRole[];
  managedSynagogueIds: string[];
  managedRestaurantIds: string[];
};

type SubListState = { syn: boolean; rest: boolean };


/**
 * Roles already covered by a blanket role the account holds — בכלל מאתיים מנה.
 * Offering them as a live choice is noise: ticking gabbai for a city_admin who
 * already reaches every synagogue changes nothing about what they can do.
 *
 * Greyed rather than cleared, so demoting someone out of the blanket role
 * brings back whatever they held underneath instead of silently losing it.
 */
function subsumedRoles(roles: UserRole[]): Set<UserRole> {
  const top = ROLE_PRIORITY.findIndex((r) => roles.includes(r));
  if (top === -1 || !BLANKET_ROLES.includes(ROLE_PRIORITY[top])) return new Set();
  return new Set(ROLE_PRIORITY.slice(top + 1));
}


/**
 * The pill on a collapsed row: a blanket role speaks for the whole account, a
 * single role shows its own name, anything else is a count.
 *
 * This used to special-case city_admin by name. That was the same assumption
 * that hid content_admin everywhere else — a deputy who is also a gabbai read
 * as "2 תפקידים", burying the role that actually describes them. Asking
 * BLANKET_ROLES covers city_admin, content_admin and whatever comes next.
 */
function getPillInfo(draft: UserDraft): { label: string; color: string } {
  const active = draft.roles.filter((r) => r !== 'user');
  if (active.length === 0) return { label: ROLE_LABELS.user, color: ROLE_COLORS.user };
  const top = computePrimaryRole(active);
  if (active.length === 1 || BLANKET_ROLES.includes(top)) {
    return { label: ROLE_LABELS[top], color: ROLE_COLORS[top] };
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
  const { appUser } = useAuth();
  const cityId = useCityId();
  const { synagogues } = useSynagoguesFeed();
  const { businesses } = useBusinessesFeed();

  /**
   * The roles this admin may hand out, which is now asked rather than listed.
   *
   * Two filters, for two different reasons. assignableBy() mirrors the users
   * rule: a city_admin may staff their city but not mint peers or superiors, so
   * offering city_admin here would have produced a save the server rejects.
   * isCityScoped drops super_admin and dev — not because they are too powerful
   * to appear, but because they are not about this city at all, and this screen
   * only ever manages one.
   */
  const assignableRoles = useMemo(
    () => assignableBy(appUser)
      .filter(isCityScoped)
      .map((key) => ({ key, label: ROLE_LABELS[key], color: ROLE_COLORS[key], icon: ROLE_ICONS[key] })),
    [appUser],
  );

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

  // Mirrors the users update rule: the viewer's own account is off limits to
  // them, and a city_admin may not touch an account that already holds
  // authority. Both were listed anyway, offering an editor whose save the
  // server would refuse — so the list now shows only who this viewer can act on.
  const viewerRoles   = rolesOf(appUser);
  const viewerIsSuper = viewerRoles.includes('super_admin') || viewerRoles.includes('dev');
  const editable = users.filter((u) => {
    if (u.uid === appUser?.uid) return false;
    if (viewerIsSuper) return true;
    return !rolesOf(u).some((r) => ADMIN_ROLES.includes(r as UserRole));
  });

  const filtered = editable.filter((u) =>
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
        <Text style={styles.subtitle}>{loading ? '...' : `${editable.length} משתמשים`}</Text>
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

            const subsumed     = subsumedRoles(draft.roles);
            const showSynList  = draft.roles.includes('gabbai') && synagogues.length > 0;
            const showRestList = draft.roles.includes('business_manager') && businesses.length > 0;

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
                      {assignableRoles.map((r) => {
                        const active     = draft.roles.includes(r.key);
                        const isListRole = LIST_ROLES.has(r.key);
                        const covered    = !active && subsumed.has(r.key);
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
                                covered    && styles.roleChipCovered,
                              ]}
                              onPress={() => toggleRole(user, r.key)}
                              disabled={isSaving || covered}
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
                        {subList.rest && businesses.map((rest) => {
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
  roleChipCovered: { opacity: 0.35 },
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
