/**
 * Cloud Functions for kehila-app.
 *
 * These exist because push notifications have to be sent by something that can
 * read the `pushTokens` collection. That collection is admin-read-only on
 * purpose — exposing device tokens to clients would let any signed-in user (or
 * guest) spam every device in the city. So a regular user filing a report
 * cannot notify anyone from the client: the read is denied and the send
 * silently no-ops.
 *
 * Running the lookup here, with Admin SDK privileges, is the only way to notify
 * managers about user-submitted content without weakening that rule.
 */

import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { DECEASED_SOURCES, syncDeceasedSource } from './deceasedSync';

admin.initializeApp();
const db = admin.firestore();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const REGION = 'europe-west1';
/**
 * Where the (default) database lives. A Firestore trigger has to run in the
 * database's own region, so every onDocument* trigger uses this rather than
 * REGION. The report triggers were declared in europe-west1 and never
 * deployed for exactly that reason.
 */
const FIRESTORE_REGION = 'me-west1';

// ── Types mirrored from src/types/index.ts ──────────────────────────────────

type ReportEntityType = 'synagogue' | 'business' | 'mikveh' | 'event' | 'gemach';

interface ContentReport {
  cityId: string;
  entityType: ReportEntityType;
  entityId: string;
  entityName: string;
  reason: string;
  details?: string;
}

const REASON_LABELS: Record<string, string> = {
  wrong_hours: 'שעות לא נכונות',
  wrong_contact: 'טלפון / איש קשר',
  wrong_location: 'מיקום או כתובת',
  closed: 'המקום סגור / לא פעיל',
  wrong_details: 'פרטים שגויים',
  other: 'דיווח כללי',
};

const ENTITY_LABELS: Record<ReportEntityType, string> = {
  synagogue: 'בית כנסת',
  business: 'בית עסק',
  mikveh: 'מקווה',
  event: 'אירוע',
  gemach: 'גמ"ח',
};

// ── Recipient resolution ────────────────────────────────────────────────────

interface UserDoc {
  uid?: string;
  role?: string;
  roles?: string[];
  homeCityId?: string;
  managedSynagogueIds?: string[];
  managedRestaurantIds?: string[];
}

const rolesOf = (u: UserDoc): string[] => u.roles ?? (u.role ? [u.role] : []);

/**
 * Everyone who can act on this report: city admins, plus whoever manages the
 * specific item. Deliberately mirrors the `contentReports` read rule in
 * firestore.rules — if that changes, change this too.
 */
async function recipientUids(report: ContentReport): Promise<string[]> {
  const snap = await db.collection('users').where('homeCityId', '==', report.cityId).get();
  const uids = new Set<string>();

  snap.forEach((docSnap) => {
    const u = docSnap.data() as UserDoc;
    const roles = rolesOf(u);
    const uid = u.uid ?? docSnap.id;

    // City-level admins see everything in their city.
    if (roles.includes('city_admin')) {
      uids.add(uid);
      return;
    }

    const manages =
      (report.entityType === 'synagogue' &&
        roles.includes('gabbai') &&
        (u.managedSynagogueIds ?? []).includes(report.entityId)) ||
      (report.entityType === 'business' &&
        ((roles.includes('business_manager') &&
          (u.managedRestaurantIds ?? []).includes(report.entityId)) ||
          roles.includes('kosher_manager'))) ||
      (report.entityType === 'mikveh' && roles.includes('mikveh_manager')) ||
      (report.entityType === 'event' && roles.includes('event_manager'));

    if (manages) uids.add(uid);
  });

  // super_admin / dev are not city-scoped, so they aren't in the query above.
  const supers = await db
    .collection('users')
    .where('role', 'in', ['super_admin', 'dev'])
    .get();
  supers.forEach((d) => uids.add((d.data() as UserDoc).uid ?? d.id));

  return [...uids];
}

// ── Sending ─────────────────────────────────────────────────────────────────

interface TokenEntry {
  docId: string;
  token: string;
}

