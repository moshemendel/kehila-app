import { useMemo } from 'react';
import { useCity } from './useCity';
import { useZmanimSettings } from '../context/ZmanimSettingsContext';
import { useAppForegroundTick } from './useAppForegroundTick';
import { calcZmanim, ZmanimResult } from '../utils/zmanim';

/**
 * Returns today's ZmanimResult for the given cityId, or null while loading.
 * Re-computes when the city document or settings change, and also whenever the
 * app returns to the foreground — otherwise `new Date()` below is only ever
 * evaluated once at first mount and the result stays frozen for the entire
 * app session, including across a background/resume the next day.
 */
export function useTodayZmanim(cityId: string): ZmanimResult | null {
  const { city } = useCity(cityId);
  const { settings } = useZmanimSettings();
  const foregroundTick = useAppForegroundTick();

  return useMemo(() => {
    if (!city) return null;
    return calcZmanim(
      new Date(),
      city.latitude,
      city.longitude,
      settings,
      city.timezone || 'Asia/Jerusalem',
      0, // elevation always sea-level per Rav Ovadia
      0, // mountainAngle: ZmanimScreen computes daily; home widget uses astronomical netz
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, settings, foregroundTick]);
}
