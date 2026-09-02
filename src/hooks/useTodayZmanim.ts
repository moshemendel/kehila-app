import { useMemo } from 'react';
import { useCity } from './useCity';
import { useZmanimSettings } from '../context/ZmanimSettingsContext';
import { useAppForegroundTick } from './useAppForegroundTick';
import { useSharedZmanim } from '../context/ZmanimContext';
import { calcZmanim, ZmanimResult } from '../utils/zmanim';

/**
 * Today's ZmanimResult for the given cityId, or null while the city loads.
 *
 * Nearly every caller asks for the city being browsed, which ZmanimProvider has
 * already computed — so the common case is a context read and no work at all.
 * The local computation stays for the case that provider cannot serve: a card
 * or screen asking about some other city, which happens when an admin is
 * looking at a listing outside their own.
 *
 * Eight call sites each used to run calcZmanim independently, MikvehCard among
 * them — a per-row component, so a list of mikvaot computed the same sunset
 * once per card. Reads on a screen's first render, which is the frame a
 * transition can least afford to be late.
 */
export function useTodayZmanim(cityId: string): ZmanimResult | null {
  const shared = useSharedZmanim();
  const { city } = useCity(cityId);
  const { settings } = useZmanimSettings();
  const foregroundTick = useAppForegroundTick();

  const canShare = !!shared && shared.cityId === cityId;

  return useMemo(() => {
    if (canShare) return shared!.zmanim;
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
  }, [canShare, shared, city, settings, foregroundTick]);
}
