/**
 * Migrates eruvStatus from "one document per city, keyed by cityId" to "one
 * document per physical eruv, cityId + areaIds as plain fields" — see
 * src/types/index.ts's EruvStatus comment for why: a regional council can
 * have several independent eruvin (Emek HaYarden's own site names 10), and a
 * single cityId-keyed document cannot represent that.
 *
 * Every eruvStatus document today has its OWN doc id equal to a cityId
 * (that was the whole scheme) — this updates each IN PLACE, adding cityId
 * (copied from the id) and areaIds (that city's isDefault area, unless
 * --areas is given for a specific document). The doc id itself is left
 * alone: it is opaque now, nothing depends on its shape, and reusing it
 * means this is a field backfill, not a delete-and-recreate.
 *
 * Also backfills eruvId onto every eruvReports document that has none, set
 * to the one eruvStatus document sharing its cityId — unambiguous today
 * because every city has exactly one.
 *
 *   node scripts/migrateEruvToPerSettlement.mjs           # dry run
 *   node scripts/migrateEruvToPerSettlement.mjs --write
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const WRITE = process.argv.includes('--write');
const sa = JSON.parse(readFileSync('./scripts/serviceAccount.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const eruvSnap = await db.collection('eruvStatus').get();
console.log(`${WRITE ? 'WRITING' : 'DRY RUN'} — ${eruvSnap.size} eruvStatus document(s)\n`);

const eruvIdByCity = new Map(); // cityId -> eruv doc id, for the report backfill below
const eruvBatch = db.batch();
let eruvWrites = 0;

for (const d of eruvSnap.docs) {
  const data = d.data();
  if (data.cityId && data.areaIds) {
    console.log(`  = ${d.id}  already migrated (cityId=${data.cityId}, areaIds=${JSON.stringify(data.areaIds)})`);
    eruvIdByCity.set(data.cityId, d.id);
    continue;
  }
  // Every existing document's own id IS the cityId — that was the whole
  // scheme this migration replaces.
  const cityId = data.cityId ?? d.id;
  const areasSnap = await db.collection('areas').where('cityId', '==', cityId).where('isDefault', '==', true).get();
  if (areasSnap.empty) {
    console.error(`  ! ${d.id}  no isDefault area found for cityId=${cityId} — refusing, run backfillDefaultAreas.mjs first`);
    process.exit(1);
  }
  const areaIds = [areasSnap.docs[0].id];
  console.log(`  ~ ${d.id}  cityId=${cityId}  areaIds=${JSON.stringify(areaIds)}`);
  eruvIdByCity.set(cityId, d.id);
  eruvBatch.update(d.ref, { cityId, areaIds });
  eruvWrites++;
}

const reportsSnap = await db.collection('eruvReports').get();
const reportsNeedingBackfill = reportsSnap.docs.filter((d) => !d.data().eruvId);
console.log(`\n${reportsSnap.size} eruvReports document(s), ${reportsNeedingBackfill.length} missing eruvId`);

const reportsBatch = db.batch();
let reportWrites = 0;
for (const d of reportsNeedingBackfill) {
  const cityId = d.data().cityId;
  const eruvId = eruvIdByCity.get(cityId);
  if (!eruvId) {
    console.error(`  ! report ${d.id}  no eruvStatus document for cityId=${cityId} — leaving eruvId unset`);
    continue;
  }
  console.log(`  ~ report ${d.id}  eruvId=${eruvId}`);
  reportsBatch.update(d.ref, { eruvId });
  reportWrites++;
}

if (!WRITE) {
  console.log('\n(dry run — re-run with --write to apply)');
  process.exit(0);
}

if (eruvWrites) await eruvBatch.commit();
if (reportWrites) await reportsBatch.commit();
console.log(`\n✓ Migrated ${eruvWrites} eruvStatus document(s), backfilled eruvId onto ${reportWrites} report(s).`);
