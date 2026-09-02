import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCities } from '../hooks/useCities';

/**
 * Gives a guest a city instead of letting one be assumed for them.
 *
 * A signed-in account carries its own cityId and a guest's choice is persisted
 * on the device, but a guest who has never chosen has neither — and useCityId()
 * answered that with a hardcoded 'city-1'. That was invisibly correct for as
 * long as there was exactly one city, and becomes a silent wrong answer the day
 * there are two: someone installs the app in their own town, skips the login
 * screen, and is shown another city's shuls, zmanim and eruv with nothing
 * anywhere saying so. Wrong prayer times presented confidently are worse than
 * an empty screen.
 *
 * Headless, and deliberately narrow: it only handles the case that needs no
 * asking. When exactly one city exists there is nothing to choose, so it stores
 * that one and the guest is never interrupted — which is every existing install
 * today, and every new community that starts out alone. Where a choice really
 * does exist, LoginScreen asks for it at the moment the guest declines an
 * account, and CityGpsPrompt offers to correct it later from GPS.
 *
 * Runs once per launch and writes only when the slot is genuinely empty, so it
 * can never overwrite a city someone picked.
 */
export default function GuestCityBootstrap() {
  const { isGuest, isDemo, guestCityId, switchCity } = useAuth();
  const { cities, loading } = useCities();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || isDemo || !isGuest || guestCityId || loading) return;
    if (cities.length !== 1) return;
    done.current = true;
    switchCity(cities[0].id);
  }, [isDemo, isGuest, guestCityId, loading, cities, switchCity]);

  return null;
}
