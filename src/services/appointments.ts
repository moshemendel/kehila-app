/**
 * Appointment booking service for Mikveh.
 *
 * Firestore path:  mikvaot/{mikvehId}/appointments/{appointmentId}
 *
 * Privacy: appointment docs store userId, and Firestore rules restrict reads
 * to the owning user or a mikveh manager/admin — nobody else can query them.
 * Since regular users still need to know which slots are taken (to know
 * what's bookable), each booking also writes non-identifying mirror docs to
 * mikvaot/{mikvehId}/appointmentSlots — one per occupied (base slot × track),
 * with DETERMINISTIC ids ("{date}_{HH-MM}_t{track}") — readable by any
 * signed-in user. getSlotInfo() reads occupancy from that mirror, never from
 * the real appointments collection. The deterministic ids double as a
 * uniqueness lock against double-booking (see bookAppointment).
 */

import {
  collection, doc, getDoc, getDocs, writeBatch,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { MikvehAppointment } from '../types';
import { todayString, addMinutesToTime } from '../utils/appointmentSlots';

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
): Promise<{ slots: { id: string; time: string; slotsCount?: number }[]; userAppt: MikvehAppointment | null }> {
  const [slotSnap, ownSnap] = await Promise.all([
    getDocs(query(slotCol(mikvehId), where('date', '==', date))),
    getDocs(query(apptCol(mikvehId), where('date', '==', date), where('status', '==', 'booked'), where('userId', '==', userId))),
  ]);
  const slots = slotSnap.docs.map((d) => {
    const data = d.data() as { time: string; slotsCount?: number };
    return { id: d.id, time: data.time, slotsCount: data.slotsCount };
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
  // toISOString() is UTC — Israel is ahead of UTC, so between local midnight
  // and ~3am this would still report yesterday's date, silently keeping an
  // already-past appointment "upcoming". todayString() is local-time, like
  // every other date comparison in this feature (see appointmentSlots.ts).
  const today = todayString();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as MikvehAppointment))
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Deterministic mirror-doc id for one occupied track of one base slot.
 *  ':' avoided in ids for readability/safety → "2026-07-24_18-00_t0". */
function slotDocId(date: string, time: string, track: number): string {
  return `${date}_${time.replace(':', '-')}_t${track}`;
}

/**
 * Book a slot — a "prep at mikveh" appointment spans slotsCount consecutive
 * base slots (per the mikveh's prepMultiplier) instead of just one.
 *
 * Race-safe: each occupied (base slot × track) gets a mirror doc with a
 * DETERMINISTIC id. Firestore rules allow only `create` (never `update`) on
 * appointmentSlots, so if two users grab the same track of the same slot
 * simultaneously, the second batch's set() is evaluated as an update on an
 * existing doc → rejected → their entire booking atomically fails. The caller
 * catches, refreshes availability, and asks the user to pick again.
 *
 * `existingSlotIds` is the current mirror-doc id set (from getSlotInfo) —
 * used to pick the lowest free track per covered base slot up front.
 */
export async function bookAppointment(
  mikvehId: string,
  userId: string,
  date: string,
  time: string,
  slotsCount: number = 1,
  slotDurationMin: number = 20,
  capacity: number = 1,
  existingSlotIds: ReadonlySet<string> = new Set(),
): Promise<string> {
  const apptRef = doc(apptCol(mikvehId));
  const batch   = writeBatch(db);

  const slotIds: string[] = [];
  for (let i = 0; i < slotsCount; i++) {
    const coveredTime = i === 0 ? time : addMinutesToTime(time, i * slotDurationMin);
    let picked: string | null = null;
    for (let t = 0; t < capacity; t++) {
      const id = slotDocId(date, coveredTime, t);
      if (!existingSlotIds.has(id) && !slotIds.includes(id)) { picked = id; break; }
    }
    if (!picked) throw new Error('התור הרגע נתפס. רענן/י ובחר/י שעה אחרת.');
    slotIds.push(picked);
    batch.set(doc(slotCol(mikvehId), picked), { date, time: coveredTime, apptId: apptRef.id });
  }

  batch.set(apptRef, {
    mikvehId,
    userId,
    date,
    time,
    slotsCount,
    slotIds,
    status:    'booked',
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return apptRef.id;
}

/** Cancel a booking (soft-delete on the real doc; the public mirror docs are removed entirely). */
export async function cancelAppointment(
  mikvehId: string,
  appt: Pick<MikvehAppointment, 'id' | 'slotIds'>,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'mikvaot', mikvehId, 'appointments', appt.id), { status: 'cancelled' });
  if (appt.slotIds?.length) {
    appt.slotIds.forEach((sid) => batch.delete(doc(db, 'mikvaot', mikvehId, 'appointmentSlots', sid)));
  } else {
    // Legacy booking: its single mirror doc shared the appointment's own id.
    // Existence-checked first — batch-deleting a nonexistent doc fails the
    // owner's rules check (resource is null), which would sink the whole batch.
    const legacy = await getDoc(doc(db, 'mikvaot', mikvehId, 'appointmentSlots', appt.id));
    if (legacy.exists()) batch.delete(legacy.ref);
  }
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
  appt: Pick<MikvehAppointment, 'id' | 'slotIds'>,
): Promise<void> {
  await cancelAppointment(mikvehId, appt);
}
