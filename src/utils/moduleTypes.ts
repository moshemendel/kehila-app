// Hook-free module types. Kept apart from modules.ts (which imports React hooks
// that import src/types) so src/types can depend on these without an import cycle.
import type { ModuleKey } from './moduleKeys';

export type ModuleState = 'live' | 'soon' | 'off';

export type CityModules = Partial<Record<ModuleKey, ModuleState>>;
