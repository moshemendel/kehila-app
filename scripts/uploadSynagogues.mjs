/**
 * Pushes data/synagogues.json into Firestore.
 *
 *   node scripts/uploadSynagogues.mjs                   # dry run — prints the diff only
 *   node scripts/uploadSynagogues.mjs --write           # applies it
 *   node scripts/uploadSynagogues.mjs --write --force   # ...even from a stale mirror
 *
 * ── What this used to do, and why it no longer does ──────────────────────────
 *
 * This script wrote `batch.set(doc, data)` — a REPLACE. Firestore is the live
 * record and the admin console writes only there, so the mirror drifts, and a
 * replace from a drifted mirror deletes every field the mirror has never heard
 * of. On 3 Sep 2026 that was `phone`, `rabbi`, `gabbaim`, `imageUrl`, `images`,
 * `shabbatSchedule`, `synagogueEvents` and `selichotStartDate` — across all 69
 * documents — plus `nusach` demoted from string[] back to a string.
 *
 * Three things stand in the way of that now:
 *
 *   merge:true   a field the mirror does not carry is left alone rather than
 *                deleted. Same reasoning as uploadPrayerTimes.mjs.
 *   the guard    the payload is compared against the live documents first, and
 *                a mirror that is BEHIND Firestore — a live field it has never
 *                heard of, or a live value it disagrees with — refuses to
 *                write. syncSynagoguesMirror.mjs --write clears both.
 *   the dry run  the default. Every field the write would touch is printed
 *                before anything is applied.
 *
 * `--force` covers the one case the guard cannot tell apart from drift: a
 * deliberate bulk edit of the mirror. The dry run has already itemised what it
 * would overwrite.
 *
 * ── Two things it no longer does at all ──────────────────────────────────────
 *
 * It no longer merges data/prayer-times.json into weeklySchedule. That file is
 * keyed by NAME through an alias table, so a rename misfiles a minyan; it is
 * the import uploadPrayerTimes.mjs was written to replace (data/prayers.txt,
 * keyed by id, with the Mon/Thu exception days read correctly); and it REPLACED
 * weeklySchedule wholesale, taking `selichot` with it — 28 shuls worth today.
 * That is what the "or the next uploadSynagogues.mjs run wipes this" comments
 * in both sibling scripts are about. Nothing else reads prayer-times.json.
 *
 * It no longer writes cities/city-1. That was a hardcoded six-field set() — a
 * replace, on a document that has since grown `modules`, `elevation`,
 * `nusachOptions` and `neighborhoods`. It could only ever delete them, silently
 * turning every held-back module back on. seed.mjs seeds the city.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');
const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');

/**
 * Fields the uploader neither writes nor audits.
 *
 * `id` — the document id is the identity; an `id` FIELD is incidental, and
 * three records do not carry one at all.
 *
 * `updatedAt` — server-maintained, written with serverTimestamp() by the app.
 * The mirror only has it as an ISO string (syncSynagoguesMirror.mjs stringifies
 * Timestamps), so writing it back would demote a Timestamp to a string — the
 * same shape of bug as `nusach`. Left out of the payload, merge keeps the real
 * one; left out of the audit, its absence is not read as drift.
 */
const NOT_OURS = new Set(['id', 'updatedAt']);

/** Firestore values → plain JSON, so a live document compares like for like
 *  with the mirror. Timestamps become ISO strings, at any depth. */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A map, which merge:true recurses into — as opposed to a leaf. Arrays are
 *  leaves: merge replaces an array wholesale, it does not merge its members. */
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Every leaf path where the payload and the live document disagree, labelled
 * with what a merge:true write would actually do there.
 *
 *   add        Firestore has nothing at this path — the write introduces it.
 *              The point of the exercise, and the only kind that is always safe.
 *   conflict   Firestore has a different value — the write replaces it. Either
 *              the mirror is stale or somebody edited it on purpose.
 *   stale      the mirror has nothing at this path. merge leaves the live value
 *              alone, so nothing is lost today — but a mirror that has never
 *              heard of a live field is behind, and the values it DOES carry
 *              were read before that field existed.
 */
function classify(mine, live, prefix = '', out = []) {
  for (const [key, ours] of Object.entries(mine)) {
    if (!prefix && NOT_OURS.has(key)) continue;
    const path = prefix + key;
    const theirs = live?.[key];
    if (isMap(ours) && isMap(theirs)) {
      classify(ours, theirs, path + '.', out);
    } else if (theirs === undefined) {
      out.push({ path, kind: 'add', theirs, ours });
    } else if (!same(ours, theirs)) {
      out.push({ path, kind: 'conflict', theirs, ours });
    }
  }
  for (const [key, theirs] of Object.entries(live ?? {})) {
    if (!prefix && NOT_OURS.has(key)) continue;
    if (key in mine) continue; // already accounted for above
    out.push({ path: prefix + key, kind: 'stale', theirs, ours: undefined });
  }
  return out;
}

