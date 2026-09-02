import { AppUser, UserRole } from '../types';
import { Colors } from './theme';
import catalogue from './roleCatalogue.json';

/**
 * Everything the app knows about roles, from the one file that declares them.
 *
 * Seven screens and services each re-derived `['city_admin','super_admin','dev']`
 * inline, and they had already drifted: some read the `roles` array, one read
 * the singular `role`, and the rules read a third thing. That drift is what hid
 * a gabbai's missing permissions until a save bounced, so a new role is not
 * worth adding by copying the list an eighth time.
 *
 * The lists moved here; the labels did not, and they drifted next — three
 * copies (this app's profile screen, its management screen, the admin console)
 * disagreeing on what a city_admin is even called, and the console missing
 * content_admin outright. So the source is now src/utils/roleCatalogue.json,
 * which scripts/sync-catalogue.mjs both generates the UserRole union from and
 * publishes to Firestore for the console to render. Adding a role is editing
 * that file and running that script.
 *
 * WHAT THIS FILE IS NOT: authorisation. firestore.rules decides what an account
 * may actually do, and it hardcodes its own role names deliberately — a
 * security rule that fetched its list at runtime could be widened by editing a
 * document. These flags mirror the rules so the UI stops short of offering
 * something the server will refuse; they never grant anything. Change a rule
 * and you must change the flag here to match, not the other way round.
 */
export interface RoleEntry {
  key: UserRole;
  label: string;
  /** What the holder is called on their own profile, where a longer, more
   *  specific name reads better than a picker label. Falls back to `label`. */
  selfLabel?: string;
  color: string;
  icon: string;
  /** The least-privileged actor who may grant it — mirrors grantsAuthority(). */
  assignableBy: 'city_admin' | 'super_admin';
  /**
   * 'city' roles belong to one city and are staffed by its own admin; 'global'
   * ones (super_admin, dev) span every city and are not offered in city-facing
   * pickers at all. The distinction is not privilege — city_admin is powerful
   * and still city-scoped — it is whose city the role is about.
   */
  scope: 'city' | 'global';
  /** Subsumes the roles below it, so offering those alongside is noise. */
  blanket: boolean;
  /** Authority over other accounts and the city record — mirrors ADMIN_ROLES. */
  authority: boolean;
  /** Authority over published content — mirrors managesContentIn(). */
  content: boolean;
  /** Needs specific items assigned to it before it means anything. */
  manages?: 'synagogues' | 'businesses';
}

export const ROLE_CATALOGUE = catalogue as RoleEntry[];

/** Colour tokens by name, so the catalogue stays free of hex codes and the
 *  console can map the same names onto its own palette. */
const COLORS: Record<string, string> = {
  slate: Colors.textSecondary,
  primaryLight: Colors.primaryLight,
  warning: Colors.warning,
  success: Colors.success,
  kosher: Colors.kosher,
  mikveh: Colors.mikveh,
  events: Colors.events,
  gold: Colors.gold,
  danger: Colors.danger,
};

const by = <T,>(pick: (e: RoleEntry) => T): Record<UserRole, T> =>
  Object.fromEntries(ROLE_CATALOGUE.map((e) => [e.key, pick(e)])) as Record<UserRole, T>;

export const ROLE_LABELS = by((e) => e.label);
/** For a person looking at their own account. */
export const ROLE_SELF_LABELS = by((e) => e.selfLabel ?? e.label);
export const ROLE_COLORS = by((e) => COLORS[e.color] ?? Colors.textSecondary);
export const ROLE_ICONS = by((e) => e.icon);

/**
 * Highest authority first. Only used to collapse a role set down to the single
 * `role` field kept for auth checks — it orders which label wins, not what
 * implies what.
 */
export const ROLE_PRIORITY: UserRole[] = ROLE_CATALOGUE.map((e) => e.key);

/** Authority over accounts and the city record. Never content_admin. */
export const ADMIN_ROLES: UserRole[] = ROLE_CATALOGUE.filter((e) => e.authority).map((e) => e.key);

/** Authority over everything the app publishes. */
export const CONTENT_ROLES: UserRole[] = ROLE_CATALOGUE.filter((e) => e.content).map((e) => e.key);

/**
 * The roles that carry everything beneath them.
 *
 * Deliberately not "everything lower in ROLE_PRIORITY" — that orders which
 * label to show on the pill, not what implies what. event_manager sits above
 * kosher_manager there, but an events manager holds no kashrut authority; those
 * are parallel specialisms, not rungs.
 */
export const BLANKET_ROLES: UserRole[] = ROLE_CATALOGUE.filter((e) => e.blanket).map((e) => e.key);

/** Roles that mean nothing until specific synagogues or businesses are assigned. */
export const LIST_ROLES = new Set<UserRole>(
  ROLE_CATALOGUE.filter((e) => e.manages).map((e) => e.key),
);

/**
 * An account's roles, matching userRoles() in firestore.rules: the array when
 * it has one, the singular field for profiles predating it.
 */
export function rolesOf(user: AppUser | null | undefined): string[] {
  return user?.roles ?? (user?.role ? [user.role] : []);
}

/**
 * May manage other people's accounts, and the city itself.
 *
 * The narrower of the two, and the reason content_admin exists: everything that
 * looked like it needed a hierarchy of admins — who may appoint whom, who may
 * not demote whom — is authority over accounts, not over content.
 */
export function isAdminRole(user: AppUser | null | undefined): boolean {
  return rolesOf(user).some((r) => ADMIN_ROLES.includes(r as UserRole));
}

/**
 * May manage published content: synagogues, businesses, mikvaot, events, eruv,
 * gemachs. Mirrors managesContentIn() in firestore.rules.
 *
 * City scope is the caller's to apply where it matters — the rules pin a
 * city_admin and a content_admin to their homeCityId, and screens working from
 * a single city's collection are already scoped by their data.
 */
export function managesContent(user: AppUser | null | undefined): boolean {
  return rolesOf(user).some((r) => CONTENT_ROLES.includes(r as UserRole));
}

/** Unscoped — administers every city. */
export function isSuperAdmin(user: AppUser | null | undefined): boolean {
  return rolesOf(user).some((r) => r === 'super_admin' || r === 'dev');
}

/**
 * Which roles this account may grant to someone else.
 *
 * A city_admin may staff their city but not mint peers or superiors, which is
 * exactly what the users rule enforces via grantsAuthority() — so the picker
 * offers what the server will accept and nothing more. Anyone who is neither
 * gets an empty list rather than a default: a screen that can't establish who
 * is asking should offer nothing, not the city_admin set.
 */
export function assignableBy(user: AppUser | null | undefined): UserRole[] {
  if (isSuperAdmin(user)) return ROLE_PRIORITY;
  if (isAdminRole(user)) {
    return ROLE_CATALOGUE.filter((e) => e.assignableBy === 'city_admin').map((e) => e.key);
  }
  return [];
}

/** Belongs to one city, rather than spanning all of them. */
export function isCityScoped(role: UserRole): boolean {
  return ROLE_CATALOGUE.find((e) => e.key === role)?.scope !== 'global';
}

/** Collapses a role set to the single `role` field kept for auth checks. */
export function computePrimaryRole(roles: UserRole[]): UserRole {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? 'user';
}
