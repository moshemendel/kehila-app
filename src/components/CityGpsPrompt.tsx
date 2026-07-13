import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useCityId } from '../hooks/useCityId';
import { useCities } from '../hooks/useCities';
import { useAppForegroundTick } from '../hooks/useAppForegroundTick';

const DISMISSED_KEY = '@city_gps_prompt_dismissed_v1';

// Headless — on each app-foreground, silently checks whether the device's GPS
// location is in a different city than the one currently being browsed, and
// offers to switch (reusing the same fuzzy name-matching as CityPicker's own
// "detect my location" button). If GPS points somewhere with no matching city
// in the system, says so instead. Never prompts for OS location permission
// more than once, and never re-asks about the same detected place twice in a
// row — remembered locally across app restarts.
export default function CityGpsPrompt() {
  const { isDemo, switchCity } = useAuth();
  const currentCityId = useCityId();
  const { cities } = useCities();
  const foregroundTick = useAppForegroundTick();
  const checking = useRef(false);

  useEffect(() => {
    if (isDemo || cities.length === 0 || checking.current) return;
    checking.current = true;

    (async () => {
      try {
        const { status: current } = await Location.getForegroundPermissionsAsync();
        let status = current;
        if (status === Location.PermissionStatus.UNDETERMINED) {
          status = (await Location.requestForegroundPermissionsAsync()).status;
        }
        if (status !== 'granted') return;

        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const [place] = await Location.reverseGeocodeAsync(pos.coords);
        const detectedName = (place?.city ?? place?.subregion ?? place?.district ?? '').trim();
        if (!detectedName) return;

        const lower = detectedName.toLowerCase();
        const match = cities.find((c) =>
          c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
        );

        // Already browsing the detected city — nothing to offer.
        if (match && match.id === currentCityId) return;

        const dismissKey = match ? match.id : `unmatched:${lower}`;
        if ((await AsyncStorage.getItem(DISMISSED_KEY)) === dismissKey) return;

        if (match) {
          Alert.alert(
            'שינוי מיקום',
            `שלום! שמנו לב שאתה נמצא ב${match.name}. האם תרצה לראות את המידע עבור העיר הזו?`,
            [
              { text: 'לא תודה', style: 'cancel', onPress: () => AsyncStorage.setItem(DISMISSED_KEY, dismissKey) },
              {
                text: 'כן, עדכן',
                onPress: () => {
                  AsyncStorage.setItem(DISMISSED_KEY, dismissKey);
                  switchCity(match.id);
                },
              },
            ],
          );
        } else {
          Alert.alert(
            'שירות עדיין לא זמין',
            `שלום! שמנו לב שאתה נמצא ב${detectedName}. לצערנו השירות עדיין לא זמין ב${detectedName}.`,
            [{ text: 'הבנתי', onPress: () => AsyncStorage.setItem(DISMISSED_KEY, dismissKey) }],
          );
        }
      } catch {
        // Fail silently — this is a nice-to-have, never a hard requirement.
      } finally {
        checking.current = false;
      }
    })();
  }, [foregroundTick, cities, currentCityId, isDemo, switchCity]);

  return null;
}
