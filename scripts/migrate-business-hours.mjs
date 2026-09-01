/**
 * Converts Business.openingHours (a string per day) into hoursSchedule, the
 * day-set model the mikvaot already use — grouping days that share a range, so
 * a shop open the same hours Sunday to Thursday ends up with one block instead
 * of five.
 *
 *   node scripts/migrate-business-hours.mjs [--apply]
 *
 * Dry run by default. openingHours is left in place: the app writes it as a
 * derived mirror on every save so a client on an older bundle keeps showing
 * hours until it updates.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const APPLY = process.argv.includes('--apply');
initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json','utf8'))) });
const db = getFirestore();

const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const CLOSED   = new Set(['', '-', '—', 'סגור', 'closed']);

/** "08:00-13:00" / "8:00 – 13:00" → { start, end }; anything else stays null. */
function parseRange(text) {
  const m = String(text).trim().match(/^(\d{1,2}:\d{2})\s*[–\-—]\s*(\d{1,2}:\d{2})$/);
  if (!m) return null;
  const pad = (t) => (t.length === 4 ? '0' + t : t);
  return { start: pad(m[1]), end: pad(m[2]) };
}

/** A day's text may hold a split shift — "09:00–14:00,16:00–21:00" — which the
 *  block model represents as two blocks both listing that day. Returns null if
 *  any part fails to parse, so a half-understood day is left for a person
 *  rather than silently losing its second shift. */
function parseDay(text) {
  const parts = String(text).split(',').map((t) => t.trim()).filter(Boolean);
  const out = parts.map(parseRange);
  return out.every(Boolean) && out.length ? out : null;
}

let id = 0;
const nextId = () => `mig${(++id).toString(36)}${Date.now().toString(36)}`;

const snap = await db.collection('businesses').get();
let converted = 0, skipped = 0, unparsed = [];

for (const doc of snap.docs) {
  const b = doc.data();
  if (Array.isArray(b.hoursSchedule) && b.hoursSchedule.length) { skipped++; continue; }
  const oh = b.openingHours ?? {};

  // Group by identical range text, so shared days collapse into one block.
  const byRange = new Map();
  for (const day of DAY_KEYS) {
    const raw = (oh[day] ?? '').trim();
    if (CLOSED.has(raw.toLowerCase())) continue;
    const ranges = parseDay(raw);
    if (!ranges) { unparsed.push(`${b.name}: ${day} = "${raw}"`); continue; }
    for (const parsed of ranges) {
      const key = `${parsed.start}-${parsed.end}`;
      if (!byRange.has(key)) byRange.set(key, { ...parsed, days: [] });
      byRange.get(key).days.push(day);
    }
  }

  const schedule = [...byRange.values()].map((r) => ({
    id: nextId(), days: r.days, start: r.start, end: r.end,
  }));
  if (!schedule.length) { skipped++; continue; }

  console.log(`${b.name}`);
  for (const blk of schedule) console.log(`   ${blk.days.join(', ')}  ${blk.start}–${blk.end}`);
  if (APPLY) await doc.ref.update({ hoursSchedule: schedule });
  converted++;
}

console.log(`\nbusinesses: ${snap.size}   converted: ${converted}   nothing to convert: ${skipped}`);
if (unparsed.length) {
  console.log('\nleft alone — not a plain HH:MM–HH:MM range, so a person should look:');
  for (const u of unparsed) console.log('  ' + u);
}
if (!APPLY) console.log('\ndry run — pass --apply to write');
