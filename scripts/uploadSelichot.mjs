/**
 * Loads the city's published selichot list into `weeklySchedule.selichot`.
 *
 *   node scripts/uploadSelichot.mjs            # dry run — prints the diff only
 *   node scripts/uploadSelichot.mjs --write    # writes to Firestore + synagogues.json
 *
 * Source: the gabbaim's weekly selichot broadcast for מעלה אדומים (Elul 5786).
 *
 * days[]: 1=Sunday … 7=Shabbat, and it is the civil day the minyan is CLOCKED
 * on — a 00:15 minyan on day 1 is Motzaei Shabbat. Shabbat itself is filtered
 * out at read time (utils/selichot.ts), so [1..6] means "every selichot night".
 *
 * Where the list annotates a different time on Mondays/Thursdays ("04:00 ב,ה")
 * that becomes a second slot on days [2,5], with the base slot narrowed to
 * [1,3,4,6] so the two never both fire on the same day.
 *
 * Every shul on this list follows the Sephardi custom (from 2 Elul), so
 * selichotCustom is set explicitly rather than left to the default.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');
const WRITE = process.argv.includes('--write');

/** Every selichot night — Sun through Fri. Shabbat is excluded at read time. */
const NIGHTLY = [1, 2, 3, 4, 5, 6];
/** The days a "ב,ה" exception does NOT cover. */
const NOT_MON_THU = [1, 3, 4, 6];
const MON_THU = [2, 5];

const t = (time, days = NIGHTLY) => ({ time, days, notes: null });

// synagogue id → slots. Keyed by id, not name, so a rename can't silently
// misfile a minyan; NAMES below is only for the console output.
const SELICHOT = {
  'syn-52': [t('00:15'), t('04:10', NOT_MON_THU), t('04:00', MON_THU), t('07:10')], // משכן יהודה
  'syn-12': [t('00:30'), t('04:40'), t('06:45')],                                    // אבני החושן
  'syn-7':  [t('00:30'), t('04:15'), t('04:30'), t('06:00')],                        // נופי סלע
  'syn-17': [t('00:30'), t('04:30'), t('06:45')],                                    // אור התורה
  'syn-10': [t('00:30', [1, 2, 3, 4, 5]), t('04:20'), t('05:40', [6])],              // היכל שמאע
  'syn-26': [t('04:00')],                                                            // נחלת אבות
  'syn-19': [t('04:00'), t('05:35'), t('17:30')],                                    // המרכזי
  'syn-56': [t('04:15')],                                                            // שערי רחמים (עמל אדומים)
  'syn-41': [t('04:30'), t('05:40', NOT_MON_THU), t('05:30', MON_THU)],              // מצפה מגדים
  'syn-43': [t('04:30'), t('06:00')],                                                // אהבת ישראל
  'syn-47': [t('04:35'), t('07:00')],                                                // ברכת כהן
  'syn-28': [t('04:40'), t('05:00'), t('07:30')],                                    // עלי עשור ועלי נבל
  'syn-5':  [t('04:40', NOT_MON_THU), t('04:30', MON_THU)],                          // מעלות לדוד
  'syn-50': [t('04:40'), t('17:40')],                                                // היכל רחל ואסתר (אמרי פי)
  'syn-9':  [t('04:40'), t('05:10'), t('07:10')],                                    // צור ישראל
  'syn-22': [t('04:50'), t('06:00')],                                                // יצחקי
  'syn-66': [t('04:55')],                                                            // נזר אהרון
  'syn-39': [t('05:00'), t('18:30')],                                                // חסדי חנניה
  'syn-40': [t('05:00', NOT_MON_THU), t('04:50', MON_THU)],                          // ישי
  'syn-55': [t('05:10'), t('08:30')],                                                // שלום לעם
  'syn-65': [t('05:10')],                                                            // משכן שושנה
  'syn-57': [t('05:25'), t('17:50')],                                                // תפארת בנים
  'syn-45': [t('06:15')],                                                            // אור זרוע
  'syn-51': [t('07:40')],                                                            // כולל עמל התורה
  'syn-48': [t('18:20')],                                                            // ברכת שלום העם
  'syn-42': [t('18:30')],                                                            // אהבה וחסד
  'syn-20': [t('18:30')],                                                            // אור הלבונה — listed as "הר הלבונה" (its street)
};

/**
 * syn-1 (אביר יעקב) is on the list at 05:00 but is deliberately absent above:
 * its gabbai already entered the same minyan anchored to netz-70, which tracks
 * the season instead of drifting. Overwriting it with a fixed 05:00 would be a
 * downgrade.
 */
const SKIP_ALREADY_ANCHORED = ['syn-1'];

async function run() {
  initializeApp({ credential: cert(join(dataDir, 'serviceAccount.json')) });
  const db = getFirestore();

  const synagogues = JSON.parse(readFileSync(join(dataDir, 'synagogues.json'), 'utf8')).synagogues;
  const byId = new Map(synagogues.map((s) => [s.id, s]));

  const ids = Object.keys(SELICHOT);
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    console.error(`❌ Unknown synagogue ids: ${missing.join(', ')}`);
    process.exit(1);
  }

  let slotCount = 0;
  for (const id of ids) {
    const slots = SELICHOT[id];
    slotCount += slots.length;
    const desc = slots
      .map((s) => `${s.time}${s.days.length === 6 ? '' : ` (${s.days.join('')})`}`)
      .join(', ');
    console.log(`${id.padEnd(7)} ${byId.get(id).name.padEnd(32)} ${desc}`);
  }
  console.log(`\n${ids.length} synagogues, ${slotCount} slots.`);
  console.log(`Preserved as-is: ${SKIP_ALREADY_ANCHORED.join(', ')}`);

  if (!WRITE) {
    console.log('\n(dry run — re-run with --write to apply)');
    process.exit(0);
  }

  // Firestore: merge so the rest of weeklySchedule (shacharit/mincha/maariv)
  // and any gabbai edits elsewhere in the doc survive.
  const batch = db.batch();
  for (const id of ids) {
    batch.set(
      db.collection('synagogues').doc(id),
      { selichotCustom: 'sephardi', weeklySchedule: { selichot: SELICHOT[id] } },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`\n✓ Firestore: ${ids.length} synagogues updated`);

  // Keep the seed file in sync, or the next uploadSynagogues.mjs run wipes this.
  for (const id of ids) {
    const syn = byId.get(id);
    syn.selichotCustom = 'sephardi';
    syn.weeklySchedule = { ...(syn.weeklySchedule ?? {}), selichot: SELICHOT[id] };
  }
  writeFileSync(
    join(dataDir, 'synagogues.json'),
    JSON.stringify({ synagogues }, null, 4),
    'utf8',
  );
  console.log('✓ data/synagogues.json updated');
  process.exit(0);
}

run().catch((e) => { console.error('❌ Failed:', e); process.exit(1); });
