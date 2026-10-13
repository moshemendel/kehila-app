/**
 * One-off: give every existing document in the synced collections a
 * `syncedAt`, so phones can start resuming from a cursor immediately instead
 * of waiting for each city's first edit. Run once, after the syncStamp
 * triggers are deployed, then delete this file.
 *
 *   node scripts/backfill-synced-at.mjs           # dry run: counts only
 *   node scripts/backfill-synced-at.mjs --write
 *
 * Safe to re-run: documents that already carry a stamp are skipped. The
 * trigger sees each of these writes as "only syncedAt changed, and fresh" and
 * leaves it alone, so this costs one write per document and nothing more.
 * Auth: scripts/serviceAccount.json.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const COLLECTIONS = ['synagogues', 'businesses', 'events', 'kashrutUpdates'];
const write = process.argv.includes('--write');

initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();

for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  const missing = snap.docs.filter((d) => !d.get('syncedAt'));
  console.log(`${name}: ${snap.size} documents, ${missing.length} without syncedAt`);
  if (!write) continue;
  for (let i = 0; i < missing.length; i += 400) {
    const batch = db.batch();
    missing.slice(i, i + 400).forEach((d) => batch.update(d.ref, { syncedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }
}
if (!write) console.log('\nDry run. Re-run with --write to stamp.');
