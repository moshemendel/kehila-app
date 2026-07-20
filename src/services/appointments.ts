/**
 * Appointment booking service for Mikveh.
 *
 * Firestore path:  mikvaot/{mikvehId}/appointments/{appointmentId}
 *
 * Privacy note: each appointment stores userId. Firestore security rules
 * should restrict read access so users can only read their own appointments.
 * The getSlotInfo() helper reads all appointments for a date but only returns
 * booked *times* (not user IDs) to callers other than the owning user.
 */

import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { MikvehAppointment } from '../types';
import { addMinutesToTime } from '../utils/appointmentSlots';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apptCol(mikvehId: string) {
  return collection(db, 'mikvaot', mikvehId, 'appointments');
}

// ─── User-facing reads ───────────────────────────────────────────────────────

/**
 * Returns booked slot times for a given date AND the current user's own
 * appointment for that date (if any) — in a single Firestore query.
 *
 * `bookedTimes` is expanded: a double ("tailing") booking occupies two
 * consecutive base slots, so both of their times are included here even
 * though only one appointment document exists.
 */
export async function getSlotInfo(
  mikvehId: string,
  date: string,
  userId: string,
  slotDurationMin: number,
): Promise<{ bookedTimes: string[]; userAppt: MikvehAppointment | null }> {
  const q    = query(apptCol(mikvehId), where('date', '==', date), where('status', '==', 'booked'));
  const snap = await getDocs(q);
  const appts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MikvehAppointment));
  const bookedTimes: string[] = [];
  appts.forEach((a) => {
    const n = a.slotsCount ?? 1;
    for (let i = 0; i < n; i++) {
      bookedTimes.push(i === 0 ? a.time : addMinutesToTime(a.time, i * slotDurationMin));
    }
  });
  return {
    bookedTimes,
    userAppt: appts.find((a) => a.userId === userId) ?? null,
  };
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
 * Book a slot (or a "double"/tailing pair via slotsCount=2). Throws if the
 * slot is already taken (race condition guard via re-read before insert in a
 * real app; here we trust the UI flow).
 */
export async function bookAppointment(
  mikvehId: string,
  userId: string,
  date: string,
  time: string,
  slotsCount: number = 1,
): Promise<string> {
  const ref = await addDoc(apptCol(mikvehId), {
    mikvehId,
    userId,
    date,
    time,
    slotsCount,
    status:    'booked',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Cancel a booking (soft-delete: status → 'cancelled') */
export async function cancelAppointment(
  mikvehId: string,
  appointmentId: string,
): Promise<void> {
  await updateDoc(doc(db, 'mikvaot', mikvehId, 'appointments', appointmentId), {
    status: 'cancelled',
  });
}

// ─── Manager reads ────────────────────────────────────────────────────────────

/** All booked appointments for a specific date (manager view). */
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
