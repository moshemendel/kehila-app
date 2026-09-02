/**
 * End-to-end check of the content_admin role against the LIVE ruleset.
 *
 *   node scripts/check-content-admin.mjs
 *
 * content_admin is the role a city_admin delegates to, and the whole point of
 * it is a split: authority over everything the app publishes, and none at all
 * over accounts or the city record. That split is only real if the rules
 * enforce it, and a rule that errors at evaluation time is reported as
 * permission-denied — indistinguishable from one that deliberately said no. So
 * this asserts both directions, against the deployed rules, as a real signed-in
 * account.
 *
 * Touches no existing data: it creates two throwaway accounts and one throwaway
 * synagogue, and removes all three in a finally.
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

let actor = null, target = null, synId = null, failures = 0;

function report(expected, label, res) {
  const got = res.status === 200 ? 'ALLOWED' : 'DENIED';
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(46)} ${got} (expected ${expected})`);
}

try {
  actor  = await auth.createUser({ email: `rules-check-actor-${stamp}@kehila.test`,  password: `p${stamp}A!` });
  target = await auth.createUser({ email: `rules-check-target-${stamp}@kehila.test`, password: `p${stamp}B!` });

  await db.collection('users').doc(actor.uid).set({
    email: actor.email, displayName: 'rules check — content_admin',
    role: 'content_admin', roles: ['content_admin'],
    cityId: CITY, homeCityId: CITY, createdAt: new Date(),
  });
  await db.collection('users').doc(target.uid).set({
    email: target.email, displayName: 'rules check — target',
    role: 'user', roles: ['user'],
    cityId: CITY, homeCityId: CITY, createdAt: new Date(),
  });

  const custom = await auth.createCustomToken(actor.uid);
  const { idToken } = await (await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }) })).json();
  const authed = (extra = {}) => ({
    Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', ...extra });

  console.log('\nas content_admin of city-1, against the live rules:\n');

  // ── May publish content ────────────────────────────────────────────────
  synId = `rules-check-${stamp}`;
  report('ALLOWED', 'create a synagogue in its city', await fetch(
    `${REST}/synagogues?documentId=${synId}`,
    { method: 'POST', headers: authed(), body: JSON.stringify({ fields: {
        cityId: { stringValue: CITY }, name: { stringValue: 'בדיקת הרשאות' },
      } }) }));

  report('ALLOWED', 'rename that synagogue', await fetch(
    `${REST}/synagogues/${synId}?updateMask.fieldPaths=name`,
    { method: 'PATCH', headers: authed(),
      body: JSON.stringify({ fields: { name: { stringValue: 'בדיקה 2' } } }) }));

  // ── May NOT touch accounts, or the city itself ─────────────────────────
  report('DENIED', "grant itself a role", await fetch(
    `${REST}/users/${actor.uid}?updateMask.fieldPaths=roles`,
    { method: 'PATCH', headers: authed(), body: JSON.stringify({ fields: {
        roles: { arrayValue: { values: [{ stringValue: 'city_admin' }] } } } }) }));

  report('DENIED', "change another account's roles", await fetch(
    `${REST}/users/${target.uid}?updateMask.fieldPaths=roles`,
    { method: 'PATCH', headers: authed(), body: JSON.stringify({ fields: {
        roles: { arrayValue: { values: [{ stringValue: 'gabbai' }] } } } }) }));

  report('DENIED', 'edit the city record', await fetch(
    `${REST}/cities/${CITY}?updateMask.fieldPaths=name`,
    { method: 'PATCH', headers: authed(),
      body: JSON.stringify({ fields: { name: { stringValue: 'nope' } } }) }));

  report('DENIED', 'switch off a module for the city', await fetch(
    `${REST}/cities/${CITY}?updateMask.fieldPaths=modules.Gemach`,
    { method: 'PATCH', headers: authed(),
      body: JSON.stringify({ fields: { modules: { mapValue: { fields: {
        Gemach: { stringValue: 'off' } } } } } }) }));
} finally {
  if (synId)  await db.collection('synagogues').doc(synId).delete().catch(() => {});
  if (actor)  { await db.collection('users').doc(actor.uid).delete().catch(() => {});  await auth.deleteUser(actor.uid).catch(() => {}); }
  if (target) { await db.collection('users').doc(target.uid).delete().catch(() => {}); await auth.deleteUser(target.uid).catch(() => {}); }
  console.log('\ntest accounts and synagogue removed');
}

console.log(failures ? `\n${failures} EXPECTATION(S) FAILED` : '\nall expectations held');
process.exit(failures ? 1 : 0);
