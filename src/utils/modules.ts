import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { Colors } from './theme';

/**
 * Which parts of the app a city offers, decided per city in its own document.
 *
 * This started as three booleans in the source, which made releasing a feature
 * a code change that released it everywhere at once. That is the wrong shape
 * for what is actually being decided. Whether a city's kashrut certificates
 * have been verified, whether its mikveh attendants take bookings, whether it
 * runs a gemach registry or maintains an eruv at all — these are facts about
 * that city. A second city onboarding should not wait for a release, and should
 * not inherit the first city's answers.
 *
 * THREE STATES, because "not yet" and "not here" are different things and
 * showing the wrong one is its own bug:
 *
 *   'live'  the section works. The default, so a city nobody has configured
 *           gets the whole app and adding a module later cannot silently
 *           switch it off everywhere.
 *   'soon'  built, held back, and *still visible* — the entry point stays
 *           where people expect it and says when it is coming, so nobody hunts
 *           for a screen that quietly vanished or reports it as broken.
 *   'off'   this city does not offer it. Gone from the tabs, the home shortcuts,
 *           the More screen and the search filters — not hidden behind a label
 *           that promises something never arriving.
 *
 * Stored on the city document:
 *
 *   modules: { Gemach: 'off', Businesses: 'soon' }
 */
export type ModuleKey =
  // Tab-level sections. The key is the tab's own name, which is what makes
  // filtering the navigator, the home shortcuts and the More screen exact
  // rather than a second list to keep in step.
  | 'Synagogues'
  | 'PrayerTimes'
  | 'Zmanim'
  | 'Businesses'
  | 'Mikveh'
  | 'Events'
  | 'Eruv'
  | 'Gemach'
  | 'Selichot'
  // Features inside a section, which a city can hold back without losing the
  // section around them.
  | 'mikvehBooking'
  | 'zmanimSettings';

export type ModuleState = 'live' | 'soon' | 'off';

export type CityModules = Partial<Record<ModuleKey, ModuleState>>;

/**
 * What a held-back section says for itself.
 *
 * Only needed for the tab-level ones, which are the only modules that can put a
 * whole screen in front of someone.
 */
export const MODULE_INFO: Partial<Record<ModuleKey, {
  title: string; description: string; icon: string; color: string;
}>> = {
  Businesses: {
    title: 'כשרות',
    description: 'מסעדות, עסקים ותעודות כשרות מתעדכנים כעת מול הרבנות.\nהמדור ייפתח לאחר אימות כל התעודות.',
    icon: 'restaurant-outline',
    color: Colors.kosher,
  },
  Mikveh: {
    title: 'מקוואות',
    description: 'פרטי המקוואות ושעות הפעילות נאספים כעת.\nהמדור ייפתח בקרוב.',
    icon: 'water-outline',
    color: Colors.mikveh,
  },
  Events: {
    title: 'אירועים',
    description: 'לוח האירועים והשיעורים של הקהילה ייפתח בקרוב.',
    icon: 'calendar-outline',
    color: Colors.events,
  },
  Eruv: {
    title: 'עירוב',
    description: 'מפת העירוב ועדכוני התקינות ייפתחו בקרוב.',
    icon: 'shield-outline',
    color: Colors.gold,
  },
  Gemach: {
    title: 'גמ"ח',
    description: 'רשימת הגמ"חים בעיר נאספת כעת ותיפתח בקרוב.',
    icon: 'gift-outline',
    color: '#B06B3A',
  },
  Selichot: {
    title: 'סליחות',
    description: 'זמני הסליחות בבתי הכנסת ייפתחו לקראת חודש אלול.',
    icon: 'moon-outline',
    color: Colors.primary,
  },
  Synagogues: {
    title: 'בתי כנסת',
    description: 'רשימת בתי הכנסת וזמני התפילות נאספים כעת.',
    icon: 'business-outline',
    color: Colors.primary,
  },
  PrayerTimes: {
    title: 'מניינים',
    description: 'לוח המניינים בעיר ייפתח בקרוב.',
    icon: 'time-outline',
    color: Colors.shacharit,
  },
  Zmanim: {
    title: 'זמנים',
    description: 'זמני היום ייפתחו בקרוב.',
    icon: 'sunny-outline',
    color: Colors.gold,
  },
};

/** This module's state in the city currently being browsed. */
export function useModule(key: ModuleKey): ModuleState {
  const cityId = useCityId();
  const { city } = useCity(cityId);
  return city?.modules?.[key] ?? 'live';
}

/**
 * Every module state at once, for the places that decide about a whole list —
 * the tab navigator, the home shortcuts, the More screen, the search filters.
 * One city read instead of one per module.
 */
export function useModules(): CityModules {
  const cityId = useCityId();
  const { city } = useCity(cityId);
  return city?.modules ?? {};
}

/** Does this city offer the section at all? 'soon' still counts as offered. */
export function isOffered(modules: CityModules, key: ModuleKey): boolean {
  return (modules[key] ?? 'live') !== 'off';
}

/** Built, but held back here. */
export function isComingSoon(modules: CityModules, key: ModuleKey): boolean {
  return modules[key] === 'soon';
}
