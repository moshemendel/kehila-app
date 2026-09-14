import { collection, doc, getDocs, getDoc, addDoc, setDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Cemetery } from '../types';

const COL = 'cemeteries';

// Firestore rejects undefined at any depth — recursively replace with null
function sanitize(value: any): any {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
}

export async function addCemetery(data: Omit<Cemetery, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...sanitize(data), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function getCemeteriesByCity(cityId: string): Promise<Cemetery[]> {
  const q = query(collection(db, COL), where('cityId', '==', cityId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Cemetery))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export async function getCemetery(id: string): Promise<Cemetery | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Cemetery;
}

export async function updateCemetery(id: string, data: Partial<Cemetery>): Promise<void> {
  await setDoc(doc(db, COL, id), { ...sanitize(data), updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteCemetery(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
