import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { buildReportQueries } from '../services/reports';
import { useCityId } from './useCityId';
import { useAuth } from '../context/AuthContext';
import { managesContent } from '../utils/roles';

export interface ManagerAlerts {
  /** Open content reports this user can act on. */
  reports: number;
  /** Gemach submissions awaiting approval (admins only). */
  pendingGemachs: number;
  /** Event submissions awaiting approval. */
  pendingEvents: number;
  /** Open eruv reports. */
  eruvReports: number;
  /** Everything above — drives the "!" badge. */
  total: number;
}

const EMPTY: ManagerAlerts = {
  reports: 0, pendingGemachs: 0, pendingEvents: 0, eruvReports: 0, total: 0,
};

/**
 * Counts of things waiting for this user in the management screens.
 *
 * Each collection is queried only by roles the security rules actually permit —
 * rules are not filters, so a query a role can't satisfy fails outright rather
 * than returning nothing. That's also why a failing listener is swallowed per
 * collection instead of tearing down the whole hook.
 */
export function useManagerAlerts(): ManagerAlerts {
  const cityId = useCityId();
  const { appUser } = useAuth();
  const [alerts, setAlerts] = useState<ManagerAlerts>(EMPTY);

  const roles: string[] = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = managesContent(appUser);
  const isEventMgr = roles.includes('event_manager');
  const isEruvMgr = roles.includes('eruv_manager');
  // Recomputed as a string so the effect doesn't re-run on every render.
  const roleKey = roles.slice().sort().join(',');

  useEffect(() => {
    if (!cityId || !appUser) { setAlerts(EMPTY); return; }

    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const patch = (part: Partial<ManagerAlerts>) => {
      if (cancelled) return;
      setAlerts((prev) => {
        const next = { ...prev, ...part };
        next.total = next.reports + next.pendingGemachs + next.pendingEvents + next.eruvReports;
        return next;
      });
    };

    // Content reports — live, so resolving one clears the badge immediately.
    //
    // Counted through a shared map rather than by summing each listener: a user
    // holding both kosher_manager and business_manager gets two queries that
    // legitimately overlap on the same business reports, and summing would
    // double-count them.
    const reportDocs = new Map<string, Map<string, string>>(); // queryKey → (docId → status)
    const recountReports = () => {
      const merged = new Map<string, string>();
      reportDocs.forEach((docs) => docs.forEach((status, id) => merged.set(id, status)));
      let open = 0;
      merged.forEach((status) => { if (status === 'open') open += 1; });
      patch({ reports: open });
    };

    buildReportQueries(cityId, appUser).forEach((q, i) => {
      const key = String(i);
      try {
        const unsub = onSnapshot(
          q,
          (snap) => {
            const docs = new Map<string, string>();
            snap.docs.forEach((d) => docs.set(d.id, (d.data() as { status?: string }).status ?? 'open'));
            reportDocs.set(key, docs);
            recountReports();
          },
          () => { reportDocs.delete(key); recountReports(); },
        );
        unsubs.push(unsub);
      } catch {
        /* ignore — this role can't run that query */
      }
    });

    const listen = (
      col: string,
      filters: ReturnType<typeof where>[],
      key: keyof ManagerAlerts,
    ) => {
      try {
        const unsub = onSnapshot(
          query(collection(db, col), ...filters),
          (snap) => patch({ [key]: snap.size } as Partial<ManagerAlerts>),
          () => patch({ [key]: 0 } as Partial<ManagerAlerts>), // denied / offline
        );
        unsubs.push(unsub);
      } catch {
        /* ignore — this role simply can't see that collection */
      }
    };

    if (isAdmin) {
      listen('pending_gemachs', [where('cityId', '==', cityId), where('status', '==', 'pending')], 'pendingGemachs');
    }
    if (isAdmin || isEventMgr) {
      listen('pending_events', [where('cityId', '==', cityId), where('status', '==', 'pending')], 'pendingEvents');
    }
    if (isAdmin || isEruvMgr) {
      listen('eruvReports', [where('cityId', '==', cityId), where('status', '==', 'open')], 'eruvReports');
    }

    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [cityId, appUser?.uid, roleKey, isAdmin, isEventMgr, isEruvMgr]); // eslint-disable-line react-hooks/exhaustive-deps

  return alerts;
}
