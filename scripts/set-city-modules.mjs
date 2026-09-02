/**
 * Turns a city's modules on, off, or holds them back — the switch the app reads
 * from the city document.
 *
 *   node scripts/set-city-modules.mjs                          list every city
 *   node scripts/set-city-modules.mjs city-1                   show one city
 *   node scripts/set-city-modules.mjs city-1 Gemach=off
 *   node scripts/set-city-modules.mjs city-1 Businesses=soon Eruv=off
 *   node scripts/set-city-modules.mjs city-1 Gemach=live       back to default
 *
 * States:
 *   live  the section works. The default — a city nobody has configured gets
 *         the whole app.
 *   soon  built, held back, still visible with a "בקרוב" screen, so the entry
 *         point stays where people expect it.
 *   off   this city does not offer it. Gone from the tabs, the home shortcuts,
 *         the More screen and the search filters.
 *
 * Setting a module to `live` removes the key rather than writing "live", so the
 * document only ever records the exceptions.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const MODULES = [
  'Synagogues', 'PrayerTimes', 'Zmanim', 'Businesses', 'Mikveh',
  'Events', 'Eruv', 'Gemach', 'Selichot',
  'mikvehBooking', 'zmanimSettings',
];
const STATES = ['live', 'soon', 'off'];

initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();

const [cityId, ...assignments] = process.argv.slice(2);

function show(id, data) {
  const mods = data.modules ?? {};
  console.log(`\n${id}  (${data.name ?? '—'})`);
  for (const m of MODULES) {
    const state = mods[m] ?? 'live';
    const flag = state === 'live' ? '   ' : state === 'soon' ? ' ~ ' : ' x ';
    console.log(`  ${flag} ${m.padEnd(16)} ${state}`);
  }
}

if (!cityId) {
  const snap = await db.collection('cities').get();
  for (const d of snap.docs) show(d.id, d.data());
  console.log('\npass a city id to change it, e.g.  node scripts/set-city-modules.mjs city-1 Gemach=off');
  process.exit(0);
}

const ref = db.collection('cities').doc(cityId);
const doc = await ref.get();
if (!doc.exists) {
  console.error(`no such city: ${cityId}`);
  process.exit(1);
}

if (!assignments.length) {
  show(cityId, doc.data());
  process.exit(0);
}

const update = {};
for (const a of assignments) {
  const [key, state] = a.split('=');
  if (!MODULES.includes(key)) {
    console.error(`unknown module: ${key}\n  one of: ${MODULES.join(', ')}`);
    process.exit(1);
  }
  if (!STATES.includes(state)) {
    console.error(`unknown state: ${state}\n  one of: ${STATES.join(', ')}`);
    process.exit(1);
  }
  // `live` is the default, so it is recorded as the absence of a key rather
  // than as a value — the document keeps only the exceptions.
  update[`modules.${key}`] = state === 'live' ? FieldValue.delete() : state;
  console.log(`  ${key} → ${state}`);
}

await ref.update(update);
console.log('\nsaved. The app picks this up on its next read of the city — no build, no update.');
show(cityId, (await ref.get()).data());
