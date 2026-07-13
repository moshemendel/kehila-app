/**
 * uploadRestaurants.mjs
 * Uploads data/restaurants.json to Firestore.
 *
 * Usage:
 *   node scripts/uploadRestaurants.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync }        from 'fs';
import { fileURLToPath }       from 'url';
import { dirname, join }       from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const sa    = JSON.parse(readFileSync(join(__dir, '../data/serviceAccount.json'), 'utf8'));
const data  = JSON.parse(readFileSync(join(__dir, '../data/restaurants.json'), 'utf8'));

initializeApp({ credential: cert(sa) });
const db = getFirestore();

const batch = db.batch();
for (const restaurant of data) {
  const { id, ...fields } = restaurant;
  batch.set(db.collection('restaurants').doc(id), fields);
}
await batch.commit();

console.log(`✅ Uploaded ${data.length} restaurants to Firestore`);
