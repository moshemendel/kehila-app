import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotifSettings } from '../utils/prayerNotifications';
import { cancelAllPrayerNotifications } from '../utils/prayerNotifications';

const STORAGE_KEY = '@notif_settings';

interface NotificationsContextValue {
  enabled:    boolean;
  settings:   NotifSettings;
  setEnabled: (v: boolean)     => Promise<void>;
  setMinutesBefore: (v: number) => Promise<void>;
  togglePrayer: (p: 'shacharit' | 'mincha' | 'maariv') => Promise<void>;
}

const DEFAULTS: NotifSettings = {
  minutesBefore: 15,
  prayers: ['shacharit', 'mincha', 'maariv'],
};

const Ctx = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [enabled,  setEnabledState]  = useState(false);
  const [settings, setSettingsState] = useState<NotifSettings>(DEFAULTS);

  // Load persisted values once
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const { enabled: e, ...rest } = JSON.parse(raw);
        if (typeof e === 'boolean')     setEnabledState(e);
        if (rest.minutesBefore != null) setSettingsState((p) => ({ ...p, ...rest }));
      } catch {}
    });
  }, []);

  async function persist(nextEnabled: boolean, nextSettings: NotifSettings) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: nextEnabled, ...nextSettings }));
  }

  async function setEnabled(v: boolean) {
    setEnabledState(v);
    await persist(v, settings);
    if (!v) await cancelAllPrayerNotifications();
  }

  async function setMinutesBefore(v: number) {
    const next = { ...settings, minutesBefore: v };
    setSettingsState(next);
    await persist(enabled, next);
  }

  async function togglePrayer(p: 'shacharit' | 'mincha' | 'maariv') {
    const has  = settings.prayers.includes(p);
    const next = {
      ...settings,
      prayers: has ? settings.prayers.filter((x) => x !== p) : [...settings.prayers, p],
    };
    setSettingsState(next);
    await persist(enabled, next);
  }

  return (
    <Ctx.Provider value={{ enabled, settings, setEnabled, setMinutesBefore, togglePrayer }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be inside NotificationsProvider');
  return ctx;
}
