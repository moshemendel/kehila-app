import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Mikveh } from '../types';

const COL = 'mikvaot';

export async function addMikveh(data: Omit<Mikveh, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...data, updatedAt: serverTimestamp() });
  return ref.id;
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

export async function updateMikveh(id: string, data: Partial<Mikveh>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteMikveh(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
