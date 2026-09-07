/**
 * Removes push registrations for devices that are no longer there.
 *
 *   node scripts/prune-push-tokens.mjs                      # dry run, 30-day cut
 *   node scripts/prune-push-tokens.mjs --stale-days 1
 *   node scripts/prune-push-tokens.mjs --stale-days 1 --write
 *
 * ── Why this exists when pruning is already automatic ────────────────────────
 *
 * Both senders delete a token the moment Expo answers DeviceNotRegistered, so
 * in theory the collection cleans itself. In practice that answer only comes
 * when FCM has noticed the app is gone, and reinstalling onto the SAME device —
 * which is what testing looks like — often does not produce it. The dead rows
 * simply sit there, and the console counts them as connected devices.
 *
 * ── What counts as dead ──────────────────────────────────────────────────────
 *
 * A registration is rewritten on every app launch (the scheduler keys off a ref
 * that resets with the process), so `updatedAt` is a launch timestamp. A device
 * that has not opened the app in --stale-days days is treated as gone.
 *
 * Also removed regardless of age: rows whose Auth record no longer exists,
 * which cannot receive anything by definition.
 *
 * A live device losing its row is not a real loss — the next launch registers
 * it again. The opposite error, keeping the dead ones, is what makes the device
 * count meaningless.
 *
 * Dry by default. Nothing is written without --write.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const staleIdx = args.indexOf('--stale-days');
const STALE_DAYS = staleIdx >= 0 ? Number(args[staleIdx + 1]) : 30;

if (!Number.isFinite(STALE_DAYS) || STALE_DAYS < 0) {
  console.error('--stale-days needs a non-negative number');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();
const auth = getAuth();

const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000);
const snap = await db.collection('pushTokens').get();

const keep = [];
const drop = [];

for (const d of snap.docs) {
  const t = d.data();
  const when = t.updatedAt?.toDate ? t.updatedAt.toDate() : new Date(0);
  let authExists = true;
  try { await auth.getUser(t.uid); } catch { authExists = false; }

  const reason = !authExists ? 'auth record gone'
    : when < cutoff ? `last launch ${when.toISOString().slice(0, 10)}`
    : null;

  (reason ? drop : keep).push({ id: d.id, role: t.role, uid: t.uid, when, reason });
}

const line = (r) =>
  `  ${r.id.slice(0, 12)}…  role=${String(r.role).padEnd(12)} ${r.when.toISOString()}` +
  (r.reason ? `  — ${r.reason}` : '');

console.log(`${snap.size} registrations, cutoff ${STALE_DAYS} day(s) (${cutoff.toISOString().slice(0, 10)})\n`);
console.log(`KEEP (${keep.length}):`);
keep.forEach((r) => console.log(line(r)));
console.log(`\nDELETE (${drop.length}):`);
drop.forEach((r) => console.log(line(r)));

if (!drop.length) {
  console.log('\nnothing to prune.');
  process.exit(0);
}
if (!WRITE) {
  console.log('\ndry run — nothing deleted. Re-run with --write to apply.');
  process.exit(0);
}

for (let i = 0; i < drop.length; i += 400) {
  const batch = db.batch();
  drop.slice(i, i + 400).forEach((r) => batch.delete(db.collection('pushTokens').doc(r.id)));
  await batch.commit();
}
console.log(`\ndeleted ${drop.length}; ${keep.length} left.`);
