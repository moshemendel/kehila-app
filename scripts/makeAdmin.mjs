/**
 * makeAdmin.mjs
 * Promotes a Firebase Auth user to admin in Firestore.
 *
 * Usage:
 *   node scripts/makeAdmin.mjs your@email.com
 *
 * Requires: data/serviceAccount.json
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth }             from 'firebase-admin/auth';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync }        from 'fs';
import { fileURLToPath }       from 'url';
import { dirname, join }       from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const sa    = JSON.parse(readFileSync(join(__dir, '../data/serviceAccount.json'), 'utf8'));

initializeApp({ credential: cert(sa) });

const auth = getAuth();
const db   = getFirestore();

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/makeAdmin.mjs your@email.com');
  process.exit(1);
}

console.log(`Looking up user: ${email}`);

let user;
try {
  user = await auth.getUserByEmail(email);
} catch {
  console.error(`No Firebase Auth user found with email: ${email}`);
  console.error('Register in the app first, then run this script.');
  process.exit(1);
}

console.log(`Found user: ${user.uid} (${user.displayName ?? 'no display name'})`);

await db.collection('users').doc(user.uid).set({
  uid:                  user.uid,
  email:                user.email,
  displayName:          user.displayName ?? email.split('@')[0],
  cityId:               'city-1',
  role:                 'admin',
  managedSynagogueIds:  [],
  managedRestaurantIds: [],
  createdAt:            new Date(),
}, { merge: true });

console.log(`✓ ${email} is now admin for cityId=city-1`);
console.log('Sign out and sign back in to pick up the new role.');
