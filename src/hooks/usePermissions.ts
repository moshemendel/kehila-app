import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ReportEntityType } from '../types';
import { CONTENT_ROLES } from '../utils/roles';

export interface EditDestination {
  route: string;
  /** Shown only when there is more than one, so the choice names itself. */
  label: string;
}

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
   * Every management screen this account may open for this listing — empty
   * when it has no business editing it at all.
   *
   * A list, because an account can hold more than one capability over the same
   * listing and they do not live on the same screen. A kosher_manager reviews
   * certificates across the city; an owner runs one shop's hours, gallery and
   * promotions. Someone who is both, on their own shop, may do both — the
   * rules already grant the union of the field groups — and answering with a
   * single destination silently dropped whichever came second, so the kashrut
   * manager who owned a business could edit everything about it except its
   * kashrut.
   */
  editRoutesFor: (
    entityType: ReportEntityType,
    entityId: string,
    entityCityId: string,
    createdBy?: string,
  ) => EditDestination[];
}



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
    // Mirrors managesContentIn() in firestore.rules: a content_admin has a
    // city_admin's reach over everything the app publishes, and none of their
    // authority over accounts. Nothing here gates accounts, so the two are the
    // same function for this file's purposes.
    const managesContentIn    = (c: string) => isAdminOf(c) || hasCityRole('content_admin', c);

    function editRoutesFor(
      entityType: ReportEntityType,
      entityId: string,
      entityCityId: string,
      createdBy?: string,
    ): EditDestination[] {
      // Demo mode never reaches Firestore, so there is nothing for the rules to
      // reject — showing the management UI is the point of the demo.
      const admin = isDemo
        ? roles.some((r) => CONTENT_ROLES.includes(r as never))
        : managesContentIn(entityCityId);
      if (!isDemo && (isGuest || !appUser)) return [];

      switch (entityType) {
        case 'synagogue':
          return admin || (hasRole('gabbai') && synIds.includes(entityId))
            ? [{ route: 'ManageSynagogue', label: 'עריכת בית הכנסת' }] : [];

        case 'business': {
          const out: EditDestination[] = [];
          // The shop's own screen — hours, gallery, promotions. Being listed in
          // managedRestaurantIds is what makes an account its operator, whatever
          // else it is, which is the rule ManageBusinessScreen already applies
          // to itself.
          if (admin || bizIds.includes(entityId)) {
            out.push({ route: 'ManageBusiness', label: 'עריכת פרטי העסק' });
          }
          // City-wide certificate review reaches every business, but only its
          // certificates, mashgiach and the identity they are issued against.
          if (admin || hasCityRole('kosher_manager', entityCityId)) {
            out.push({ route: 'ManageKosher', label: 'עריכת כשרות' });
          }
          return out;
        }

        case 'mikveh':
          return admin || hasCityRole('mikveh_manager', entityCityId)
            ? [{ route: 'ManageMikveh', label: 'עריכת המקווה' }] : [];
        case 'gemach':
          // Whoever submitted a gemach keeps the right to correct it.
          return admin || (!!createdBy && createdBy === uid)
            ? [{ route: 'ManageGemach', label: 'עריכת הגמ"ח' }] : [];
        case 'event':
          return admin || hasCityRole('event_manager', entityCityId)
            ? [{ route: 'ManageEvents', label: 'עריכת האירוע' }] : [];
        default:
          return [];
      }
    }

    return { editRoutesFor };
  }, [appUser, isDemo, isGuest]);
}