async function tokensForUids(uids: string[]): Promise<TokenEntry[]> {
  if (uids.length === 0) return [];
  // Only the recipients' own devices, in chunks of 30 (the `in` limit). This
  // used to read the whole collection, which is every device in every city —
  // one read per installed app on each report.
  //
  // By uid, not by the token's cityId: super_admin and dev receive every
  // city's reports, but their device is registered under whichever city they
  // happen to be browsing, so a cityId filter would silently drop them.
  const unique = [...new Set(uids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((c) => db.collection('pushTokens').where('uid', 'in', c).get()),
  );
  const out: TokenEntry[] = [];
  snaps.forEach((snap) => snap.forEach((d) => {
    const data = d.data() as { token?: string };
    if (data.token) out.push({ docId: d.id, token: data.token });
  }));
  return out;
}

async function sendExpoPush(
  entries: TokenEntry[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  channelId?: string,
): Promise<{ ok: number; failReasons: string[] }> {
  let ok = 0;
  const failReasons: string[] = [];
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map(({ token }) => ({
          to: token, title, body, data, sound: 'default',
          ...(channelId ? { channelId } : {}),
        })),
      ),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { status: string; details?: { error?: string } }[];
    } | null;

    // Prune tokens for uninstalled apps, same cleanup the client does.
    await Promise.all(
      (json?.data ?? []).map(async (ticket, idx) => {
        if (ticket.status === 'ok') ok++;
        else failReasons.push(ticket.details?.error ?? 'UnknownError');
        if (ticket.status !== 'ok' && ticket.details?.error === 'DeviceNotRegistered') {
          const docId = chunk[idx]?.docId;
          if (docId) await db.collection('pushTokens').doc(docId).delete().catch(() => undefined);
        }
      }),
    );
  }
  return { ok, failReasons };
}

// ── Trigger ─────────────────────────────────────────────────────────────────

export const onContentReportCreated = onDocumentCreated(
  { document: 'contentReports/{reportId}', region: FIRESTORE_REGION },
  async (event) => {
    const report = event.data?.data() as ContentReport | undefined;
    if (!report?.cityId) return;

    const uids = await recipientUids(report);
    const entries = await tokensForUids(uids);
    if (entries.length === 0) {
      logger.info('No push targets for report', { reportId: event.params.reportId });
      return;
    }

    const kind = ENTITY_LABELS[report.entityType] ?? 'פריט';
    const reason = REASON_LABELS[report.reason] ?? report.reason;

    await sendExpoPush(
      entries,
      `🚩 דיווח על ${kind}`,
      `${report.entityName} — ${reason}`,
      { type: 'contentReport', reportId: event.params.reportId, entityType: report.entityType, entityId: report.entityId },
    );

    logger.info('Report push sent', {
      reportId: event.params.reportId,
      recipients: uids.length,
      devices: entries.length,
    });
  },
);

/**
 * Same fix for eruv reports. EruvScreen used to notify eruv managers itself,
 * but that call reads pushTokens and is denied for any non-admin reporter — so
 * in practice it only ever fired when an admin happened to file the report.
 * Handled here instead; the client call is gone.
 */
export const onEruvReportCreated = onDocumentCreated(
  { document: 'eruvReports/{reportId}', region: FIRESTORE_REGION },
  async (event) => {
    const report = event.data?.data() as
      | { cityId?: string; type?: string; description?: string }
      | undefined;
    if (!report?.cityId) return;

    const snap = await db.collection('users').where('homeCityId', '==', report.cityId).get();
    const uids = new Set<string>();
    snap.forEach((d) => {
      const u = d.data() as UserDoc;
      const roles = rolesOf(u);
      if (roles.includes('eruv_manager') || roles.includes('city_admin')) {
        uids.add(u.uid ?? d.id);
      }
    });

    const entries = await tokensForUids([...uids]);
    if (entries.length === 0) return;

    const title = report.type === 'breach' ? '⚠️ פרצה בעירוב' : '❓ שאלה על עירוב';
    await sendExpoPush(entries, title, (report.description ?? '').slice(0, 120), {
      type: 'eruvReport',
      reportId: event.params.reportId,
    });
  },
);

// ── Incremental sync stamps ─────────────────────────────────────────────────

