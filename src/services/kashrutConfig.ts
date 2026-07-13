/**
 * Per-city kashrut configuration — the certifier lists the authority maintains.
 * Stored at  kashrutConfig/{cityId}  with { rabbanutList, badatzList }.
 *
 * These extend the built-in defaults; a head-of-kashrut / admin can add new
 * certifiers that then appear for everyone. Firestore rules should allow write
 * for admin + kosher_manager and public read.
 */

import { doc, getDoc, setDoc, onSnapshot, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const COL = 'kashrutConfig';

export interface KashrutConfig {
  rabbanutList: string[];
  badatzList: string[];
}

export function subscribeKashrutConfig(
  cityId: string,
  cb: (cfg: KashrutConfig) => void,
): () => void {
  return onSnapshot(doc(db, COL, cityId), (snap) => {
    const d = snap.data() ?? {};
    cb({ rabbanutList: d.rabbanutList ?? [], badatzList: d.badatzList ?? [] });
  }, () => cb({ rabbanutList: [], badatzList: [] }));
}

export async function getKashrutConfig(cityId: string): Promise<KashrutConfig> {
  const snap = await getDoc(doc(db, COL, cityId));
  const d = snap.data() ?? {};
  return { rabbanutList: d.rabbanutList ?? [], badatzList: d.badatzList ?? [] };
}

/** Add a certifier to the city's badatz list (idempotent). */
export async function addBadatz(cityId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await setDoc(doc(db, COL, cityId), { badatzList: arrayUnion(trimmed), updatedAt: serverTimestamp() }, { merge: true });
}

/** Add a certifier to the city's local-rabbanut list (idempotent). */
export async function addRabbanut(cityId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await setDoc(doc(db, COL, cityId), { rabbanutList: arrayUnion(trimmed), updatedAt: serverTimestamp() }, { merge: true });
}
