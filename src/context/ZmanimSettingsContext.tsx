import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ZmanimSettings, PRESET_RAV_OVADIA } from '../utils/zmanim';

const SETTINGS_KEY = '@zmanim_settings';
const GPS_KEY      = '@gps_location';

export interface GpsLocation {
  lat: number;
  lon: number;
  name: string;
  timezone: string;
}

interface ZmanimSettingsContextValue {
  settings: ZmanimSettings;
  setSettings: (s: ZmanimSettings) => Promise<void>;
  gpsLocation: GpsLocation | null;
  setGpsLocation: (loc: GpsLocation | null) => Promise<void>;
}

const ZmanimSettingsContext = createContext<ZmanimSettingsContextValue>({
  settings: PRESET_RAV_OVADIA,
  setSettings: async () => {},
  gpsLocation: null,
  setGpsLocation: async () => {},
});

export function ZmanimSettingsProvider({ children }: { children: ReactNode }) {
  const [settings,     setSettingsState] = useState<ZmanimSettings>(PRESET_RAV_OVADIA);
  const [gpsLocation,  setGpsState]      = useState<GpsLocation | null>(null);

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

  async function setGpsLocation(loc: GpsLocation | null) {
    setGpsState(loc);
    if (loc) await AsyncStorage.setItem(GPS_KEY, JSON.stringify(loc));
    else     await AsyncStorage.removeItem(GPS_KEY);
  }

  return (
    <ZmanimSettingsContext.Provider value={{ settings, setSettings, gpsLocation, setGpsLocation }}>
      {children}
    </ZmanimSettingsContext.Provider>
  );
}

export function useZmanimSettings() {
  return useContext(ZmanimSettingsContext);
}
