import {
  doc, collection, setDoc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { EruvStatus, EruvReport, EruvCoordinate } from '../types';

export function onEruvStatus(cityId: string, cb: (s: EruvStatus | null) => void) {
  return onSnapshot(doc(db, 'eruvStatus', cityId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as EruvStatus) : null);
  });
}

export async function setEruvStatus(
  cityId: string,
  status: 'valid' | 'invalid',
  notes: string,
  updatedBy: string,
) {
  await setDoc(
    doc(db, 'eruvStatus', cityId),
    { status, notes, updatedBy, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setEruvPolygon(cityId: string, polygons: EruvCoordinate[][]) {
  await setDoc(doc(db, 'eruvStatus', cityId), {
    polygons: polygons.map(pts => ({ points: pts })),
  }, { merge: true });
}

/** Returns all polygons from an EruvStatus, falling back to legacy single-polygon field. */
export function getEruvPolygons(status: import('../types').EruvStatus | null): EruvCoordinate[][] {
  if (!status) return [];
  if (status.polygons?.length) return status.polygons.map(p => p.points ?? []);
  if (status.polygon?.length) return [status.polygon];
  return [];
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
