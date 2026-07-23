/**
 * Appointment booking service for Mikveh.
 *
 * Firestore path:  mikvaot/{mikvehId}/appointments/{appointmentId}
 *
 * Privacy: appointment docs store userId, and Firestore rules restrict reads
 * to the owning user or a mikveh manager/admin — nobody else can query them.
 * Since regular users still need to know which slots are taken (to know
 * what's bookable), each booking also writes a non-identifying mirror doc to
 * mikvaot/{mikvehId}/appointmentSlots/{appointmentId} (same id, no userId) —
 * readable by any signed-in user. getSlotInfo() reads occupancy from that
 * mirror, never from the real appointments collection.
 */

import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { MikvehAppointment } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apptCol(mikvehId: string) {
  return collection(db, 'mikvaot', mikvehId, 'appointments');
}

function slotCol(mikvehId: string) {
  return collection(db, 'mikvaot', mikvehId, 'appointmentSlots');
}

// ─── User-facing reads ───────────────────────────────────────────────────────

/**
 * Returns occupied slot times for a date (from the non-identifying mirror
 * collection — safe for any signed-in user to read) AND the current user's
 * own appointment for that date (if any, read from the real collection,
 * which Firestore rules only allow because it's their own uid).
 */
export async function getSlotInfo(
  mikvehId: string,
  date: string,
  userId: string,
): Promise<{ slots: { time: string; slotsCount?: number }[]; userAppt: MikvehAppointment | null }> {
  const [slotSnap, ownSnap] = await Promise.all([
    getDocs(query(slotCol(mikvehId), where('date', '==', date))),
    getDocs(query(apptCol(mikvehId), where('date', '==', date), where('status', '==', 'booked'), where('userId', '==', userId))),
  ]);
  const slots = slotSnap.docs.map((d) => {
    const data = d.data() as { time: string; slotsCount?: number };
    return { time: data.time, slotsCount: data.slotsCount };
  });
  const ownDoc = ownSnap.docs[0];
  const userAppt = ownDoc ? ({ id: ownDoc.id, ...ownDoc.data() } as MikvehAppointment) : null;
  return { slots, userAppt };
}

/**
 * Returns all future/ongoing booked appointments for a user in this mikveh,
 * sorted chronologically (date asc, then time asc).
 */
export async function getUserUpcomingAppointments(
  mikvehId: string,
  userId: string,
): Promise<MikvehAppointment[]> {
  const q    = query(apptCol(mikvehId), where('userId', '==', userId), where('status', '==', 'booked'));
  const snap = await getDocs(q);
  const today = new Date().toISOString().split('T')[0];
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as MikvehAppointment))
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Book a slot — a "prep at mikveh" appointment spans slotsCount consecutive
 * base slots (per the mikveh's prepMultiplier) instead of just one. Throws if
 * the slot is already taken (race condition guard via re-read before insert
 * in a real app; here we trust the UI flow).
 *
 * Writes the real (private) appointment doc and its non-identifying public
 * mirror atomically, sharing the same document id.
 */
export async function bookAppointment(
  mikvehId: string,
  userId: string,
  date: string,
  time: string,
  slotsCount: number = 1,
): Promise<string> {
  const apptRef = doc(apptCol(mikvehId));
  const slotRef = doc(slotCol(mikvehId), apptRef.id);
  const batch = writeBatch(db);
  batch.set(apptRef, {
    mikvehId,
    userId,
    date,
    time,
    slotsCount,
    status:    'booked',
    createdAt: serverTimestamp(),
  });
  batch.set(slotRef, { date, time, slotsCount });
  await batch.commit();
  return apptRef.id;
}

/** Cancel a booking (soft-delete on the real doc; the public mirror is removed entirely). */
export async function cancelAppointment(
  mikvehId: string,
  appointmentId: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'mikvaot', mikvehId, 'appointments', appointmentId), { status: 'cancelled' });
  batch.delete(doc(db, 'mikvaot', mikvehId, 'appointmentSlots', appointmentId));
  await batch.commit();
}

// ─── Manager reads ────────────────────────────────────────────────────────────

/** All booked appointments for a specific date (manager view — Firestore rules allow managers/admins to read the real collection in full). */
export async function getAppointmentsForDay(
  mikvehId: string,
  date: string,
): Promise<MikvehAppointment[]> {
  const q    = query(apptCol(mikvehId), where('date', '==', date), where('status', '==', 'booked'));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as MikvehAppointment))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Cancel a booking from the manager side. */
export async function managerCancelAppointment(
  mikvehId: string,
  appointmentId: string,
): Promise<void> {
  await cancelAppointment(mikvehId, appointmentId);
}
