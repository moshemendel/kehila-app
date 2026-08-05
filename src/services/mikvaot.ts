import { collection, doc, getDocs, getDoc, addDoc, setDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Mikveh } from '../types';

const COL = 'mikvaot';

// Firestore rejects undefined at any depth — recursively replace with null
function sanitize(value: any): any {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
}

export async function addMikveh(data: Omit<Mikveh, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...sanitize(data), updatedAt: serverTimestamp() });
  return ref.id;
}

// Generates an id without writing anything — lets a caller build a not-yet-persisted
// draft (e.g. "duplicate this mikveh") that only actually creates a document once
// updateMikveh is called for the first time (an upsert, see below).
export function newMikvehId(): string {
  return doc(collection(db, COL)).id;
}

export async function getMikvaotByCity(cityId: string): Promise<Mikveh[]> {
  const q = query(collection(db, COL), where('cityId', '==', cityId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Mikveh));
}

export async function getMikveh(id: string): Promise<Mikveh | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Mikveh;
}

// Upsert (not update-only) — needed so a not-yet-persisted duplicate draft
// (see newMikvehId above) only actually gets created on its first real save.
export async function updateMikveh(id: string, data: Partial<Mikveh>): Promise<void> {
  await setDoc(doc(db, COL, id), { ...sanitize(data), updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteMikveh(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
