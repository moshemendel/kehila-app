import { useAuth } from '../context/AuthContext';
import { DEMO_USER } from '../context/AuthContext';

/**
 * The last resort, and only that.
 *
 * Every real path answers before reaching it: an account carries its own
 * cityId, demo mode carries one, a guest's choice is persisted on the device,
 * a single-city install has that city stored silently at launch
 * (GuestCityBootstrap), and a guest declining an account where several cities
 * exist is asked outright (LoginScreen). What is left is the handful of frames
 * between launch and any of that resolving, which is why a constant is still
 * the right shape here — a hook used by this many screens has to answer
 * synchronously or they all need loading states for a question that is about
 * to be answered anyway.
 *
 * It is named rather than inlined because it is a real assumption with a real
 * failure mode: it was written when there was one city, read as obviously
 * correct, and would have shown a second city's residents Maale Adumim's
 * prayer times without a word. If this app ever ships without city-1 in it,
 * this is the line that has to change.
 */
export const FALLBACK_CITY_ID = 'city-1';

// Returns the active city ID — from real appUser, demo user, a guest's
// locally-persisted override (guests have no Firestore doc to store one on),
// or the fallback above.
export function useCityId(): string {
  const { appUser, isDemo, isGuest, guestCityId } = useAuth();
  if (isDemo) return DEMO_USER.cityId;
  if (appUser?.cityId) return appUser.cityId;
  if (isGuest && guestCityId) return guestCityId;
  return FALLBACK_CITY_ID;
}
