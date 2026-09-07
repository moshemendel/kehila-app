// Removes the legacy `polygon` field from every eruvStatus document.
// Run once:  node scripts/remove-eruv-legacy-polygon.mjs
//
// `polygon` held a single flat ring, from before an eruv could enclose more
// than one separated area. `polygons` replaced it, and setEruvPolygon() has
// only ever written the new field — so the old one froze at whatever it held on
// migration day and has been drifting ever since. On city-1 it was already four
// points behind, and it knew nothing at all about the second ring covering
// נופי סלע.
//
// A stale mirror is worse than no mirror: every reader prefers `polygons`, so
// the only thing `polygon` can still do is feed an outdated outline to
// something that falls back to it. Both clients (this app and the admin
// console) read `polygons` first and neither writes `polygon`, so nothing is
// losing data here — but the value is saved to data/ first anyway, following
// the same convention as the other deletions kept there.

import { readFileSync, writeFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const sa = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const stamp = new Date().toISOString().slice(0, 10);
const backupPath = `data/deleted-eruv-legacy-polygon-${stamp}.json`;

const snap = await db.collection('eruvStatus').get();
const backup = [];
const batch = db.batch();

for (const doc of snap.docs) {
  const data = doc.data();
  if (!('polygon' in data)) continue;

  const legacy = data.polygon ?? [];
  const current = (data.polygons ?? []).map((p) => p.points ?? []);

  backup.push({ collection: 'eruvStatus', id: doc.id, polygon: legacy });
  batch.update(doc.ref, { polygon: FieldValue.delete() });

  console.log(`${doc.id}: dropping ${legacy.length} legacy point(s); `
    + `${current.length} polygon(s) remain with ${current.map((p) => p.length).join(' + ')} points`);

  // The whole reason to delete rather than repair: if the superseding field is
  // somehow thinner than the one being removed, this is not a stale mirror and
  // someone should look before anything is thrown away.
  if (!current.length) {
    console.error(`  ${doc.id} has no polygons[] — refusing, this would lose the only boundary.`);
    process.exit(1);
  }
}

if (!backup.length) {
  console.log('No eruvStatus document carries `polygon` — nothing to do.');
  process.exit(0);
}

writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nsaved the removed values to ${backupPath}`);

await batch.commit();
console.log(`removed \`polygon\` from ${backup.length} eruvStatus document(s).`);
console.log('getEruvPolygons() no longer looks for it — see src/services/eruv.ts.');