/**
 * Server-side half of the app's incremental sync (src/services/citySync.ts).
 *
 * Firestore runs with no local persistence in React Native, so every listener
 * reconnect is billed as a brand-new query: before this, each app open read
 * every synagogue, business, event and kashrut update in the city — ~860 reads
 * per open for a 500-synagogue city. The app now keeps its own copy and asks
 * only for documents with `syncedAt` past what it already has, plus tombstones
 * for anything deleted while it was away.
 *
 * Stamped here rather than by each writer because there are many writers — the
 * app's management screens, the admin console, the import scripts — and one
 * that forgets to stamp would leave its edit invisible to every synced phone
 * until their monthly full refresh. A trigger cannot forget. It also means a
 * client cannot set its own `syncedAt`: a forged value is overwritten, and one
 * pushed into the future would otherwise have stalled every phone's cursor.
 *
 * Retried, because a missed stamp is exactly that invisible edit.
 */
const SYNCED_COLLECTIONS = ['synagogues', 'businesses', 'events', 'kashrutUpdates'] as const;
type SyncedCollection = (typeof SYNCED_COLLECTIONS)[number];

/** A stamp this close to now is taken to be our own write coming back. */
const OWN_STAMP_WINDOW_MS = 5 * 60 * 1000;

function fieldEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  // Timestamp, GeoPoint and DocumentReference all carry their own isEqual.
  const eq = (a as { isEqual?: (o: unknown) => boolean }).isEqual;
  if (typeof eq === 'function') {
    return a.constructor === b.constructor && eq.call(a, b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => fieldEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => !fieldEqual(before[k], after[k]));
}

async function writeTombstone(collection: SyncedCollection, docId: string, cityId: string) {
  await db.collection('syncTombstones').doc(`${collection}__${docId}__${cityId}`).set({
    collection,
    docId,
    cityId,
    deletedAt: FieldValue.serverTimestamp(),
  });
}

function syncStamper(collection: SyncedCollection) {
  return onDocumentWritten(
    { document: `${collection}/{docId}`, region: FIRESTORE_REGION, retry: true },
    async (event) => {
      const docId = event.params.docId;
      const before = event.data?.before.exists ? event.data.before.data() : undefined;
      const after = event.data?.after.exists ? event.data.after.data() : undefined;

      // Deleted: phones that were offline would never learn of it from a
      // `syncedAt >` query, since the document is simply gone.
      if (!after) {
        if (typeof before?.cityId === 'string') await writeTombstone(collection, docId, before.cityId);
        return;
      }

      // Moved to another city: from the old city's point of view it is gone.
      if (typeof before?.cityId === 'string' && before.cityId !== after.cityId) {
        await writeTombstone(collection, docId, before.cityId);
      }

      // Our own stamp coming back as a write event. Without this the trigger
      // would stamp its own stamp forever.
      if (before) {
        const changed = changedKeys(before, after);
        const stamp = after.syncedAt as Timestamp | undefined;
        const fresh = stamp instanceof Timestamp
          && Math.abs(stamp.toMillis() - Date.now()) < OWN_STAMP_WINDOW_MS;
        if (changed.length === 0) return;
        if (changed.length === 1 && changed[0] === 'syncedAt' && fresh) return;
      }

      await event.data!.after.ref
        .update({ syncedAt: FieldValue.serverTimestamp() })
        .catch((e: { code?: number }) => {
          // Deleted between the write and this stamp: the delete has its own
          // event, which writes the tombstone. Anything else must retry.
          if (e?.code === 5 /* NOT_FOUND */) return;
          throw e;
        });
    },
  );
}

export const syncStampSynagogues = syncStamper('synagogues');
export const syncStampBusinesses = syncStamper('businesses');
export const syncStampEvents = syncStamper('events');
export const syncStampKashrutUpdates = syncStamper('kashrutUpdates');

// ── Account deletion ────────────────────────────────────────────────────────

