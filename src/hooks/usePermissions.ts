import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ReportEntityType } from '../types';

/**
 * Can the signed-in account edit this listing?
 *
 * A mirror of firestore.rules, deliberately. The server is the only thing that
 * actually grants access, so the value of asking here is not safety — it is
 * that an edit button should appear exactly when the save behind it will
 * succeed. A button that leads to permission-denied is worse than no button.
 *
 * Two details are easy to get wrong and are the reason this lives in one place
 * rather than being re-derived per screen:
 *
 * The roles ARRAY, with the singular field as the fallback. AppUser carries
 * both, and `role` holds only one value — the admin UI assigns a set and
 * computePrimaryRole collapses it to its highest-priority member, so a gabbai
 * who is also an event_manager is stored as role: 'event_manager'. Reading the
 * singular field alone therefore misses roles the account genuinely has; the
 * rules were doing exactly that and rejecting those saves. Both sides now read
 * the array, which the users rules already protect as privilege-bearing.
 *
 * `homeCityId`, not `cityId`. A city_admin's authority is pinned to their home
 * city; `cityId` is the freely-switchable browsing preference. Gating on the
 * latter would offer an admin an edit button on every listing in a city they
 * are merely visiting.
 */
export interface ListingPermissions {
  /**
   * The management screen this account should land on for this listing, or
   * null when it has no business editing it at all.
   *
   * A route rather than a boolean because "can edit" is not one capability for
   * a business. A kosher_manager reviews certificates across the whole city; an
   * owner runs one shop's hours, photos and promotions. Answering yes/no and
   * sending everyone to the same screen handed a kosher_manager owner-level
   * control of every business in the city — the two roles are scoped
   * differently and belong on different screens.
   */
  editRouteFor: (
    entityType: ReportEntityType,
    entityId: string,
    entityCityId: string,
    createdBy?: string,
  ) => string | null;
}

const ADMIN_ROLES = ['city_admin', 'super_admin', 'dev'];

export function usePermissions(): ListingPermissions {
  const { appUser, isDemo, isGuest } = useAuth();

  return useMemo(() => {
    // Mirrors userRoles() in firestore.rules exactly.
    const roles: string[] = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
    const hasRole    = (r: string) => roles.includes(r);
    const uid        = appUser?.uid ?? '';
    const homeCityId = appUser?.homeCityId ?? '';
    const synIds     = appUser?.managedSynagogueIds ?? [];
    const bizIds     = appUser?.managedRestaurantIds ?? [];

    // super_admin and dev are unscoped; a city_admin only administers their own.
    const isSuperAdmin        = hasRole('super_admin') || hasRole('dev');
    const isCityAdminOf       = (c: string) => hasRole('city_admin') && homeCityId === c;
    const isAdminOf           = (c: string) => isSuperAdmin || isCityAdminOf(c);
    const hasCityRole         = (r: string, c: string) => hasRole(r) && homeCityId === c;

    function editRouteFor(
      entityType: ReportEntityType,
      entityId: string,
      entityCityId: string,
      createdBy?: string,
    ): string | null {
      // Demo mode never reaches Firestore, so there is nothing for the rules to
      // reject — showing the management UI is the point of the demo.
      const admin = isDemo
        ? roles.some((r) => ADMIN_ROLES.includes(r))
        : isAdminOf(entityCityId);
      if (!isDemo && (isGuest || !appUser)) return null;

      switch (entityType) {
        case 'synagogue':
          return admin || (hasRole('gabbai') && synIds.includes(entityId))
            ? 'ManageSynagogue' : null;

        case 'business':
          // ManageBusinessScreen is the shop's own screen — hours, gallery,
          // promotions — and scopes itself to managedRestaurantIds for every
          // role, a kosher_manager included. Being assigned the business is
          // what makes someone its operator, whatever else they are.
          if (admin || bizIds.includes(entityId)) return 'ManageBusiness';
          // City-wide kashrut review reaches every business, but only its
          // certificates and mashgiach — a different screen, not a wider one.
          if (hasCityRole('kosher_manager', entityCityId)) return 'ManageKosher';
          return null;

        case 'mikveh':
          return admin || hasCityRole('mikveh_manager', entityCityId)
            ? 'ManageMikveh' : null;
        case 'gemach':
          // Whoever submitted a gemach keeps the right to correct it.
          return admin || (!!createdBy && createdBy === uid) ? 'ManageGemach' : null;
        case 'event':
          return admin || hasCityRole('event_manager', entityCityId)
            ? 'ManageEvents' : null;
        default:
          return null;
      }
    }

    return { editRouteFor };
  }, [appUser, isDemo, isGuest]);
}
