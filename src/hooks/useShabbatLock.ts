import { useState, useEffect } from 'react';
import { City } from '../types';
import { ZmanimSettings } from '../utils/zmanim';
import { getShabbatLock, ShabbatLockState } from '../utils/shabbatLock';

/**
 * Live Shabbat/Yom-Tov lock state. Recomputes every 30 seconds so the app
 * locks at candle-lighting and reopens at tzeit without needing a restart.
 */
export function useShabbatLock(city: City | null, settings: ZmanimSettings): ShabbatLockState {
  const [state, setState] = useState<ShabbatLockState>(() => getShabbatLock(city, settings));

  useEffect(() => {
    const tick = () => setState(getShabbatLock(city, settings));
    tick(); // immediate on mount / when city/settings change
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [city, settings]);

  return state;
}
