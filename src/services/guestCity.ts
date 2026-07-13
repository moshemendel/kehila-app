import AsyncStorage from '@react-native-async-storage/async-storage';

// A guest has no Firestore user doc to store cityId on (unlike a real
// account), and anonymous sessions don't persist across an explicit sign-out
// (a fresh anon uid is created each time) — so this is stored locally,
// keyed to the device rather than any particular guest session.
const GUEST_CITY_KEY = '@guest_city_id_v1';

export async function getGuestCityId(): Promise<string | null> {
  return AsyncStorage.getItem(GUEST_CITY_KEY);
}

export async function setGuestCityId(cityId: string): Promise<void> {
  await AsyncStorage.setItem(GUEST_CITY_KEY, cityId);
}
