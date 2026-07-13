// Merges prayer-times.json into synagogues.json by name, then uploads all to Firestore.
// Run with:  node scripts/uploadSynagogues.mjs
//
// Name aliases: handles cases where prayer-times key differs slightly from synagogue name.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir   = join(__dirname, '../data');

initializeApp({ credential: cert(join(dataDir, 'serviceAccount.json')) });

// Prayer-times key → exact synagogue name in synagogues.json
const NAME_ALIASES = {
  'אמרי פי':              'היכל רחל ואסתר (אמרי פי)',
  'בית רבינו':            'בית רבנו',
  'חב"ד':                 'בית חב"ד',
  'חב"ד 06':              'בית חב"ד 06',
  'מעלות דוד מ. נבו':    'מעלות דוד',
  'מעלות לדוד 07':        'מעלות לדוד',
  'עלי עשור':             'עלי עשור ועלי נבל',
  'עמל אדומים':           'שערי רחמים (עמל אדומים)',
};

const EMPTY_SCHEDULE = { shacharit: [], mincha: [], maariv: [] };

function cleanSlots(slots) {
  if (!Array.isArray(slots) || slots.length === 0) return [];
  return slots.map(({ time, days, notes }) => {
    const s = { time, days: days ?? [] };
    if (notes) s.notes = notes;
    return s;
  });
}

function buildSchedule(raw) {
  if (!raw) return EMPTY_SCHEDULE;
  return {
    shacharit: cleanSlots(raw.shacharit),
    mincha:    cleanSlots(raw.mincha),
    maariv:    cleanSlots(raw.maariv),
  };
}

async function run() {
  const synagogues   = JSON.parse(readFileSync(join(dataDir, 'synagogues.json'),   'utf8')).synagogues;
  const prayerTimes  = JSON.parse(readFileSync(join(dataDir, 'prayer-times.json'), 'utf8'));

  // Build lookup: synagogue name → prayer schedule
  const scheduleByName = {};
  for (const [key, schedule] of Object.entries(prayerTimes)) {
    const canonical = NAME_ALIASES[key] ?? key;
    scheduleByName[canonical] = buildSchedule(schedule);
  }

  // Merge prayer times into synagogue records
  let matched = 0, unmatched = [];
  const merged = synagogues.map((syn) => {
    if (scheduleByName[syn.name]) {
      matched++;
      return { ...syn, weeklySchedule: scheduleByName[syn.name] };
    }
    // Keep whatever is already in the record (may be null → normalise to empty)
    if (!syn.weeklySchedule) {
      unmatched.push(syn.name);
      return { ...syn, weeklySchedule: EMPTY_SCHEDULE };
    }
    return syn;
  });

  console.log(`\nMatched prayer times: ${matched}/${Object.keys(prayerTimes).length} entries`);
  if (unmatched.length) {
    console.log(`Synagogues with no prayer data (set to empty):\n  ${unmatched.join('\n  ')}`);
  }

  // Write updated synagogues.json
  writeFileSync(
    join(dataDir, 'synagogues.json'),
    JSON.stringify({ synagogues: merged }, null, 4),
    'utf8'
  );
  console.log('\n✓ synagogues.json updated');

  // Upload to Firestore (Admin SDK)
  const db = getFirestore();

  await db.collection('cities').doc('city-1').set({
    name: 'מעלה אדומים',
    nameEn: "Ma'ale Adumim",
    country: 'Israel',
    timezone: 'Asia/Jerusalem',
    latitude: 31.7781,
    longitude: 35.2969,
  });
  console.log('✓ City: מעלה אדומים');

  // Batch write (max 500 ops per batch)
  let written = 0;
  for (let i = 0; i < merged.length; i += 400) {
    const chunk = merged.slice(i, i + 400);
    const batch = db.batch();
    for (const syn of chunk) {
      const { id, ...data } = syn;
      if (!data.address) data.address = {};
      batch.set(db.collection('synagogues').doc(id), data);
    }
    await batch.commit();
    written += chunk.length;
    console.log(`✓ Wrote ${written}/${merged.length} synagogues`);
  }

  console.log('\n✅ Upload complete!');
  process.exit(0);
}

run().catch((e) => { console.error('❌ Failed:', e); process.exit(1); });
