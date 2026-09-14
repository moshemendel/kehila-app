import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { Area } from '../types';

const COL = 'areas';

export async function getAreasForCity(cityId: string): Promise<Area[]> {
  if (!cityId) return [];
  const snap = await getDocs(query(collection(db, COL), where('cityId', '==', cityId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Area))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export async function getArea(areaId: string): Promise<Area | null> {
  const snap = await getDoc(doc(db, COL, areaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Area;
}
