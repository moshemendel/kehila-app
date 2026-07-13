import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { AppUser, UserRole } from '../types';

export async function setUserRoles(
  uid: string,
  roles: UserRole[],
  primaryRole: UserRole,
  managedSynagogueIds: string[],
  managedRestaurantIds: string[],
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    roles,
    role: primaryRole,
    managedSynagogueIds,
    managedRestaurantIds,
  });
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ ...d.data() } as AppUser));
}

export async function getUsersByCity(cityId: string): Promise<AppUser[]> {
  const q = query(collection(db, 'users'), where('cityId', '==', cityId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data() } as AppUser));
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function setManagedSynagogues(uid: string, ids: string[]): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { managedSynagogueIds: ids });
}

export async function setManagedRestaurants(uid: string, ids: string[]): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { managedRestaurantIds: ids });
}

export async function updateUserCity(uid: string, cityId: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { cityId });
}

// Relocates the user's permanent home city (not just the personal browsing preference) —
// this also repoints which city's eruv/kashrut push alerts they receive, so cityId is
// kept in sync rather than left pointing at wherever they were last browsing.
export async function updateUserHomeCity(uid: string, cityId: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { cityId, homeCityId: cityId });
}
