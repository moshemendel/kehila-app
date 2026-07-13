import { useEffect, useState } from 'react';
import { onEruvStatus, onEruvReports } from '../services/eruv';
import { EruvStatus, EruvReport } from '../types';

export function useEruvStatus(cityId: string, active = true) {
  const [status, setStatus] = useState<EruvStatus | null>(null);
  const [loading, setLoading] = useState(active);

  useEffect(() => {
    if (!cityId || !active) return;
    const unsub = onEruvStatus(cityId, (s) => {
      setStatus(s);
      setLoading(false);
    });
    return unsub;
  }, [cityId, active]);

  return { status, loading };
}

export function useEruvReports(cityId: string, active = true) {
  const [reports, setReports] = useState<EruvReport[]>([]);
  const [loading, setLoading] = useState(active);

  useEffect(() => {
    if (!cityId || !active) return;
    const unsub = onEruvReports(cityId, (r) => {
      setReports(r);
      setLoading(false);
    });
    return unsub;
  }, [cityId, active]);

  return { reports, loading };
}
