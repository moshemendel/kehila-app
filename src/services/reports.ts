/**
 * Content reports — a user flagging wrong or outdated information on a public
 * listing (synagogue, business, mikveh, event, gemach).
 *
 * Collection: `contentReports`
 * Firestore rules: any signed-in user may create a report carrying their own
 * uid; only city admins (and the relevant manager) may read or resolve them.
 *
 * Mirrors the existing `eruvReports` flow so admins get a familiar queue.
 */

import {
  collection, doc, addDoc, updateDoc, getDocs,
  query, where, onSnapshot, serverTimestamp, type Query,
} from 'firebase/firestore';
import { db } from './firebase';
import { AppUser, ContentReport, ReportEntityType, ReportReason } from '../types';

const COL = 'contentReports';

export async function submitContentReport(report: {
  cityId: string;
  entityType: ReportEntityType;
  entityId: string;
  entityName: string;
  reason: ReportReason;
  details?: string;
  userId: string;
  userName?: string;
}): Promise<void> {
  const payload: Record<string, any> = {
    ...report,
    status: 'open',
    createdAt: serverTimestamp(),
  };
  // Firestore rejects undefined values outright.
  if (!payload.details) delete payload.details;
  if (!payload.userName) delete payload.userName;
  await addDoc(collection(db, COL), payload);
}

/** Live open-report count for a city — for an admin badge. */
export function onOpenReports(cityId: string, cb: (reports: ContentReport[]) => void) {
  const q = query(
    collection(db, COL),
    where('cityId', '==', cityId),
    where('status', '==', 'open'),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContentReport)));
  });
}

export async function setReportStatus(
  id: string,
  status: 'resolved' | 'dismissed',
  handledBy: string,
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status,
    handledBy,
    handledAt: serverTimestamp(),
  });
}


// ── Reading, scoped to what the caller is allowed to read ────────────────────

/** Firestore `in` filters accept at most 30 values. */
const IN_LIMIT = 30;

/**
 * Fetch the reports this user may act on.
 *
 * Security rules are NOT filters: if a query would return even one document the
 * caller can't read, the WHOLE query fails with permission-denied instead of
 * returning a subset. So a manager who may only read reports about their own
 * listings must ask for exactly that subset — hence the per-role queries below
 * rather than one `where('cityId', '==', cityId)` for everyone.
 *
 * Mirrors the `contentReports` read rule in firestore.rules — change both together.
 */
/**
 * The Firestore queries this user is allowed to run against `contentReports`.
 *
 * Security rules are NOT filters: if a query would return even one document the
 * caller can't read, the WHOLE query fails with permission-denied instead of
 * returning a subset. So a manager who may only read reports about their own
 * listings must ask for exactly that subset — hence the per-role queries below
 * rather than one `where('cityId', '==', cityId)` for everyone.
 *
 * Mirrors the `contentReports` read rule in firestore.rules — change both together.
 *
 * Shared by the reports screen (one-shot read) and the badge counter (live
 * listeners), so the two can never disagree about who sees what.
 */
export function buildReportQueries(cityId: string, user: AppUser | null): Query[] {
  if (!cityId || !user) return [];

  const roles: string[] = user.roles ?? (user.role ? [user.role] : []);
  const isAdmin = roles.some((r) => ['city_admin', 'super_admin', 'dev'].includes(r));
  const col = collection(db, COL);

  // Admins can read every report in the city, so one unscoped query is safe.
  if (isAdmin) return [query(col, where('cityId', '==', cityId))];

  const queries: Query[] = [];

  // gabbai → only reports about synagogues they manage
  const synIds = (user.managedSynagogueIds ?? []).slice(0, IN_LIMIT);
  if (roles.includes('gabbai') && synIds.length > 0) {
    queries.push(query(col,
      where('cityId', '==', cityId),
      where('entityType', '==', 'synagogue'),
      where('entityId', 'in', synIds)));
  }

  // business_manager → only their assigned businesses
  const bizIds = (user.managedRestaurantIds ?? []).slice(0, IN_LIMIT);
  if (roles.includes('business_manager') && bizIds.length > 0) {
    queries.push(query(col,
      where('cityId', '==', cityId),
      where('entityType', '==', 'business'),
      where('entityId', 'in', bizIds)));
  }

  // kosher_manager covers every business in the city (see managesBusiness in rules)
  if (roles.includes('kosher_manager')) {
    queries.push(query(col, where('cityId', '==', cityId), where('entityType', '==', 'business')));
  }
  if (roles.includes('mikveh_manager')) {
    queries.push(query(col, where('cityId', '==', cityId), where('entityType', '==', 'mikveh')));
  }
  if (roles.includes('event_manager')) {
    queries.push(query(col, where('cityId', '==', cityId), where('entityType', '==', 'event')));
  }
  return queries;
}

/** Fetch the reports this user may act on. */
export async function fetchReportsFor(cityId: string, user: AppUser | null): Promise<ContentReport[]> {
  const queries = buildReportQueries(cityId, user);
  if (queries.length === 0) return [];
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return dedupeSorted(
    snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContentReport))),
  );
}

/** A user holding several roles can match the same report twice. */
function dedupeSorted(rows: ContentReport[]): ContentReport[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...byId.values()].sort(
    (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0),
  );
}

/** True when this user has any route to reports at all — for menu gating. */
export function canSeeReports(user: AppUser | null): boolean {
  if (!user) return false;
  const roles: string[] = user.roles ?? (user.role ? [user.role] : []);
  return roles.some((r) => [
    'city_admin', 'super_admin', 'dev',
    'gabbai', 'business_manager', 'kosher_manager', 'mikveh_manager', 'event_manager',
  ].includes(r));
}
