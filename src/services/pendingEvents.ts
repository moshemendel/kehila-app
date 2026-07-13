/**
 * Pending (gabay-submitted) events — require city-admin approval before
 * they become public CommunityEvents.
 *
 * Collection: `pending_events`
 * Firestore rules: allow write to gabai/admin; allow read to admin/event_manager.
 */

import {
  collection, doc, addDoc, updateDoc,
  query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { PendingCommunityEvent, EventCategory } from '../types';
import { createEvent } from './events';

const COL = 'pending_events';

// ── Submit ────────────────────────────────────────────────────────────────────

export async function submitPendingEvent(
  data: {
    cityId: string;
    synagogueId: string;
    synagogueName?: string;
    submittedBy: string;
    submittedByName?: string;
    title: string;
    description: string;
    category: EventCategory;
    startDate: string;
    endDate?: string;
    location?: string;
    organizer?: string;
    isAlert: boolean;
  },
): Promise<string> {
  const payload: Record<string, any> = {
    status: 'pending',
    submittedAt: serverTimestamp(),
  };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) payload[k] = v;
  }
  const ref = await addDoc(collection(db, COL), payload);
  return ref.id;
}

// ── Subscribe (admin) ─────────────────────────────────────────────────────────

export function subscribeToPendingEvents(
  cityId: string,
  callback: (events: PendingCommunityEvent[]) => void,
): () => void {
  const q = query(
    collection(db, COL),
    where('cityId',  '==', cityId),
    where('status',  '==', 'pending'),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PendingCommunityEvent))),
    () => callback([]),
  );
}

// ── Approve ───────────────────────────────────────────────────────────────────

export async function approvePendingEvent(
  pending: PendingCommunityEvent,
  approvingUid: string,
): Promise<void> {
  // Create the public CommunityEvent (createdBy is part of the data payload)
  await createEvent({
    cityId:      pending.cityId,
    title:       pending.title,
    description: pending.description,
    category:    pending.category,
    startDate:   pending.startDate,
    endDate:     pending.endDate,
    location:    pending.location,
    organizer:   pending.organizer ?? pending.synagogueName,
    synagogueId: pending.synagogueId,
    isAlert:     pending.isAlert,
    createdBy:   approvingUid,
  });
  // Mark as approved
  await updateDoc(doc(db, COL, pending.id), { status: 'approved' });
}

// ── Reject ────────────────────────────────────────────────────────────────────

export async function rejectPendingEvent(
  pendingId: string,
  reason?: string,
): Promise<void> {
  await updateDoc(doc(db, COL, pendingId), {
    status: 'rejected',
    rejectionReason: reason || 'לא אושר על ידי הנהלת הקהילה',
  });
}
