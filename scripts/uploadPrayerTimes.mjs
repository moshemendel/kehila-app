/**
 * Rebuilds weeklySchedule.shacharit / mincha / maariv from the gabbaim's
 * published weekday board (data/prayers.txt).
 *
 *   node scripts/uploadPrayerTimes.mjs            # dry run — prints the parse + diff
 *   node scripts/uploadPrayerTimes.mjs --write    # writes to Firestore + synagogues.json
 *
 * The board is the whole weekday picture, so the three arrays are REPLACED
 * rather than merged: a minyan that dropped off the board has stopped running,
 * and merging would leave it on the screen forever. `selichot`, `shiurim` and
 * `notes` inside weeklySchedule are left untouched, as is shabbatSchedule.
 *
 * Board line grammar — everything after the time is optional and order varies:
 *
 *   05:40 - (נץ) - אבני החושן              "(נץ)" = the Amidah lands at sunrise
 *   05:50 - משה דיין - הודו (5:45 ב,ה)     "הודו" = starts from Hodu
 *   08:45 - פני שמואל - הודו (א,ו)         "(...)" = the days this slot runs
 *   13:20 - יצחקי (למטה)                    which room, when a shul runs two
 *   18:20 - אבני החושן *                    "*" = maariv follows straight after
 *
 * days[]: 1=Sunday … 7=Shabbat. An unannotated slot is [1..6] (Sun–Fri); the
 * board only lists weekdays, Shabbat lives in shabbatSchedule.
 *
 * "(4:50 ב,ה)" is an EXCEPTION, not a restriction: the minyan runs all week at
 * the headline time except Mon/Thu, when it runs at 4:50. That becomes two
 * slots — [1,3,4,6] at the headline time, [2,5] at the exception time. The
 * previous import read these as "[2,5] only" and dropped the Sun/Tue/Wed/Fri
 * minyan entirely, which is why most of these look like they changed.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');
const WRITE = process.argv.includes('--write');

const ALL_WEEK = [1, 2, 3, 4, 5, 6];
const DAY_NUM = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ש': 7 };
const DAY_LETTER = 'אבגדהוש';

/** Board name → synagogue id. The board uses the name people say, which is not
 *  always the registered name (a street, a nickname, or a shortened form). */
const IDS = {
  'אביר יעקב': 'syn-1',
  'אבני החושן': 'syn-12',
  'אהבת ישראל': 'syn-43',
  'אור התורה': 'syn-17',
  'אור זרוע': 'syn-45',
  'אחדות ישראל': 'syn-3',
  'אמרי פי': 'syn-50',
  'ברכת כהן': 'syn-47',
  'ברכת שלום העם': 'syn-48',
  'דלתות המלך': 'syn-31',
  'הגילגל': 'syn-60',
  'המרכזי': 'syn-19',
  'הר הלבונה': 'syn-20',
  'היכל אביעד': 'syn-33',
  'היכל עמרם': 'syn-49',
  'היכל שמאע': 'syn-10',
  'ישי': 'syn-40',
  'ישיבת ההסדר ברכת משה': 'syn-61',
  'יצחקי': 'syn-22',
  'כולל מעלות החיים': 'syn-23',
  'כולל עמל התורה': 'syn-51',
  'מוסר אביך': 'syn-34',
  'מחניים': 'syn-35',
  'מעלות דוד מ. נבו': 'syn-62',
  'מעלות דוד מ.נבו': 'syn-62',
  'מעלות לדוד 07': 'syn-5',
  'מצפה מגדים': 'syn-41',
  'מצפה נבו': 'syn-63',
  'משה דיין': 'syn-6',
  'משכן יהודה': 'syn-52',
  'משכן שושנה': 'syn-65',
  'משכנותיך ישראל': 'syn-53',
  'נוסח אחיד': 'syn-25',
  'נופי סלע': 'syn-7',
  'נזר אהרון': 'syn-66',
  'נחלת אבות': 'syn-26',
  'נחלת יצחק': 'syn-27',
  'עלי עשור': 'syn-28',
  'עמל אדומים': 'syn-56',
  'פני שמואל': 'syn-68',
  'צור ישראל': 'syn-9',
  'קניון מעלה אדומים': 'syn-29',
  'שיח השדה': 'syn-54',
  'שים שלום': 'syn-11',
  'שלום לעם': 'syn-55',
  'תפארת בנים': 'syn-57',
  'חב"ד': 'syn-18',
  'חב"ד 06': 'syn-46',
  'חסדי חנניה': 'syn-39',
};

/**
 * syn-1's mincha is already anchored by its gabbai to shkia-20, which resolves
 * to exactly the 19:00 the board prints — same minyan, but it tracks the season
 * instead of drifting. Replacing it with a fixed 19:00 would be a downgrade, so
 * the board's mincha line for this shul is dropped on the floor.
 */
