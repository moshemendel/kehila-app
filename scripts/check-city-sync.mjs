/**
 * End-to-end check of incremental sync against the LOCAL EMULATOR only:
 * the syncStamp trigger (functions/src/index.ts) and the client side
 * (src/services/citySync.ts) together.
 *
 *   npm --prefix functions run build
 *   npx firebase-tools@latest emulators:exec --project demo-kehila  *     --only firestore,functions "node scripts/check-city-sync.mjs"
 *
 * firebase-tools 14.x cannot load firebase-functions v7 (it calls the removed
 * functions.config()); 15.x can. On this Windows machine the Firestore
 * emulator's JVM also needs JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=<a
 * short writable dir>, or it dies opening its selector pipe.
 *
 * A demo- project id never reaches a real backend, and this script refuses to
 * start without FIRESTORE_EMULATOR_HOST, so it cannot write to production.
 *
 * What it proves:
 *   1. a write gets a server syncedAt, and the trigger does not re-stamp itself
 *   2. a forged syncedAt from a client is overwritten
 *   3. a first open does a full read and stores a resumable copy
 *   4. a second open resumes from that copy and fetches ONLY what changed
 *      (an unchanged document deliberately altered in the stored copy stays
 *      altered, which it would not if everything had been re-read)
 *   5. edits, deletes and a move to another city made while the phone was
 *      away all arrive; a live edit arrives while subscribed
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is not set — run this under `firebase emulators:exec` (see header).');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Compiled under node_modules so `firebase/firestore` resolves to the app's copy.
const outDir = join(root, 'node_modules', '.cache', 'check-city-sync');
execFileSync(process.execPath, [
  join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  join(root, 'src', 'services', 'citySync.ts'),
  '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020',
  '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck',
], { stdio: 'inherit' });

const require = createRequire(join(outDir, 'x.js'));
const { subscribeCitySync, syncCacheKey } = require('./citySync.js');
const { initializeApp } = require('firebase/app');
const { getFirestore, connectFirestoreEmulator, terminate } = require('firebase/firestore');
const admin = require('firebase-admin');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-kehila';
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');

admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, host, Number(port));

const CITY = 'sync-check-city';
const OTHER = 'sync-check-other';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

async function until(fn, label, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for: ${label}`);
    await sleep(250);
  }
}
const stampOf = async (id) => (await adb.collection('synagogues').doc(id).get()).get('syncedAt');

/** In-memory AsyncStorage stand-in, shared across "app opens". */
const memory = new Map();
const store = {
  getItem: async (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: async (k, v) => { memory.set(k, v); },
  removeItem: async (k) => { memory.delete(k); },
};

/** One app open: subscribe, wait until the server has answered, return states. */
async function open(label, { keep = false } = {}) {
  const states = [];
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); origWarn(...a); };
  const stop = subscribeCitySync(db, store, 'synagogues', CITY, (s) => states.push(s), { overlapMs: 0 });
  await until(() => states.some((s) => s.synced), `${label}: synced`);
  await sleep(600); // let the debounced persist land
  console.warn = origWarn;
  if (!keep) stop();
  const last = () => states[states.length - 1];
  return { states, warns, stop, last, byId: () => Object.fromEntries(last().docs.map((d) => [d.id, d])) };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
const col = adb.collection('synagogues');
for (const id of ['s1', 's2', 's3', 's5']) {
  await col.doc(id).set({ cityId: CITY, name: `שול ${id}` });
}
for (const id of ['s1', 's2', 's3', 's5']) await until(() => stampOf(id), `${id} stamped`);
check(true, 'trigger stamps new documents with syncedAt');

// 1. No self-loop: the stamp must stay put once written.
const first = (await stampOf('s1')).toMillis();
await sleep(3000);
check((await stampOf('s1')).toMillis() === first, 'trigger does not re-stamp its own stamp');

// 2. A forged far-future stamp is replaced with server time.
const future = admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 864e5);
await col.doc('s5').update({ syncedAt: future });
await until(async () => (await stampOf('s5')).toMillis() < Date.now() + 60_000, 's5 forged stamp overwritten');
check(true, 'forged future syncedAt is overwritten');

// ── 3. First open: full read ─────────────────────────────────────────────────
const o1 = await open('first open');
check(o1.last().docs.length === 4, `first open shows all 4 documents (got ${o1.last().docs.length})`);
const stored = JSON.parse(memory.get(syncCacheKey('synagogues', CITY)) ?? 'null');
check(stored && typeof stored.cursor === 'number', 'first open stores a copy with a cursor');

// Tamper with an unchanged document in the stored copy. A delta never
// re-reads it, so the tampered value must survive the next open.
stored.docs.s5.name = 'TAMPERED-IN-CACHE';
memory.set(syncCacheKey('synagogues', CITY), JSON.stringify(stored));

// ── Changes while the phone is away ──────────────────────────────────────────
await sleep(1100); // so new stamps are strictly after the stored cursor
await col.doc('s1').update({ name: 'שול s1 — עודכן' });
await col.doc('s2').delete();
await col.doc('s3').update({ cityId: OTHER });
await col.doc('s4').set({ cityId: CITY, name: 'שול s4 חדש' });
await until(async () => (await stampOf('s4')) && (await stampOf('s1')).toMillis() > stored.cursor, 'away edits stamped');
await until(async () => (await adb.collection('syncTombstones').where('cityId', '==', CITY).get()).size >= 2, 'tombstones written');

// ── 4/5. Second open: resume from the stored copy ────────────────────────────
const o2 = await open('second open', { keep: true });
check(o2.states[0] && !o2.states[0].synced && o2.states[0].docs.length === 4,
  'second open shows the stored copy before the server answers');
check(o2.warns.length === 0, 'second open ran as a delta, with no fallback to a full read');
let got = o2.byId();
check(got.s1?.name === 'שול s1 — עודכן', 'an edit made while away arrives');
check(!got.s2, 'a delete made while away is applied (tombstone)');
check(!got.s3, 'a document moved to another city leaves this city (tombstone)');
check(got.s4?.name === 'שול s4 חדש', 'a document created while away arrives');
check(got.s5?.name === 'TAMPERED-IN-CACHE', 'an unchanged document was NOT re-read');

// Live edit while subscribed.
await col.doc('s4').update({ name: 'שול s4 — חי' });
await until(() => o2.byId().s4?.name === 'שול s4 — חי', 'live edit arrives');
check(true, 'a live edit arrives while subscribed');
o2.stop();

// ── Clean up ─────────────────────────────────────────────────────────────────
for (const id of ['s1', 's3', 's4', 's5']) await col.doc(id).delete().catch(() => {});
await terminate(db);
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
