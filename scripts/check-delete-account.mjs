/**
 * End-to-end check of deleteMyAccount against the DEPLOYED function.
 *
 *   node scripts/check-delete-account.mjs
 *
 * Account deletion is the one action in this app with no undo, and it is a code
 * path nobody exercises until a real person asks to leave — which is the worst
 * moment to discover that a query needed an index or a field name was wrong. So
 * it is exercised here instead, on a throwaway account seeded with one row of
 * every kind the function claims to handle.
 *
 * Asserts both halves of the promise the confirmation screen makes: personal
 * data is gone, and published content survives with the name stripped off.
 * Cleans up whatever it created, including on failure.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const auth = getAuth();
// The Web API key, read from the app's own config so there is only ever one
// copy of it. It is public by design — it ships inside the client bundle.
const apiKey = readFileSync('src/services/firebase.ts', 'utf8').match(/apiKey:\s*"([^"]+)"/)[1];

const CITY = 'city-1';
const stamp = Date.now();
const URL = `https://europe-west1-${sa.project_id}.cloudfunctions.net/deleteMyAccount`;

let uid = null, failures = 0;
const made = [];               // [collection, id] to clean up if the run dies

function check(label, pass, detail = '') {
  if (!pass) failures++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

try {
  const user = await auth.createUser({
    email: `delete-check-${stamp}@kehila.test`, password: `p${stamp}A!`,
  });
  uid = user.uid;

  // One row of everything the function touches.
  const seed = async (col, id, data) => {
    await db.collection(col).doc(id).set(data);
    made.push([col, id]);
  };
  await seed('users', uid, {
    email: user.email, displayName: 'delete check', role: 'user', roles: ['user'],
    cityId: CITY, homeCityId: CITY, createdAt: new Date(),
  });
  await seed('pushTokens', `delete-check-${stamp}`, { uid, cityId: CITY, token: 'ExponentPushToken[x]' });
  await seed('analyticsEvents', `delete-check-${stamp}`, { uid, cityId: CITY, feature: 'home', date: '2026-09-02' });
  await seed('pending_gemachs', `delete-check-${stamp}`, {
    cityId: CITY, name: 'בדיקה', submittedBy: uid, submittedByName: 'delete check', status: 'pending',
  });
  await seed('gemachs', `delete-check-${stamp}`, {
    cityId: CITY, name: 'גמח בדיקה', category: 'other', isActive: true, createdBy: uid, createdAt: new Date(),
  });
  await seed('eruvReports', `delete-check-${stamp}`, {
    cityId: CITY, userId: uid, userDisplayName: 'delete check',
    type: 'question', description: 'בדיקה', status: 'open',
  });

  const custom = await auth.createCustomToken(uid);
  const { idToken } = await (await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }) })).json();

  console.log('\ncalling the deployed deleteMyAccount...\n');
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200) {
    console.error(`  function returned ${res.status}: ${JSON.stringify(body)}`);
    failures++;
  } else {
    console.log(`  returned: ${JSON.stringify(body.result)}\n`);
  }

  // ── The account and everything personal is gone ────────────────────────
  check('auth record deleted',
    await auth.getUser(uid).then(() => false, () => true));
  check('profile deleted',
    !(await db.collection('users').doc(uid).get()).exists);
  check('device token deleted',
    !(await db.collection('pushTokens').doc(`delete-check-${stamp}`).get()).exists);
  check('analytics deleted',
    !(await db.collection('analyticsEvents').doc(`delete-check-${stamp}`).get()).exists);
  check('unapproved submission deleted',
    !(await db.collection('pending_gemachs').doc(`delete-check-${stamp}`).get()).exists);

  // ── Published content survives, without the name ───────────────────────
  const gem = await db.collection('gemachs').doc(`delete-check-${stamp}`).get();
  check('published gemach kept', gem.exists);
  check('gemach no longer linked to the person',
    gem.data()?.createdBy === 'deleted-account', `createdBy=${gem.data()?.createdBy}`);

  const rep = await db.collection('eruvReports').doc(`delete-check-${stamp}`).get();
  check('open report kept', rep.exists);
  check('report no longer linked to the person',
    rep.data()?.userId === 'deleted-account' && rep.data()?.userDisplayName === undefined,
    `userId=${rep.data()?.userId} name=${rep.data()?.userDisplayName ?? '(gone)'}`);
} finally {
  for (const [col, id] of made) await db.collection(col).doc(id).delete().catch(() => {});
  if (uid) await auth.deleteUser(uid).catch(() => {});
  console.log('\nseeded rows removed');
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