/**
 * Deletes the caller's own account, and everything that is theirs.
 *
 * Google Play requires any app offering account creation to offer deletion from
 * inside the app, not only by writing to a support address. It has to run here
 * rather than on the client for two reasons: firestore.rules deliberately has
 * no `allow delete` on users/{uid} — an account document is not the account
 * holder's to remove, since deleting it would strip a role while leaving the
 * login working — and Admin SDK privileges are the only way to reach the Auth
 * record and the collections a user cannot query.
 *
 * WHAT IS DELETED AND WHAT IS KEPT is a real decision, not an implementation
 * detail, and the confirmation screen in the app states it in the same terms:
 *
 *   deleted     the login itself, the profile, this person's devices, their
 *               mikveh bookings (which also frees the slots for someone else),
 *               their analytics trail, and any submission still awaiting
 *               review — that last one is still theirs, nobody is relying on
 *               it, and it carries their name.
 *   kept, with  content already published to the community. A gemach the
 *   the name    neighbourhood uses, an event people are attending, a report a
 *   removed     manager is still working on — none of those stop mattering
 *               because the person who filed them left, and quietly deleting
 *               them would be a worse surprise than keeping them. The link to
 *               the person is severed instead.
 *
 * Ordering matters: Firestore first, Auth last. If this dies halfway the user
 * can sign in and retry, which is recoverable; deleting the login first would
 * strand the data with no one able to reach it.
 */
const DELETED = 'deleted-account';

/**
 * Paged, because analyticsEvents is one row per screen view per user and a
 * year-old account can hold thousands — reading them all into memory just to
 * count them would be the one deletion that fails. Firestore caps a batch at 500.
 */
const PAGE = 400;

async function drain(
  query: admin.firestore.Query,
  apply: (batch: admin.firestore.WriteBatch, ref: admin.firestore.DocumentReference) => void,
): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await query.limit(PAGE).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach((d) => apply(batch, d.ref));
    await batch.commit();
    total += snap.size;
    // Only deletes and field-clearing updates are passed in, so a written row
    // stops matching the query — an update that left it matching would spin here.
    if (snap.size < PAGE) return total;
  }
}

const deleteAll = (query: admin.firestore.Query) =>
  drain(query, (batch, ref) => batch.delete(ref));

const anonymiseAll = (query: admin.firestore.Query, fields: Record<string, unknown>) =>
  drain(query, (batch, ref) => batch.update(ref, fields));

export const deleteMyAccount = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'יש להתחבר כדי למחוק חשבון.');
  }
  // Guests are anonymous sessions with nothing to delete, and signing out is
  // already the whole of it — but the Auth record would linger, so remove it.
  const isAnonymous = request.auth?.token?.firebase?.sign_in_provider === 'anonymous';

  const removed: Record<string, number> = {};
  const kept: Record<string, number> = {};

  if (!isAnonymous) {
    // Bookings are released rather than merely unlinked: a held slot with no
    // one behind it would block the next woman from booking that time.
    //
    // Walked per mikveh rather than as one collectionGroup('appointments')
    // query, which would have been shorter and would have thrown. A collection
    // GROUP query needs a collection-group-scoped index even for a single
    // equality filter, and Firestore does not create those automatically — this
    // project has no index config at all. It would have failed with
    // FAILED_PRECONDITION at the one moment that matters, halfway through a
    // deletion, on a path nobody exercises until a real user asks to leave.
    // There are a handful of mikvaot per city, and this runs once per account.
    const mikvaot = await db.collection('mikvaot').get();
    let appointments = 0;
    for (const mikveh of mikvaot.docs) {
      const appts = await mikveh.ref.collection('appointments')
        .where('userId', '==', uid).get();
      for (const appt of appts.docs) {
        const slotIds = (appt.data().slotIds as string[] | undefined) ?? [appt.id];
        await Promise.all(slotIds.map((sid) =>
          mikveh.ref.collection('appointmentSlots').doc(sid).delete().catch(() => undefined)));
        await appt.ref.delete().catch(() => undefined);
      }
      appointments += appts.size;
    }
    removed.appointments = appointments;

    removed.devices = await deleteAll(db.collection('pushTokens').where('uid', '==', uid));
    removed.analytics = await deleteAll(db.collection('analyticsEvents').where('uid', '==', uid));
    removed.pendingGemachs = await deleteAll(
      db.collection('pending_gemachs').where('submittedBy', '==', uid));
    removed.pendingEvents = await deleteAll(
      db.collection('pending_events').where('submittedBy', '==', uid));

    kept.gemachs = await anonymiseAll(
      db.collection('gemachs').where('createdBy', '==', uid), { createdBy: DELETED });
    kept.events = await anonymiseAll(
      db.collection('events').where('createdBy', '==', uid), { createdBy: DELETED });
    kept.eruvReports = await anonymiseAll(
      db.collection('eruvReports').where('userId', '==', uid),
      { userId: DELETED, userDisplayName: FieldValue.delete() });
    kept.contentReports = await anonymiseAll(
      db.collection('contentReports').where('userId', '==', uid),
      { userId: DELETED, userName: FieldValue.delete() });

    await db.collection('users').doc(uid).delete().catch(() => undefined);
  }

  // Last, so a failure anywhere above leaves an account that can sign in and
  // try again rather than data nobody can reach.
  await admin.auth().deleteUser(uid);

  logger.info('account deleted', { uid, anonymous: isAnonymous, removed, kept });
  return { removed, kept };
});

