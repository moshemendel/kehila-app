/**
 * Why registerPushToken is denied, against the LIVE ruleset.
 *
 *   node scripts/check-push-rules.mjs
 *
 * Every sign-in logs "[Push] registerPushToken failed: permission-denied" and
 * the app swallows it — the token is a nice-to-have, so the write is wrapped in
 * a catch that only warns. The cost of that is invisible: a device that never
 * registers never receives anything sent to it.
 *
 * The pushTokens rule compares what the client sends against the account's own
 * profile document, so a denial means one of those comparisons is false. Rather
 * than reason about which, this sends the same shapes the app sends and reports
 * each verdict. Throwaway account, removed afterwards.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const auth = getAuth();
const apiKey = readFileSync('scripts/seed.mjs', 'utf8').match(/apiKey:\s*"([^"]+)"/)[1];

const CITY = 'city-1';
const stamp = Date.now();
const REST = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;

let uid = null;
const madeDocs = [];

const strArray = (a) => ({ arrayValue: { values: a.map((v) => ({ stringValue: v })) } });

async function attempt(label, uidField, role, roles) {
  const docId = `push-check-${stamp}`;
  const res = await fetch(`${REST}/pushTokens?documentId=${docId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      token:     { stringValue: 'ExponentPushToken[check]' },
      uid:       { stringValue: uidField },
      cityId:    { stringValue: CITY },
      role:      { stringValue: role },
      roles:     strArray(roles),
      updatedAt: { timestampValue: new Date().toISOString() },
    } }),
  });
  const ok = res.status === 200;
  if (ok) { madeDocs.push(docId); await db.collection('pushTokens').doc(docId).delete().catch(() => {}); }
  console.log(`  ${ok ? 'ALLOWED' : 'DENIED '}  ${label}`);
  return ok;
}

let idToken = null;

try {
  // A profile shaped like a real manager: a singular role plus a roles array,
  // which is what every account carries since the backfill.
  const user = await auth.createUser({ email: `push-check-${stamp}@kehila.test`, password: `p${stamp}A!` });
  uid = user.uid;
  await db.collection('users').doc(uid).set({
    email: user.email, displayName: 'push check',
    role: 'kosher_manager', roles: ['kosher_manager', 'gabbai'],
    cityId: CITY, homeCityId: CITY, createdAt: new Date(),
  });

  const custom = await auth.createCustomToken(uid);
  ({ idToken } = await (await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }) })).json());

  console.log('\nprofile: role=kosher_manager  roles=["kosher_manager","gabbai"]\n');
  console.log('what the app sends:');
  await attempt('exactly the profile          (role + roles, matching order)', uid, 'kosher_manager', ['kosher_manager', 'gabbai']);

  console.log('\nnarrowing:');
  await attempt('roles in a different order', uid, 'kosher_manager', ['gabbai', 'kosher_manager']);
  await attempt('roles collapsed to [role]', uid, 'kosher_manager', ['kosher_manager']);
  await attempt('someone else\'s uid in the payload', 'not-my-uid', 'kosher_manager', ['kosher_manager', 'gabbai']);
  await attempt('a role the profile does not hold', uid, 'city_admin', ['city_admin']);
} finally {
  for (const d of madeDocs) await db.collection('pushTokens').doc(d).delete().catch(() => {});
  if (uid) {
    await db.collection('users').doc(uid).delete().catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log('\ntest account removed');
}
