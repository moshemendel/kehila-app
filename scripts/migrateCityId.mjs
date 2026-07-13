/**
 * migrateCityId.mjs
 * Updates all user docs with cityId 'maale-adumim' → 'city-1'.
 *
 * Usage:
 *   node scripts/migrateCityId.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync }        from 'fs';
import { fileURLToPath }       from 'url';
import { dirname, join }       from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const sa    = JSON.parse(readFileSync(join(__dir, '../data/serviceAccount.json'), 'utf8'));

initializeApp({ credential: cert(sa) });
const db = getFirestore();

const OLD = 'maale-adumim';
const NEW = 'city-1';

const snap = await db.collection('users').where('cityId', '==', OLD).get();
if (snap.empty) {
  console.log(`No users found with cityId="${OLD}" — nothing to migrate.`);
  process.exit(0);
}

const batch = db.batch();
snap.forEach((doc) => {
  batch.update(doc.ref, { cityId: NEW });
  console.log(`  · ${doc.data().email ?? doc.id}`);
});
await batch.commit();
console.log(`\n✓ Migrated ${snap.size} user(s) from "${OLD}" → "${NEW}"`);
console.log('Sign out and sign back in to see data.');