// ── Deceased registers ──────────────────────────────────────────────────────

/**
 * Weekly refresh of each burial society's public deceased register into
 * `deceased` — see deceasedSync.ts for why it is a copy and how it diffs.
 * Sunday night: registers are updated during the working week, and nobody is
 * searching at 03:00. One source failing does not stop the others.
 */
export const syncDeceased = onSchedule(
  { schedule: '0 3 * * 0', timeZone: 'Asia/Jerusalem', region: REGION, timeoutSeconds: 540, memory: '1GiB' },
  async () => {
    for (const src of DECEASED_SOURCES) {
      try {
        const result = await syncDeceasedSource(db, src);
        logger.info('deceased register synced', { source: src.source, ...result });
        if (result.skippedDelete) {
          logger.warn('deceased sync fetched far fewer rows than stored; deletions skipped', { source: src.source });
        }
      } catch (e) {
        logger.error('deceased register sync failed', { source: src.source, error: String(e) });
      }
    }
  },
);

// ── Client-initiated broadcast ──────────────────────────────────────────────
//
// sendPushToCity / sendPushToRoles in the app used to read pushTokens and POST
// to exp.host straight from the device. On native that works; from the web build
// the browser blocks the POST (exp.host sends no CORS headers), so a manager
// publishing from kehilink.com saved the change and nobody was notified. The
// send has to come from a server, which also means the token lookup no longer
// depends on the caller being allowed to read pushTokens.

const PUSH_SENDER_ROLES = [
  'city_admin', 'super_admin', 'dev', 'content_admin',
  'eruv_manager', 'event_manager', 'kosher_manager',
];

export const sendPush = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'יש להתחבר.');

  const { cityId, title, body, data, areaIds, roles, excludeGuests, channelId } = (request.data ?? {}) as {
    cityId?: string; title?: string; body?: string;
    data?: Record<string, unknown>; areaIds?: string[] | null; roles?: string[] | null;
    excludeGuests?: boolean; channelId?: string;
  };
  if (!cityId || !title) throw new HttpsError('invalid-argument', 'cityId ו-title נדרשים.');

  const me = (await db.collection('users').doc(uid).get()).data() ?? {};
  const myRoles: string[] = me.roles ?? [me.role ?? 'user'];
  if (!myRoles.some((r) => PUSH_SENDER_ROLES.includes(r))) {
    throw new HttpsError('permission-denied', 'אין הרשאה לשלוח התראות.');
  }
  const unscoped = myRoles.includes('super_admin') || myRoles.includes('dev');
  if (cityId === 'all' ? !unscoped : (!unscoped && cityId !== (me.homeCityId ?? me.cityId))) {
    throw new HttpsError('permission-denied', 'אין הרשאה לעיר זו.');
  }

  const tokensRef = db.collection('pushTokens');
  const snap = cityId === 'all' ? await tokensRef.get() : await tokensRef.where('cityId', '==', cityId).get();
  const entries: TokenEntry[] = [];
  snap.forEach((d) => {
    const t = d.data();
    if (!t.token) return;
    if (excludeGuests && t.role === 'guest') return;
    if (areaIds && !areaIds.includes(t.homeAreaId)) return;
    if (roles) {
      const tokenRoles: string[] = t.roles ?? [t.role];
      if (!tokenRoles.some((r) => roles.includes(r))) return;
    }
    entries.push({ docId: d.id, token: t.token });
  });

  const { ok, failReasons } = await sendExpoPush(entries, title, body ?? '', data ?? {}, channelId);
  return { targeted: entries.length, sent: ok, failReasons };
});
