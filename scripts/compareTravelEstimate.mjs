/**
 * Puts the app's straight-line estimate next to real routed times, and says
 * how much the difference actually matters.
 *
 *   node scripts/compareTravelEstimate.mjs                       reads data/travel/<cityId>.json
 *   node scripts/compareTravelEstimate.mjs --file data/travel/city-1.sample.json
 *
 * ── What is worth measuring ──────────────────────────────────────────────────
 *
 * The obvious measure is the error in minutes, and it is the less interesting
 * one. The estimate is a monotone function of the straight-line distance, so a
 * uniform bias — every number 20% too low — would leave the LIST in exactly the
 * same order, and the list is what people act on. Tuning the detour constant
 * fixes that kind of error and changes nothing anyone sees.
 *
 * What the wadis do is different: they make the error uneven. One shul is
 * across a ravine and another is straight down the street, so the estimate
 * ranks them wrongly no matter what constant it uses. That is the failure this
 * whole exercise exists to fix, and it shows up as ORDER changing, not as
 * minutes being off.
 *
 * So the report leads with disagreement about which shul is nearest, and treats
 * the minute errors as context.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
}

// Mirrors src/utils/travel.ts. Duplicated rather than imported because that is
// TypeScript inside the app bundle; if those constants change, change these.
const WALK_DETOUR = 1.35, WALK_KMH = 5;
const DRIVE_DETOUR = 1.6, DRIVE_KMH = 45, DRIVE_OVERHEAD_MIN = 3;

const estimate = {
  walk:  (km) => Math.max(1, Math.ceil((km * WALK_DETOUR / WALK_KMH) * 60)),
  drive: (km) => Math.max(1, Math.ceil((km * DRIVE_DETOUR / DRIVE_KMH) * 60 + DRIVE_OVERHEAD_MIN)),
};

function haversineKm(a, b, c, d) {
  const R = 6371, p = Math.PI / 180;
  const x = Math.sin(((c - a) * p) / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(((d - b) * p) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const pct = (arr, q) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

const m = JSON.parse(readFileSync(flag('file') ?? join(dataDir, 'travel', `${flag('city', 'city-1')}.json`), 'utf8'));

// Synagogue coordinates, from the same source the matrix was built against.
const synagogues = JSON.parse(readFileSync(join(dataDir, 'synagogues.json'), 'utf8')).synagogues;
const coords = new Map(synagogues.map((s) => [s.id, s]));

/** One cell's stored row → [{ synIndex, minutes }], whichever layout it is in. */
function readCell(cell, layout) {
  if (!cell) return [];
  if (layout === 'pairs') {
    const out = [];
    for (let i = 0; i < cell.length; i += 2) out.push({ i: cell[i], minutes: cell[i + 1] });
    return out;
  }
  return cell.map((minutes, i) => ({ i, minutes })).filter((e) => e.minutes != null);
}

const g = m.grid;
const centre = (index) => ({
  lat: g.lat0 + (Math.floor(index / g.cols) + 0.5) * g.dLat,
  lon: g.lon0 + ((index % g.cols) + 0.5) * g.dLon,
});

console.log(`${m.cityId}   engine ${m.engine}${m.sampledCells ? `   SAMPLE of ${m.sampledCells} cells` : ''}`);
console.log(`built ${new Date(m.generatedAt).toLocaleString()}   from ${m.source}\n`);

for (const mode of Object.keys(m.modes)) {
  const cells = m.modes[mode];
  const layout = m.layout?.[mode] ?? 'dense';

  const errors = [];       // real − estimate, in minutes
  const ratios = [];       // real ÷ estimate
  let top1Changed = 0, cellsCompared = 0, top3Overlap = 0;
  const worst = [];

  for (let index = 0; index < cells.length; index++) {
    const entries = readCell(cells[index], layout);
    if (entries.length < 3) continue;

    const here = centre(index);
    const rows = entries.map((e) => {
      const syn = coords.get(m.synagogueIds[e.i]);
      if (!syn || !Number.isFinite(syn.latitude)) return null;
      const km = haversineKm(here.lat, here.lon, syn.latitude, syn.longitude);
      return { name: syn.name, real: e.minutes, guess: estimate[mode](km), km };
    }).filter(Boolean);

    if (rows.length < 3) continue;
    cellsCompared++;

    for (const r of rows) {
      errors.push(r.real - r.guess);
      ratios.push(r.real / Math.max(r.guess, 0.5));
      worst.push({ ...r, here, diff: r.real - r.guess });
    }

    const byGuess = [...rows].sort((a, b) => a.guess - b.guess);
    const byReal  = [...rows].sort((a, b) => a.real  - b.real);
    if (byGuess[0].name !== byReal[0].name) top1Changed++;

    const g3 = new Set(byGuess.slice(0, 3).map((r) => r.name));
    top3Overlap += byReal.slice(0, 3).filter((r) => g3.has(r.name)).length / 3;
  }

  if (!cellsCompared) { console.log(`${mode}: nothing comparable\n`); continue; }

  const absErrors = errors.map(Math.abs);
  console.log(`── ${mode} ──  ${cellsCompared} places, ${errors.length.toLocaleString()} pairs`);
  console.log('');
  console.log(`  THE NEAREST SHUL IS A DIFFERENT ONE   in ${((top1Changed / cellsCompared) * 100).toFixed(0)}% of places`);
  console.log(`  the three nearest agree               ${((top3Overlap / cellsCompared) * 100).toFixed(0)}% of the time`);
  console.log('');
  console.log(`  error    median ${pct(absErrors, 0.5)} min   90th pct ${pct(absErrors, 0.9)} min   worst ${Math.max(...absErrors)} min`);
  const bias = errors.reduce((a, b) => a + b, 0) / errors.length;
  console.log(`  bias     the estimate is ${bias >= 0 ? 'OPTIMISTIC' : 'pessimistic'} by ${Math.abs(bias).toFixed(1)} min on average`);
  const spread = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  console.log(`  real ÷ estimate   mean ${spread.toFixed(2)}×   range ${pct(ratios, 0.05).toFixed(2)}× to ${pct(ratios, 0.95).toFixed(2)}×`);
  console.log('');

  worst.sort((a, b) => b.diff - a.diff);
  console.log(`  Worst under-estimates — the app says these are closer than they are:`);
  for (const w of worst.slice(0, 6)) {
    console.log(`    ${w.name.padEnd(20)} ${w.km.toFixed(2)} km line   app ${String(w.guess).padStart(3)} min   real ${String(w.real).padStart(3)} min   (+${w.diff})`);
  }
  console.log('');
}

console.log('The ratio range is the number that matters: one constant cannot be right');
console.log('for both ends of it, which is why tuning the detour factor was never');
console.log('going to fix the ordering.');
