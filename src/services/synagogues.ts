import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Synagogue } from '../types';

const COL = 'synagogues';

// Firestore rejects undefined at any depth — recursively replace with null
function sanitize(value: any): any {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
}

export async function getSynagoguesByCity(cityId: string): Promise<Synagogue[]> {
  const q = query(collection(db, COL), where('cityId', '==', cityId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Synagogue));
}

export async function getSynagogue(id: string): Promise<Synagogue | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Synagogue;
}

export async function updateSynagogue(id: string, data: Partial<Synagogue>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...sanitize(data), updatedAt: serverTimestamp() });
}

export async function addSynagogue(data: Omit<Synagogue, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...data, updatedAt: serverTimestamp() });
  return ref.id;
}

export async function deleteSynagogue(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
