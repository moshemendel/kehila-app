import { useEffect, useState } from 'react';
import { onEruvStatuses, onEruvStatusById, onEruvReports } from '../services/eruv';
import { EruvStatus, EruvReport } from '../types';

/** Every eruv belonging to a tenant — one for most cities, several for a
 *  regional council. Use this to build a settlement picker, or to resolve
 *  which one is the caller's own via findEruvForArea(). */
export function useEruvStatuses(cityId: string, active = true) {
  const [statuses, setStatuses] = useState<EruvStatus[]>([]);
  const [loading, setLoading] = useState(active);

  useEffect(() => {
    if (!cityId || !active) return;
    const unsub = onEruvStatuses(cityId, (s) => {
      setStatuses(s);
      setLoading(false);
    });
    return unsub;
  }, [cityId, active]);

  return { statuses, loading };
}

/** One eruv by its own id — NOT a cityId (see onEruvStatusById). A screen
 *  that only has a cityId should go through useEruvStatuses first and pick
 *  one (statuses[0] on a single-eruv tenant, or via findEruvForArea). */
export function useEruvStatus(eruvId: string | null | undefined, active = true) {
  const [status, setStatus] = useState<EruvStatus | null>(null);
  const [loading, setLoading] = useState(active);

  useEffect(() => {
    if (!eruvId || !active) { setLoading(false); return; }
    setLoading(true);
    const unsub = onEruvStatusById(eruvId, (s) => {
      setStatus(s);
      setLoading(false);
    });
    return unsub;
  }, [eruvId, active]);

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
