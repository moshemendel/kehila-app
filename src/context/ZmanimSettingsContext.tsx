import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ZmanimSettings, PRESET_RAV_OVADIA } from '../utils/zmanim';
import { cityZmanimSettings } from '../utils/zmanimProfile';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';

const SETTINGS_KEY = '@zmanim_settings';
const GPS_KEY      = '@gps_location';

export interface GpsLocation {
  lat: number;
  lon: number;
  name: string;
  timezone: string;
}

interface ZmanimSettingsContextValue {
  /** What this resident's own zmanim views use: their choice, else the city's. */
  settings: ZmanimSettings;
  /** The resident's saved choice; null while they follow the city. */
  userSettings: ZmanimSettings | null;
  /** The browsed city's method (אור החיים when the city set none). */
  citySettings: ZmanimSettings;
  followsCity: boolean;
  setSettings: (s: ZmanimSettings) => Promise<void>;
  /** Drop the personal choice and follow the city again. */
  resetToCity: () => Promise<void>;
  gpsLocation: GpsLocation | null;
  setGpsLocation: (loc: GpsLocation | null) => Promise<void>;
}

const ZmanimSettingsContext = createContext<ZmanimSettingsContextValue>({
  settings: PRESET_RAV_OVADIA,
  userSettings: null,
  citySettings: PRESET_RAV_OVADIA,
  followsCity: true,
  setSettings: async () => {},
  resetToCity: async () => {},
  gpsLocation: null,
  setGpsLocation: async () => {},
});

export function ZmanimSettingsProvider({ children }: { children: ReactNode }) {
  const [userSettings, setSettingsState] = useState<ZmanimSettings | null>(null);
  const [gpsLocation,  setGpsState]      = useState<GpsLocation | null>(null);
  const cityId = useCityId();
  const { city } = useCity(cityId);
  const citySettings = useMemo(() => cityZmanimSettings(city), [city]);
  // Stable identity unless the answer changed: ZmanimContext and every screen
  // memoise on this, and a fresh object each render would recompute them all.
  const settings = userSettings ?? citySettings;

  useEffect(() => {
    AsyncStorage.multiGet([SETTINGS_KEY, GPS_KEY]).then(([[, rawSettings], [, rawGps]]) => {
      if (rawSettings) { try { setSettingsState(JSON.parse(rawSettings)); } catch {} }
      if (rawGps)      { try { setGpsState(JSON.parse(rawGps)); }           catch {} }
    });
  }, []);

  async function setSettings(s: ZmanimSettings) {
    setSettingsState(s);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  async function resetToCity() {
    setSettingsState(null);
    await AsyncStorage.removeItem(SETTINGS_KEY);
  }

  async function setGpsLocation(loc: GpsLocation | null) {
    setGpsState(loc);
    if (loc) await AsyncStorage.setItem(GPS_KEY, JSON.stringify(loc));
    else     await AsyncStorage.removeItem(GPS_KEY);
  }

  return (
    <ZmanimSettingsContext.Provider value={{
      settings, userSettings, citySettings, followsCity: !userSettings,
      setSettings, resetToCity, gpsLocation, setGpsLocation,
    }}>
      {children}
    </ZmanimSettingsContext.Provider>
  );
}

export function useZmanimSettings() {
  return useContext(ZmanimSettingsContext);
}
