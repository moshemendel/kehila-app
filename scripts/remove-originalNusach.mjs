// Removes the `originalNusach` field from every synagogue document.
// Run once:  node scripts/remove-originalNusach.mjs
//
// Prerequisites:
//   1. Download your Firebase service-account JSON from:
//      Firebase Console → Project settings → Service accounts → Generate new private key
//   2. Save it as  scripts/serviceAccount.json
//   3. npm install -D firebase-admin  (if not already installed)

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const sa = JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('synagogues').get();
const batch = db.batch();
let count = 0;

snap.docs.forEach(doc => {
  if ('nusach' in doc.data()) {
    batch.update(doc.ref, { nusach: FieldValue.delete() });
    count++;
  }
});

if (count === 0) {
  console.log('No documents have originalNusach — nothing to do.');
} else {
  await batch.commit();
  console.log(`Removed originalNusach from ${count} synagogue(s).`);
}
