/**
 * Pulls data/synagogues.json back into line with Firestore.
 *
 *   node scripts/syncSynagoguesMirror.mjs           # dry run — says what would change
 *   node scripts/syncSynagoguesMirror.mjs --write   # rewrites the mirror
 *
 * ── Which way the data flows ─────────────────────────────────────────────────
 *
 * Firestore is the live record. The app reads it, and the admin console writes
 * to it — a gabbai moving a pin or fixing a house number changes Firestore and
 * nothing else. data/synagogues.json is a mirror the import scripts read and
 * write, and it only ever gets updated when one of them happens to run.
 *
 * So it drifts. When this script was written the two disagreed about where
 * אביר יעקב stands by 238 m, and the mirror was a whole schema behind: `nusach`
 * as a string where Firestore had moved to an array, and no sign at all of
 * `phone`, `rabbi`, `gabbaim`, `images`, `shabbatSchedule` or `synagogueEvents`.
 *
 * ── Why that drift is dangerous, not just untidy ─────────────────────────────
 *
 * uploadSynagogues.mjs pushes the mirror back with `batch.set(doc, data)` — a
 * REPLACE, not a merge. Run it against a stale mirror and every field the
 * mirror has never heard of is deleted from the live record, and `nusach` is
 * demoted back to a string. The mirror being current is what stands between
 * that script and a quiet data loss, which is why this one exists.
 *
 * ── What it preserves ────────────────────────────────────────────────────────
 *
 * Key ORDER follows whatever the mirror already had for each record, with new
 * fields appended. Firestore hands its keys back in its own order, and taking
 * that order would reshuffle all 3,000 lines and bury the handful of real
 * changes in the diff.
 *
 * Timestamps become ISO strings. There is no honest round trip here — the
 * upload script would write a string back where a Timestamp was — but the
 * mirror today stores `updatedAt: null` for every record, so a readable date
 * loses nothing and says more.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mirrorPath = join(__dirname, '../data/synagogues.json');
const WRITE = process.argv.includes('--write');

/** Firestore values → plain JSON. Timestamps become ISO strings, at any depth. */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
}

/**
 * The one thing the mirror knows that Firestore does not.
 *
 * Seven records carry an English address — HaAlmog, and six like it — that was
 * never uploaded. A pure mirror would delete the only copy. Keeping it costs
 * nothing (the app already reads `address.he ?? address.en`) and means the next
 * uploadSynagogues.mjs carries them INTO Firestore instead of erasing them.
 *
 * Only `en`, only when Firestore has none, and only while the Hebrew still
 * matches. The English is a transliteration of the Hebrew, so once somebody
 * corrects the Hebrew the old English is wrong rather than merely old: syn-20
 * moved from הר הלבונה 11 to 18, and carrying "Har HaLevona 11" alongside it
 * would leave the record contradicting itself in two languages.
 */
function keepEnglishAddress(live, previous) {
  const en = previous?.address?.en;
  if (!en || live.address?.en) return live;
  if (previous?.address?.he !== live.address?.he) return live;
  return { ...live, address: { ...(live.address ?? {}), en } };
}

/** Rebuild a record in the mirror's key order, appending anything new. */
function inMirrorOrder(live, previous) {
  const out = {};
  for (const key of Object.keys(previous ?? {})) {
    if (key in live) out[key] = live[key];
  }
  for (const key of Object.keys(live)) {
    if (!(key in out)) out[key] = live[key];
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const R = 6_371_000;
function metresApart(a, b) {
  if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(Number.isFinite)) return null;
  const p = Math.PI / 180;
  const x =
    Math.sin(((b.latitude - a.latitude) * p) / 2) ** 2 +
    Math.cos(a.latitude * p) * Math.cos(b.latitude * p) * Math.sin(((b.longitude - a.longitude) * p) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function run() {
  initializeApp({ credential: cert(JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'))) });

  const snap = await getFirestore().collection('synagogues').get();
  const mirror = JSON.parse(readFileSync(mirrorPath, 'utf8')).synagogues;
  const byId = new Map(mirror.map((s) => [s.id, s]));

  // The document id is the identity; an `id` FIELD is incidental and three
  // records do not carry one at all.
  const live = snap.docs.map((d) => {
    const previous = byId.get(d.id);
    return inMirrorOrder(keepEnglishAddress({ id: d.id, ...plain(d.data()) }, previous), previous);
  });

  const liveIds = new Set(live.map((s) => s.id));
  const added = live.filter((s) => !byId.has(s.id));
  const removed = mirror.filter((s) => !liveIds.has(s.id));

  const changed = [];
  for (const record of live) {
    const before = byId.get(record.id);
    if (!before || same(before, record)) continue;

    const fields = [...new Set([...Object.keys(before), ...Object.keys(record)])]
      .filter((k) => !same(before[k], record[k]));
    changed.push({ record, before, fields });
  }

  console.log(`Firestore ${live.length}   mirror ${mirror.length}\n`);

  for (const s of added)   console.log(`  + ${s.id}  ${s.name}`);
  for (const s of removed) console.log(`  − ${s.id}  ${s.name}   (gone from Firestore)`);

  for (const { record, before, fields } of changed) {
    const moved = metresApart(before, record);
    const note = moved && moved > 1 ? `  [moved ${moved.toFixed(0)} m]` : '';
    console.log(`  ~ ${record.id}  ${record.name}${note}`);
    for (const f of fields) {
      const show = (v) => {
        if (v === undefined) return '—';
        const s = JSON.stringify(v);
        return s.length > 60 ? s.slice(0, 57) + '…' : s;
      };
      console.log(`      ${f}: ${show(before[f])}  →  ${show(record[f])}`);
    }
  }

  if (!added.length && !removed.length && !changed.length) {
    console.log('  Already in sync — nothing to do.');
    process.exit(0);
  }

  console.log(`\n${changed.length} changed, ${added.length} added, ${removed.length} only in the mirror`);

  if (!WRITE) {
    console.log('\nDry run. Add --write to rewrite data/synagogues.json.');
    process.exit(0);
  }

  // Records Firestore no longer has are dropped: the mirror mirrors, and a
  // record kept here would be re-uploaded by uploadSynagogues.mjs, resurrecting
  // a synagogue somebody deleted on purpose.
  writeFileSync(mirrorPath, JSON.stringify({ synagogues: live }, null, 4) + '\n', 'utf8');
  console.log(`\n✓ data/synagogues.json — ${live.length} synagogues, straight from Firestore`);
  process.exit(0);
}

run().catch((e) => { console.error('Failed:', e); process.exit(1); });
