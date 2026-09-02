import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { Colors } from './theme';
import catalogue from './moduleCatalogue.json';
import type { ModuleKey } from './moduleKeys';

interface CatalogueEntry {
  key: ModuleKey;
  kind: 'section' | 'feature';
  label: string;
  hint: string;
  icon?: string;
  color?: string;
  soonText?: string;
}

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
// The one place a module is declared is src/utils/moduleCatalogue.json, and
// ModuleKey is generated from it — see scripts/sync-catalogue.mjs. That script
// also publishes the catalogue to Firestore, which is where the admin console
// reads it from, so the console never keeps a list that can fall out of step
// with this one.
export type { ModuleKey } from './moduleKeys';

export type ModuleState = 'live' | 'soon' | 'off';

export type CityModules = Partial<Record<ModuleKey, ModuleState>>;

/**
 * What a held-back section says for itself, read off the catalogue rather than
 * restated here. Only sections have this — they are the only modules that can
 * put a whole screen in front of someone.
 */
const COLORS: Record<string, string> = {
  primary: Colors.primary, kosher: Colors.kosher, mikveh: Colors.mikveh,
  events: Colors.events, gold: Colors.gold, shacharit: Colors.shacharit,
  gemach: '#B06B3A',
};

export const MODULE_INFO: Partial<Record<ModuleKey, {
  title: string; description: string; icon: string; color: string;
}>> = Object.fromEntries(
  (catalogue as CatalogueEntry[])
    .filter((m) => m.kind === 'section')
    .map((m) => [m.key, {
      title: m.label,
      description: m.soonText ?? '',
      icon: m.icon ?? 'time-outline',
      color: COLORS[m.color ?? 'primary'] ?? Colors.primary,
    }]),
) as Partial<Record<ModuleKey, { title: string; description: string; icon: string; color: string }>>;

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
