/**
 * Kashrut-update feed — a dedicated collection (separate from community events)
 * so kashrut changes get their own surface and don't mix with general alerts.
 *
 * Path: kashrutUpdates/{id}
 *
 * TTL: each document gets an `expiresAt` field (30 days).
 * Enable the Firestore TTL policy on this field in the Firebase console:
 *   Firestore → Indexes → TTL → Add policy → Collection: kashrutUpdates, Field: expiresAt
 */

import {
  collection, addDoc, onSnapshot, query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { KashrutUpdate } from '../types';

const COL = 'kashrutUpdates';

/** Kashrut alerts expire after 30 days — old news doesn't linger forever. */
const TTL_DAYS = 30;

export async function createKashrutUpdate(
  data: Omit<KashrutUpdate, 'id' | 'createdAt' | 'expiresAt'>,
): Promise<string> {
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000),
  );
  // Firestore rejects undefined values — strip optional fields that weren't set
  const payload: Record<string, any> = { createdAt: serverTimestamp(), expiresAt };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) payload[k] = v;
  }
  const ref = await addDoc(collection(db, COL), payload);
  return ref.id;
}

export function subscribeKashrutUpdates(
  cityId: string,
  cb: (updates: KashrutUpdate[]) => void,
): () => void {
  const q = query(collection(db, COL), where('cityId', '==', cityId));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KashrutUpdate))),
    () => cb([]),
  );
}
