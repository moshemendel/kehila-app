import { useState, useEffect } from 'react';
import { subscribeKashrutConfig, KashrutConfig } from '../services/kashrutConfig';

/** Live per-city kashrut certifier lists (rabbanut + badatz). */
export function useKashrutConfig(cityId: string): KashrutConfig {
  const [config, setConfig] = useState<KashrutConfig>({ rabbanutList: [], badatzList: [] });

  useEffect(() => {
    if (!cityId) return;
    return subscribeKashrutConfig(cityId, setConfig);
  }, [cityId]);

  return config;
}
