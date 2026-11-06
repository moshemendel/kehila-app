/**
 * Copies one city's data into a new, hidden city — a sandbox for demos, so a
 * prospect can be made its city_admin without touching a real community.
 *
 *   node scripts/clone-city.mjs <srcCityId> <newCityId> "<new name>"            dry run
 *   node scripts/clone-city.mjs <srcCityId> <newCityId> "<new name>" --apply    write
 *
 * Copied: the city document, areas, synagogues, businesses, mikvaot, events,
 * gemachs, cemeteries, eruvStatus, kashrutUpdates. Every doc gets a fresh id,
 * and cityId / areaId / areaIds / parentId / businessId / its own `id` field
 * are remapped so the copy never points back into the source city.
 *
 * Not copied: users, push tokens, analytics, mikveh appointments (private
 * bookings), pending_* queues, deceased register. Uploaded images keep their
 * URLs, so they are shared with the source, not duplicated.
 *
 * The new city is created `hidden`: absent from every list for residents, still
 * visible to its own staff and to super admins. Refuses to overwrite an
 * existing city id.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const args = process.argv.slice(2).filter((a) => a !== '--apply');
const apply = process.argv.includes('--apply');
const [src, dst, name] = args;
if (!src || !dst || !name) {
  console.error('usage: node scripts/clone-city.mjs <srcCityId> <newCityId> "<new name>" [--apply]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();

const srcDoc = await db.collection('cities').doc(src).get();
if (!srcDoc.exists) { console.error(`no such city: ${src}`); process.exit(1); }
if ((await db.collection('cities').doc(dst).get()).exists) {
  console.error(`city ${dst} already exists — refusing to overwrite`); process.exit(1);
}

const COLLECTIONS = ['areas', 'synagogues', 'businesses', 'mikvaot', 'events',
  'gemachs', 'cemeteries', 'eruvStatus', 'kashrutUpdates'];

// Pass 1: read everything and assign new ids, so pass 2 can remap references.
const idMap = {};   // old id -> new id, across collections (auto ids don't collide)
const loaded = {};
for (const col of COLLECTIONS) {
  const snap = await db.collection(col).where('cityId', '==', src).get();
  loaded[col] = snap.docs;
  for (const d of snap.docs) idMap[d.id] = db.collection(col).doc().id;
}
const remap = (v) => (typeof v === 'string' && idMap[v] ? idMap[v] : v);

function convert(data, oldId) {
  const out = { ...data, cityId: dst };
  if ('id' in out) out.id = idMap[oldId];
  for (const k of ['areaId', 'parentId', 'businessId']) if (k in out) out[k] = remap(out[k]);
  if (Array.isArray(out.areaIds)) out.areaIds = out.areaIds.map(remap);
  return out;
}

console.log(`${apply ? 'WRITING' : 'DRY RUN'}: ${src} -> ${dst} ("${name}")`);
const cityData = { ...srcDoc.data(), name, hidden: true };
delete cityData.nameEn;

if (apply) {
  await db.collection('cities').doc(dst).set(cityData);
}
for (const col of COLLECTIONS) {
  console.log(`  ${col.padEnd(16)} ${loaded[col].length}`);
  if (!apply) continue;
  let batch = db.batch(); let n = 0;
  for (const d of loaded[col]) {
    batch.set(db.collection(col).doc(idMap[d.id]), convert(d.data(), d.id));
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
}
console.log(apply ? 'done.' : 'dry run only — add --apply to write.');
