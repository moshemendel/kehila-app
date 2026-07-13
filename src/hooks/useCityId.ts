import { useAuth } from '../context/AuthContext';
import { DEMO_USER } from '../context/AuthContext';

// Returns the active city ID — from real appUser, demo user, a guest's
// locally-persisted override (guests have no Firestore doc to store one on),
// or the hardcoded fallback.
export function useCityId(): string {
  const { appUser, isDemo, isGuest, guestCityId } = useAuth();
  if (isDemo) return DEMO_USER.cityId;
  if (appUser?.cityId) return appUser.cityId;
  if (isGuest && guestCityId) return guestCityId;
  return 'city-1';
}
