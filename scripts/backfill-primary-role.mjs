/**
 * Gives every profile the singular `role` field back.
 *
 *   node scripts/backfill-primary-role.mjs [--write]
 *
 * Accounts carry both a `roles` array and a singular `role`, the second being
 * the highest-priority member of the first. firestore.rules reads both, and two
 * profiles had ended up with only the array — leftovers from the backfill that
 * introduced it.
 *
 * That is not cosmetic. `role` missing means:
 *
 *   - the pushTokens rule compares against userDoc().role, which is undefined,
 *     so no comparison can succeed;
 *   - the client never gets that far anyway — it computes
 *     `appUser?.role ?? (isGuest ? 'guest' : null)`, gets null, and the guard
 *     drops the registration. The device silently never registers for
 *     notifications, and nothing anywhere reports it.
 *
 * Dry by default: prints what it would change and writes nothing without
 * --write.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const WRITE = process.argv.includes('--write');

initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();

// The same order the app collapses a role set with — see computePrimaryRole in
// src/utils/roles.ts, which reads it from src/utils/roleCatalogue.json.
const PRIORITY = JSON.parse(readFileSync('src/utils/roleCatalogue.json', 'utf8')).map((r) => r.key);

const snap = await db.collection('users').get();
const repairs = [];

for (const d of snap.docs) {
  const u = d.data();
  if (u.role !== undefined) continue;
  const roles = Array.isArray(u.roles) ? u.roles : [];
  const primary = PRIORITY.find((r) => roles.includes(r)) ?? 'user';
  repairs.push({ id: d.id, roles, primary });
}

if (!repairs.length) {
  console.log('every profile already has a `role` — nothing to do.');
  process.exit(0);
}

console.log(`${repairs.length} profile(s) missing \`role\`:\n`);
for (const r of repairs) {
  console.log(`  ${r.id}  roles=${JSON.stringify(r.roles)}  ->  role='${r.primary}'`);
}

if (!WRITE) {
  console.log('\ndry run — nothing written. Re-run with --write to apply.');
  process.exit(0);
}

for (const r of repairs) {
  await db.collection('users').doc(r.id).update({ role: r.primary });
}
console.log(`\nwrote \`role\` on ${repairs.length} profile(s).`);