const KEEP_ANCHORED = { 'syn-1': ['mincha'] };

const SECTIONS = { 'שחרית': 'shacharit', 'מנחה': 'mincha', 'ערבית': 'maariv' };

/** "ב,ה" / "א-ה" / "א,ב,ד" / "ו" → day numbers. Returns null if not a day spec. */
function parseDays(spec) {
  const s = spec.trim();
  const range = s.match(/^(.)-(.)$/);
  if (range && DAY_NUM[range[1]] && DAY_NUM[range[2]]) {
    const a = DAY_NUM[range[1]];
    const b = DAY_NUM[range[2]];
    if (b < a) return null;
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  const parts = s.split(',').map((p) => p.trim());
  if (!parts.length || !parts.every((p) => DAY_NUM[p])) return null;
  return parts.map((p) => DAY_NUM[p]);
}

/** "4:50" → "04:50". The board drops the leading zero on some exception times. */
const pad = (t) => (t.length === 4 ? '0' + t : t);

function parseLine(line) {
  const m = line.match(/^(\d{1,2}:\d{2})\s*-\s*(.+)$/);
  if (!m) return null;
  const time = pad(m[1]);
  let rest = m[2].trim();
  const roomNotes = [];

  // "*" — maariv follows immediately (footnote at the bottom of the board).
  let adjacent = false;
  if (rest.endsWith('*')) {
    adjacent = true;
    rest = rest.slice(0, -1).trim();
  }

  // "(נץ)" always leads, before the name.
  let netz = false;
  if (/^\(נץ\)\s*-\s*/.test(rest)) {
    netz = true;
    rest = rest.replace(/^\(נץ\)\s*-\s*/, '');
  }

  // Trailing "(...)": either a day spec, an exception time + day spec, or a room.
  let days = ALL_WEEK;
  let exception = null;
  const paren = rest.match(/\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const inner = paren[1].trim();
    rest = rest.slice(0, paren.index).trim();
    const withTime = inner.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
    if (withTime) {
      const exDays = parseDays(withTime[2]);
      if (!exDays) throw new Error('bad day spec: (' + inner + ')');
      exception = { time: pad(withTime[1]), days: exDays };
      // The headline time covers the rest of the week, not the whole week.
      days = ALL_WEEK.filter((d) => !exDays.includes(d));
    } else {
      const d = parseDays(inner);
      if (d) days = d;
      else roomNotes.push(inner); // a room: "למטה" / "למעלה"
    }
  }

  // Trailing "- הודו".
  let hodu = false;
  if (/\s*-\s*הודו$/.test(rest)) {
    hodu = true;
    rest = rest.replace(/\s*-\s*הודו$/, '').trim();
  }

  return { time, name: rest, days, exception, netz, hodu, adjacent, roomNotes };
}

/** Notes read the way the board does: why it starts then, where, what follows. */
function buildNotes({ netz, roomNotes, hodu, adjacent }) {
  const parts = [];
  if (netz) parts.push('נץ');
  parts.push(...roomNotes);
  if (hodu) parts.push('הודו');
  if (adjacent) parts.push('סמוך לערבית/מנחה');
  return parts.length ? parts.join(', ') : null;
}

function parseBoard(text) {
  const schedules = {}; // id → { shacharit: [], mincha: [], maariv: [] }
  const unknown = [];
  let section = null;
  let lineNo = 0;
  let entries = 0;

  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const header = raw.trim().match(/^\*(שחרית|מנחה|ערבית)\*$/);
    if (header) {
      section = SECTIONS[header[1]];
      continue;
    }
    const line = raw.trim();
    if (!/^\d{1,2}:\d{2}\s*-/.test(line)) continue;
    if (!section) throw new Error('line ' + lineNo + ': entry before any section header');

    let p;
    try {
      p = parseLine(line);
    } catch (e) {
      throw new Error('line ' + lineNo + ': ' + e.message + ' — "' + line + '"');
    }
    entries++;

    // The board writes gershayim two ways; the id table uses the ASCII quote.
    const name = p.name.replace(/״/g, '"').trim();
    const id = IDS[name];
    if (!id) {
      unknown.push('line ' + lineNo + ': ' + name);
      continue;
    }

    schedules[id] ??= { shacharit: [], mincha: [], maariv: [] };
    const notes = buildNotes(p);
    const slot = (time, days) => ({ time, days, ...(notes ? { notes } : {}) });
    schedules[id][section].push(slot(p.time, p.days));
    if (p.exception) schedules[id][section].push(slot(p.exception.time, p.exception.days));
  }

  if (unknown.length) {
    throw new Error('Board names with no synagogue record:\n  ' + unknown.join('\n  '));
  }
  for (const sched of Object.values(schedules)) {
    for (const k of Object.keys(sched)) {
      sched[k].sort((a, b) => a.time.localeCompare(b.time) || a.days[0] - b.days[0]);
    }
  }
  return { schedules, entries };
}

