import {
  doc, collection, setDoc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import { EruvStatus, EruvReport, EruvCoordinate } from '../types';

/** Every eruv belonging to a tenant — one for most cities, several for a
 *  regional council (one per settlement, or per settlement-group sharing one
 *  physical boundary). Callers that only ever expect one (any city today
 *  except a regional council) can just take statuses[0]. */
export function onEruvStatuses(cityId: string, cb: (statuses: EruvStatus[]) => void) {
  const q = query(collection(db, 'eruvStatus'), where('cityId', '==', cityId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EruvStatus)));
  });
}

/** One eruv by its own document id — for a screen that already knows which
 *  one it's showing (picked by the user, or resolved via findEruvForArea). */
export function onEruvStatusById(eruvId: string, cb: (s: EruvStatus | null) => void) {
  return onSnapshot(doc(db, 'eruvStatus', eruvId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as EruvStatus) : null);
  });
}

/** Which of a tenant's eruvin covers a given area — a resident's own
 *  settlement, typically. null when none does (that settlement has no eruv,
 *  or areaId is unset) or when the caller hasn't loaded homeAreaId yet, in
 *  which case falling back to statuses[0] is the caller's call to make. */
export function findEruvForArea(statuses: EruvStatus[], areaId?: string | null): EruvStatus | null {
  if (!areaId) return null;
  return statuses.find((s) => s.areaIds?.includes(areaId)) ?? null;
}

/** Registers a new physical eruv for a tenant — an admin adding one of a
 *  regional council's settlements that doesn't have an eruvStatus document
 *  yet. Starts at 'unknown': creating the record is not the same as having
 *  inspected it. */
export async function createEruv(
  cityId: string,
  areaIds: string[],
  label: string | undefined,
  createdBy: string,
): Promise<string> {
  const ref = await addDoc(collection(db, 'eruvStatus'), {
    cityId,
    areaIds,
    ...(label ? { label } : {}),
    status: 'unknown',
    updatedBy: createdBy,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Changes which of the tenant's areas an existing eruv covers, and/or its
 *  display label — e.g. moving a settlement between two eruvin (uncheck +
 *  save here, then check it into the other eruv), or merging a second
 *  settlement into one that started single. label='' clears a custom label
 *  back to eruvLabel()'s auto joined-names fallback rather than leaving a
 *  stale one in place. */
export async function updateEruvAreas(
  eruvId: string,
  areaIds: string[],
  label: string,
  updatedBy: string,
) {
  await setDoc(doc(db, 'eruvStatus', eruvId), {
    areaIds,
    label: label ? label : deleteField(),
    updatedBy,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function setEruvStatus(
  eruvId: string,
  status: 'valid' | 'invalid',
  notes: string,
  updatedBy: string,
) {
  await setDoc(
    doc(db, 'eruvStatus', eruvId),
    { status, notes, updatedBy, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setEruvPolygon(eruvId: string, polygons: EruvCoordinate[][]) {
  await setDoc(doc(db, 'eruvStatus', eruvId), {
    polygons: polygons.map(pts => ({ points: pts })),
  }, { merge: true });
}

/**
 * Every closed ring that makes up this eruv.
 *
 * Always a list, even for one ring: an eruv can enclose separated areas, and
 * Ma'ale Adumim's does — the city itself and נופי סלע, about 3 km apart with
 * nothing joining them. That is one eruv with one status, not two eruvin, which
 * is why the rings live inside the status document rather than being it.
 */
export function getEruvPolygons(status: import('../types').EruvStatus | null): EruvCoordinate[][] {
  if (!status?.polygons?.length) return [];
  return status.polygons.map(p => p.points ?? []);
}

export async function submitEruvReport(
  report: Omit<EruvReport, 'id' | 'createdAt' | 'status'>,
) {
  await addDoc(collection(db, 'eruvReports'), {
    ...report,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

/** A tenant's reports, or (when eruvId is given) just the ones about that one
 *  eruv — a report filed before eruvId existed has none and is included
 *  either way, matching how the reports tab always showed every report for
 *  the city regardless of which polygon it might concern. */
export function onEruvReports(cityId: string, cb: (reports: EruvReport[]) => void) {
  const q = query(
    collection(db, 'eruvReports'),
    where('cityId', '==', cityId),
  );
  return onSnapshot(q, (snap) => {
    const reports = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as EruvReport))
      .sort((a, b) => {
        const ta = (a.createdAt as any)?.seconds ?? 0;
        const tb = (b.createdAt as any)?.seconds ?? 0;
        return tb - ta;
      });
    cb(reports);
  });
}

export async function resolveEruvReport(reportId: string, resolvedBy: string) {
  await updateDoc(doc(db, 'eruvReports', reportId), {
    status: 'resolved',
    resolvedBy,
    resolvedAt: serverTimestamp(),
  });
}
