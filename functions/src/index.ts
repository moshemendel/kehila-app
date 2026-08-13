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

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const REGION = 'europe-west1';

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
  const wanted = new Set(uids);
  // Read every token for the city's users in one pass rather than chunking an
  // `in` query — the collection is small and this avoids the 30-value limit.
  const snap = await db.collection('pushTokens').get();
  const out: TokenEntry[] = [];
  snap.forEach((d) => {
    const data = d.data() as { uid?: string; token?: string };
    if (data.uid && data.token && wanted.has(data.uid)) {
      out.push({ docId: d.id, token: data.token });
    }
  });
  return out;
}

async function sendExpoPush(
  entries: TokenEntry[],
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map(({ token }) => ({ to: token, title, body, data, sound: 'default' })),
      ),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { status: string; details?: { error?: string } }[];
    } | null;

    // Prune tokens for uninstalled apps, same cleanup the client does.
    await Promise.all(
      (json?.data ?? []).map(async (ticket, idx) => {
        if (ticket.status !== 'ok' && ticket.details?.error === 'DeviceNotRegistered') {
          const docId = chunk[idx]?.docId;
          if (docId) await db.collection('pushTokens').doc(docId).delete().catch(() => undefined);
        }
      }),
    );
  }
}

// ── Trigger ─────────────────────────────────────────────────────────────────

export const onContentReportCreated = onDocumentCreated(
  { document: 'contentReports/{reportId}', region: REGION },
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
 * Same fix for eruv reports. The client already tried to notify eruv managers
 * from EruvScreen, but that call reads pushTokens and is denied for any
 * non-admin reporter — so in practice it only ever fired when an admin happened
 * to file the report. Handled here instead; the client call should be removed.
 */
export const onEruvReportCreated = onDocumentCreated(
  { document: 'eruvReports/{reportId}', region: REGION },
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