const fmtSlot = (s) => {
  const days = s.days.length === 6 ? '' : '[' + s.days.map((d) => DAY_LETTER[d - 1]).join('') + ']';
  // Anchored slots (kept from a gabbai's edit) have no clock time of their own.
  const off = s.offsetMin ?? 0;
  const when = s.anchor ? s.anchor + (off ? (off > 0 ? '+' : '') + off : '') : s.time;
  return when + days + (s.notes ? ' (' + s.notes + ')' : '');
};

const fmtDay = (slots) => (slots.length ? slots.map(fmtSlot).join('  ') : '—');

async function run() {
  initializeApp({ credential: cert(join(dataDir, 'serviceAccount.json')) });
  const db = getFirestore();

  const board = readFileSync(join(dataDir, 'prayers.txt'), 'utf8');
  const { schedules, entries } = parseBoard(board);

  const synagogues = JSON.parse(readFileSync(join(dataDir, 'synagogues.json'), 'utf8')).synagogues;
  const byId = new Map(synagogues.map((s) => [s.id, s]));

  // Firestore is the live copy — a gabbai may have edited a slot since the last
  // seed, so anchored slots are read from there, not from the local file.
  const live = new Map();
  (await db.collection('synagogues').get()).forEach((d) => live.set(d.id, d.data()));

  // Drop the board's version of any slot a gabbai has already anchored.
  const preserved = [];
  for (const [id, sections] of Object.entries(KEEP_ANCHORED)) {
    for (const section of sections) {
      const kept = (live.get(id)?.weeklySchedule?.[section] ?? []).filter((s) => s.anchor);
      if (!kept.length) {
        console.warn('⚠  ' + id + '.' + section + ' is no longer anchored — the board times will be used.');
        continue;
      }
      if (schedules[id]) schedules[id][section] = kept;
      preserved.push(id + '.' + section + ' (' + kept.length + ' anchored)');
    }
  }

  const ids = Object.keys(schedules).sort((a, b) => +a.slice(4) - +b.slice(4));
  let slots = 0;
  for (const id of ids) {
    const s = schedules[id];
    slots += s.shacharit.length + s.mincha.length + s.maariv.length;
    console.log('\n' + id.padEnd(7) + ' ' + (byId.get(id)?.name ?? '???'));
    console.log('  שחרית  ' + fmtDay(s.shacharit));
    console.log('  מנחה   ' + fmtDay(s.mincha));
    console.log('  ערבית  ' + fmtDay(s.maariv));
  }

  // Shuls the board doesn't mention keep whatever they have; the board only
  // covers shuls that reported, not every shul in the city.
  const untouched = synagogues.filter((s) => !schedules[s.id]);
  console.log('\n' + entries + ' board entries → ' + ids.length + ' synagogues, ' + slots + ' slots.');
  console.log('Preserved anchored: ' + (preserved.length ? preserved.join(', ') : 'none'));
  console.log('Not on the board, left as-is: ' + untouched.length + ' (' + untouched.map((s) => s.id).join(', ') + ')');

  if (!WRITE) {
    console.log('\n(dry run — re-run with --write to apply)');
    process.exit(0);
  }

  const batch = db.batch();
  for (const id of ids) {
    // A nested map with merge:true — NOT dotted keys. set() takes keys
    // literally, so 'weeklySchedule.shacharit' would create a top-level field
    // with a dot in its name and leave the real schedule untouched. Merging the
    // map replaces these three arrays while selichot / shiurim / notes survive.
    batch.set(
      db.collection('synagogues').doc(id),
      {
        weeklySchedule: {
          shacharit: schedules[id].shacharit,
          mincha: schedules[id].mincha,
          maariv: schedules[id].maariv,
        },
      },
      { merge: true },
    );
  }
  await batch.commit();
  console.log('\n✓ Firestore: ' + ids.length + ' synagogues updated');

  // Keep the seed file in sync, or the next uploadSynagogues.mjs run wipes this.
  for (const id of ids) {
    const syn = byId.get(id);
    syn.weeklySchedule = { ...(syn.weeklySchedule ?? {}), ...schedules[id] };
  }
  writeFileSync(join(dataDir, 'synagogues.json'), JSON.stringify({ synagogues }, null, 4), 'utf8');
  console.log('✓ data/synagogues.json updated');
  process.exit(0);
}

run().catch((e) => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});
