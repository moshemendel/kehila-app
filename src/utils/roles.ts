import { AppUser, UserRole } from '../types';

/**
 * The two questions worth asking about an account, in one place.
 *
 * Seven screens and services each re-derived `['city_admin','super_admin','dev']`
 * inline, and they had already drifted: some read the `roles` array, one read
 * the singular `role`, and the rules read a third thing. That drift is what hid
 * a gabbai's missing permissions until a save bounced, so a new role is not
 * worth adding by copying the list an eighth time.
 */

/** Authority over accounts and the city record. Never content_admin. */
export const ADMIN_ROLES: UserRole[] = ['city_admin', 'super_admin', 'dev'];

/** Authority over everything the app publishes. */
export const CONTENT_ROLES: UserRole[] = [...ADMIN_ROLES, 'content_admin'];

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