const show = (v) => {
  if (v === undefined) return '—';
  const s = JSON.stringify(v);
  return s.length > 56 ? s.slice(0, 53) + '…' : s;
};

async function run() {
  initializeApp({ credential: cert(join(dataDir, 'serviceAccount.json')) });
  const db = getFirestore();

  const mirror = JSON.parse(readFileSync(join(dataDir, 'synagogues.json'), 'utf8')).synagogues;

  const snap = await db.collection('synagogues').get();
  const live = new Map(snap.docs.map((d) => [d.id, plain(d.data())]));

  const records = mirror.map((syn) => {
    const payload = Object.fromEntries(Object.entries(syn).filter(([k]) => !NOT_OURS.has(k)));
    const current = live.get(syn.id);
    // An EMPTY map is the one thing merge:true does not treat gently: it
    // replaces the map rather than merging nothing into it, so a payload
    // carrying `address: {}` wipes a live address instead of leaving it be.
    // Three records store `address: null` in the mirror, and the old
    // replace-everything version turned those into `{}` so the field existed.
    // That default is only safe on a document that does not exist yet.
    for (const [key, value] of Object.entries(payload)) {
      if (isMap(value) && !Object.keys(value).length && current) delete payload[key];
    }
    if (!payload.address && !current) payload.address = {};
    return { id: syn.id, name: syn.name, payload, current, paths: classify(payload, current) };
  });

  // A shul the console has added since the last resync. The upload does not
  // touch it — it writes only what the mirror holds — but the mirror not
  // knowing about it is the plainest possible sign that it is behind.
  const mirrorIds = new Set(mirror.map((s) => s.id));
  const unmirrored = [...live.keys()].filter((id) => !mirrorIds.has(id));

  console.log(`Firestore ${live.size}   mirror ${mirror.length}\n`);

  let adds = 0, conflicts = 0, stales = 0;
  for (const rec of records) {
    if (!rec.current) {
      console.log(`  + ${rec.id.padEnd(7)} ${rec.name}   (new document, ${Object.keys(rec.payload).length} fields)`);
      continue;
    }
    const writes = rec.paths.filter((p) => p.kind !== 'stale');
    const behind = rec.paths.filter((p) => p.kind === 'stale');
    adds += writes.filter((p) => p.kind === 'add').length;
    conflicts += writes.filter((p) => p.kind === 'conflict').length;
    stales += behind.length;
    if (!writes.length && !behind.length) continue;

    console.log(`  ~ ${rec.id.padEnd(7)} ${rec.name}`);
    for (const p of writes) {
      const mark = p.kind === 'conflict' ? '!' : '+';
      console.log(`      ${mark} ${p.path.padEnd(22)} ${show(p.theirs)}  →  ${show(p.ours)}`);
    }
    // Listed by name, not by value: these are not being written, and spelling
    // out eight untouched fields per record buries the two that are.
    if (behind.length) {
      console.log(`      · only in Firestore, left alone: ${behind.map((p) => p.path).join(', ')}`);
    }
  }

  for (const id of unmirrored) {
    console.log(`  ? ${id.padEnd(7)} ${live.get(id).name ?? ''}   (in Firestore, not in the mirror)`);
  }

  const created = records.filter((r) => !r.current);
  console.log(
    `\n${records.length} synagogues: ${created.length} new, ${adds} fields added, ` +
    `${conflicts} overwritten, ${stales} left alone, ${unmirrored.length} not mirrored`,
  );

  // "Behind" is the union of the two symptoms: a live field the mirror never
  // had, and a live value it contradicts. One resync clears both, and both mean
  // the file about to be pushed is not describing the world as it stands.
  const behind = conflicts + stales + unmirrored.length;
  if (behind && !FORCE) {
    console.log(
      '\n⚠  The mirror is behind Firestore.\n' +
      '   Firestore is the live record — the admin console writes there and nowhere else.\n' +
      '   Pull it back into line first:  node scripts/syncSynagoguesMirror.mjs --write\n' +
      '   If the mirror is deliberately ahead, re-run with --force.',
    );
    if (WRITE) process.exit(1);
  }

  if (!WRITE) {
    console.log('\n(dry run — re-run with --write to apply)');
    process.exit(0);
  }

  // merge:true, so a field this file has never heard of survives the write.
  // Nested maps merge key by key, which is why the payload carries `address`
  // and `weeklySchedule` as maps rather than as dotted keys — set() takes keys
  // literally, and 'weeklySchedule.selichot' would create a top-level field
  // with a dot in its name. See uploadPrayerTimes.mjs.
  let written = 0;
  for (let i = 0; i < records.length; i += 400) {
    const chunk = records.slice(i, i + 400);
    const batch = db.batch();
    for (const rec of chunk) {
      batch.set(db.collection('synagogues').doc(rec.id), rec.payload, { merge: true });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`✓ Wrote ${written}/${records.length} synagogues`);
  }

  console.log('\n✅ Upload complete.');
  process.exit(0);
}

run().catch((e) => { console.error('❌ Failed:', e); process.exit(1); });
