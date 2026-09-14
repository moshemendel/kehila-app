/**
 * Step 0, the other half: gives every EXISTING city a single default area,
 * and stamps that area's id onto its existing listings.
 *
 *   node scripts/backfillDefaultAreas.mjs
 *   node scripts/backfillDefaultAreas.mjs --city city-1 --write
 *
 * importAreas.mjs writes NEW areas for a regional council from the state's
 * locality register. This script is its mirror for a city that predates the
 * whole concept of an area: a single-locality tenant like מעלה אדומים, whose
 * one "area" is simply itself. It cannot share that script's path, because
 * this one touches documents that already exist and are already live — a
 * backfill, not an import.
 *
 * ── What "default" means, and why it matters that it's explicit ─────────────
 *
 * The default area is not a placeholder. It carries the city's own
 * latitude/longitude/elevation — the same numbers zmanim have always been
 * computed from — so nothing about what a resident sees changes on the day
 * this runs. `isDefault: true` is what area-aware code later reads to decide
 * "single-area tenant, hide every area control" (see the proposal's own
 * golden rule): a city with exactly one area, and that area marked default,
 * gets zero new UI, forever, unless someone deliberately adds a second area.
 *
 * `kind` is written explicitly too — 'city' if the city document does not
 * already declare one. Never overwritten: importAreas.mjs sets
 * 'regional_council' when it runs, and a re-run of THIS script must not
 * clobber that back to 'city' for a tenant that has since grown real areas.
 *
 * ── What gets backfilled, and what does not ──────────────────────────────────
 *
 * Every existing document in synagogues, businesses, mikvaot, events,
 * gemachs, pending_events and pending_gemachs — matching this city's cityId
 * and missing areaId — gets the default area's id. That list is exactly
 * "כל רשומה … מקבלת areaId" from the proposal, minus the collections that
 * are being restructured rather than backfilled: eruvStatus becomes a
 * different shape entirely in the eruv phase (one doc per area today, a
 * many-to-many eruvs/{id} collection with areaIds: string[] after), and
 * cemeteries do not exist yet as a collection. Config-shaped documents
 * (kashrutConfig, kashrutUpdates) are already scoped correctly at the
 * city/council level and are left alone.
 *
 * ── Safety ─────────────────────────────────────────────────────────────────
 *
 * Dry run by default, like importAreas.mjs. Idempotent: a document that
 * already has an areaId is left exactly as it is, on every dimension — this
 * script only ever fills an ABSENT field, on either the city or its records,
 * never overwrites one that is already set. Re-running it after Phase 1 or 2
 * has added real, non-default areas is therefore safe and does nothing.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const CONTENT_COLLECTIONS = [
  'synagogues', 'businesses', 'mikvaot', 'events', 'gemachs',
  'pending_events', 'pending_gemachs',
];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

const onlyCity = opt('--city');
const WRITE = flag('--write');

initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();

const citiesSnap = onlyCity
  ? await (async () => {
      const snap = await db.collection('cities').doc(onlyCity).get();
      if (!snap.exists) { console.error(`no such city: ${onlyCity}`); process.exit(1); }
      return { docs: [snap] };
    })()
  : await db.collection('cities').get();

console.log(`${citiesSnap.docs.length} tenant(s) to check\n`);

let totalWrites = 0;

for (const cityDoc of citiesSnap.docs) {
  const cityId = cityDoc.id;
  const city = cityDoc.data();
  console.log(`── ${cityId}  (${city.name ?? '—'}) ──────────────────────────`);

  if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) {
    console.log(`  SKIP — no latitude/longitude on the city document, nothing to seed the area from\n`);
    continue;
  }

  // Does a default area already exist for this tenant? Idempotency check,
  // not just a courtesy — re-running after real areas were added must not
  // create a second default or touch anything.
  const existingDefault = await db.collection('areas')
    .where('cityId', '==', cityId).where('isDefault', '==', true).limit(1).get();

  let areaId;
  let areaWrite = null;
  if (!existingDefault.empty) {
    areaId = existingDefault.docs[0].id;
    console.log(`  default area already exists: ${areaId} — reusing it`);
  } else {
    areaId = `area-default-${cityId}`;
    areaWrite = {
      cityId,
      name: city.name ?? cityId,
      latitude: city.latitude,
      longitude: city.longitude,
      ...(Number.isFinite(city.elevation) ? { elevation: city.elevation } : {}),
      radiusKm: 3,
      isDefault: true,
      parentId: null,
      source: 'backfill',
      updatedAt: FieldValue.serverTimestamp(),
    };
    console.log(`  will create default area ${areaId}  (${city.latitude}, ${city.longitude})`);
  }

  const cityUpdate = city.kind ? null : { kind: 'city' };
  console.log(cityUpdate
    ? `  will set kind: 'city' on the city document (currently unset)`
    : `  city document already has kind: '${city.kind}' — left as is`);

  const batch = db.batch();
  let batchOps = 0;
  if (areaWrite) { batch.set(db.collection('areas').doc(areaId), areaWrite); batchOps++; }
  if (cityUpdate) { batch.update(cityDoc.ref, cityUpdate); batchOps++; }

  for (const col of CONTENT_COLLECTIONS) {
    const snap = await db.collection(col).where('cityId', '==', cityId).get();
    const missing = snap.docs.filter((d) => !('areaId' in d.data()));
    console.log(`  ${col.padEnd(16)} ${snap.size} doc(s), ${missing.length} missing areaId`);
    for (const d of missing) {
      batch.update(d.ref, { areaId });
      batchOps++;
    }
  }

  console.log(`  ${batchOps} write(s) for this tenant`);
  totalWrites += batchOps;

  if (WRITE && batchOps > 0) {
    await batch.commit();
    console.log(`  committed.`);
  }
  console.log();
}

if (!WRITE) {
  console.log(`dry run — ${totalWrites} write(s) across all tenants would be made. Re-run with --write to commit.`);
} else {
  console.log(`done — ${totalWrites} write(s) committed.`);
}
