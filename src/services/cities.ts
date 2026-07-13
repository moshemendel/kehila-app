import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { City } from '../types';

const COL = 'cities';

export async function getAllCities(): Promise<City[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as City));
}

export async function getCity(cityId: string): Promise<City | null> {
  const snap = await getDoc(doc(db, COL, cityId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as City;
}

export async function createCity(city: Omit<City, 'id'> & { id?: string }): Promise<string> {
  const id = city.id ?? city.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  await setDoc(doc(db, COL, id), {
    name: city.name,
    country: city.country ?? '',
    timezone: city.timezone ?? 'Asia/Jerusalem',
    latitude: city.latitude,
    longitude: city.longitude,
  });
  return id;
}

export async function deleteCity(cityId: string): Promise<void> {
  await deleteDoc(doc(db, COL, cityId));
}

export async function updateCityElevation(cityId: string, elevation: number): Promise<void> {
  await updateDoc(doc(db, COL, cityId), { elevation });
}

export async function fetchElevationFromApi(lat: number, lon: number): Promise<number | null> {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const res  = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const elev = json?.elevation?.[0];
    return typeof elev === 'number' ? Math.round(elev) : null;
  } catch {
    return null;
  }
}
