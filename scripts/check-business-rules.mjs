/**
 * End-to-end check of the businesses rules against the LIVE ruleset, as a real
 * signed-in user — the only way to be sure, since a rule that errors at
 * evaluation time is reported as permission-denied, identical to one that
 * deliberately said no.
 *
 *   node scripts/check-business-rules.mjs
 *
 * Mints a custom token for an existing account, exchanges it for an ID token,
 * and PATCHes one field from each permission group through the Firestore REST
 * API. The document is restored from a snapshot taken first, whatever happens.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const apiKey = readFileSync('scripts/seed.mjs', 'utf8').match(/apiKey:\s*"([^"]+)"/)[1];

const EMAIL = process.argv[2] ?? 'a0548408679@gmail.com';
const BIZ   = process.argv[3] ?? 'CQlGMStH6c1pphwEtYPP';

const user   = await getAuth().getUserByEmail(EMAIL);
const doc    = await db.collection('users').doc(user.uid).get();
const u      = doc.data() ?? {};
console.log(`${EMAIL}\n  roles: ${JSON.stringify(u.roles)}\n  homeCityId: ${u.homeCityId}`);
console.log(`  operates this business: ${(u.managedRestaurantIds ?? []).includes(BIZ)}\n`);

const custom = await getAuth().createCustomToken(user.uid);
const { idToken } = await (await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }) })).json();

const snap   = await db.collection('businesses').doc(BIZ).get();
const before = snap.data();
const DOC = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/businesses/${BIZ}`;

async function attempt(group, field) {
  const res = await fetch(`${DOC}?updateMask.fieldPaths=${field}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [field]: { stringValue: `check-${Date.now()}` } } }),
  });
  console.log('  %s %s', `${group} (${field})`.padEnd(30), res.status === 200 ? 'ALLOWED' : 'DENIED');
}

try {
  console.log('live rules:');
  await attempt('operations', 'website');
  await attempt('kashrut',    'mashgiachName');
  await attempt('identity',   'name');
} finally {
  await db.collection('businesses').doc(BIZ).set(before);
  console.log('\ndocument restored');
}
