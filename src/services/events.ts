/**
 * Community events & alerts.
 *
 * TTL: each document gets an `expiresAt` field.
 * Enable the Firestore TTL policy in the Firebase console:
 *   Firestore → Indexes → TTL → Add policy → Collection: events, Field: expiresAt
 */

import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { CommunityEvent } from '../types';

const COL = 'events';

/** Days after the event ends (or starts, if no endDate) before it expires. */
const EVENT_TTL_DAYS   = 7;
/** Alerts stay visible longer — they're important announcements. */
const ALERT_TTL_DAYS   = 30;

function computeExpiry(data: Omit<CommunityEvent, 'id' | 'createdAt' | 'expiresAt'>): Timestamp {
  if (data.isAlert) {
    return Timestamp.fromDate(new Date(Date.now() + ALERT_TTL_DAYS * 24 * 60 * 60 * 1000));
  }
  // Expire EVENT_TTL_DAYS after the event ends (or starts when no endDate)
  const baseStr = data.endDate || data.startDate;
  const base = baseStr ? new Date(baseStr) : new Date();
  base.setDate(base.getDate() + EVENT_TTL_DAYS);
  return Timestamp.fromDate(base);
}

export async function getEventsByCity(cityId: string): Promise<CommunityEvent[]> {
  const q = query(
    collection(db, COL),
    where('cityId', '==', cityId),
    orderBy('startDate', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityEvent));
}

export async function createEvent(
  data: Omit<CommunityEvent, 'id' | 'createdAt' | 'expiresAt'>,
): Promise<string> {
  // Firestore rejects undefined values — strip optional fields that weren't set
  const payload: Record<string, any> = {
    createdAt: serverTimestamp(),
    expiresAt: computeExpiry(data),
  };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) payload[k] = v;
  }
  const ref = await addDoc(collection(db, COL), payload);
  return ref.id;
}

export async function updateEvent(id: string, data: Partial<CommunityEvent>): Promise<void> {
  // Recompute expiry when key date fields change
  const extra: Partial<CommunityEvent> = {};
  if (data.startDate !== undefined || data.endDate !== undefined || data.isAlert !== undefined) {
    // We need the full shape to compute expiry — caller must pass the full event or at least isAlert+dates
    const base = data as Omit<CommunityEvent, 'id' | 'createdAt' | 'expiresAt'>;
    if (base.startDate) extra.expiresAt = computeExpiry(base);
  }
  await updateDoc(doc(db, COL, id), { ...data, ...extra });
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
