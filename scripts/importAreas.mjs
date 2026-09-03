/**
 * Imports a regional council's settlements as `areas` documents.
 *
 *   node scripts/importAreas.mjs --city city-2 --council "עמק הירדן"
 *   node scripts/importAreas.mjs --city city-2 --council "עמק הירדן" --write
 *
 * An area is the tenant's sub-place: a settlement in a regional council, a
 * neighbourhood in a city. It carries what the city document carries today but
 * cannot carry once per place — coordinates, elevation, and a presence radius —
 * which is what lets zmanim, the eruv and "which minyan is near me" answer per
 * settlement instead of per council.
 *
 * ── Where the data comes from, and where it does NOT ─────────────────────────
 *
 * The skeleton is the state's: רשות האוכלוסין וההגירה publishes every Israeli
 * locality with its official CBS code and, crucially, its regional council —
 * so one query returns exactly the 22 settlements of עמק הירדן and nothing else.
 * That list is authoritative about WHICH PLACES EXIST and is what this imports.
 *
 * It is NOT authoritative about anything living. The same portal's mikveh
 * register lists one mikveh for עמק הירדן; the council's own site lists four.
 * So this script writes identity and geography and stops there — no hours, no
 * contacts, no "does it have an eruv". Those come from the council, and an
 * importer that helpfully filled them in from a government table would be
 * overwriting fresh facts with stale ones.
 *
 * ── Coordinates are the weak link, so nothing is written unattended ──────────
 *
 * The locality list has no coordinates. Nothing free and reliable geocodes
 * Hebrew place names — src/utils/geocodeAddress.ts already records that
 * Nominatim has no Hebrew entry for מעלה אדומים at all — so what comes back
 * here is a PROPOSAL, not an answer. Three things follow:
 *
 *   · a dry run is the default, and prints every point with its distance from
 *     the council centre so an outlier is visible before it is saved;
 *   · a hit further than --max-km from that centre is refused outright;
 *   · coordinates already in Firestore are never overwritten (--refresh-coords
 *     to insist), so a point someone corrected by hand survives a re-run.
 *
 * That caution is not only about wrong pins on a map. These coordinates are
 * what zmanim are computed from, which makes each one a ruling rather than a
 * convenience — the council's rabbi should confirm them.
 *
 * ── Options ──────────────────────────────────────────────────────────────────
 *
 *   --city <id>        the tenant these areas belong to           (required)
 *   --council <name>   שם_מועצה exactly as the state spells it    (required)
 *   --write            actually save; without it, nothing is written
 *   --label <word>     what this tenant calls an area: יישוב / שכונה / רובע
 *   --radius <km>      presence radius for new areas              (default 2)
 *   --max-km <km>      reject geocodes further than this from the centre (40)
 *   --refresh-coords   re-geocode areas that already have coordinates
 *   --overrides <path> JSON keyed by CBS code, to pin what geocoding gets wrong:
 *                      { "1225": { "latitude": 32.86, "longitude": 35.45,
 *                                  "name": "רביד", "radiusKm": 1.5 } }
 *
 * This is half of step 0. The other half — giving every EXISTING city a single
 * default area and backfilling areaId onto its listings — is a separate script,
 * because it touches live documents and this one only adds new ones.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// ── Sources ──────────────────────────────────────────────────────────────────

/** רשימת ישובים בישראל — רשות האוכלוסין וההגירה, via the data.gov.il CKAN API. */
const LOCALITIES_RESOURCE = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba';
const CKAN = 'https://data.gov.il/api/3/action/datastore_search';

/** The same elevation service services/cities.ts already uses, batched. */
const ELEVATION = 'https://api.open-meteo.com/v1/elevation';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** Nominatim's usage policy asks for an identifying agent and at most 1 req/s. */
const AGENT = 'kehila-app-area-import/1.0';
const NOMINATIM_DELAY_MS = 1100;

// ── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

const cityId = opt('--city');
const council = opt('--council');
const WRITE = flag('--write');
const REFRESH = flag('--refresh-coords');
const label = opt('--label');
const radiusKm = Number(opt('--radius', 2));
const maxKm = Number(opt('--max-km', 40));
const overridesPath = opt('--overrides');

if (!cityId || !council) {
  console.error('usage: node scripts/importAreas.mjs --city <cityId> --council "<שם מועצה>" [--write]');
  process.exit(1);
}
if (!Number.isFinite(radiusKm) || !Number.isFinite(maxKm)) {
  console.error('--radius and --max-km must be numbers');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

/**
 * The register's parenthetical qualifiers, in the construct form everyone
 * actually says and OSM actually stores: "כנרת (קבוצה)" is signposted, mapped
 * and spoken of as "קבוצת כנרת".
 *
 * A table rather than morphology on purpose. These are the register's own small
 * vocabulary, not open-ended Hebrew, and a qualifier missing from here costs
 * nothing — the lookup falls through to the plain name and, failing that, the
 * area is reported for a manual pin.
 */
const CONSTRUCT = {
  'קבוצה': 'קבוצת',
  'מושבה': 'מושבת',
};

/**
 * Query strings to try, widest match last. The official register writes
 * "אשדות יעקב (איחוד)" and "פוריה - כפר עבודה"; a gazetteer is likelier to know
 * the plain name, so the punctuation is progressively dropped rather than the
 * whole lookup being abandoned on the first miss.
 *
 * The plain name is tried LAST and is the most dangerous of the three, which is
 * why the caller only accepts `place` results: stripping "(קבוצה)" leaves
 * "כנרת", and searching that returns the lake, four streets in other towns, and
 * — in English — a bus stop. Any of them would have geocoded to a confident
 * point in the wrong spot.
 */
function queryCandidates(name) {
  const out = [name];

  const qualified = name.match(/^(.*?)\s*\((.+?)\)\s*$/);
  const construct = qualified && CONSTRUCT[qualified[2].trim()];
  if (construct) out.push(`${construct} ${qualified[1].trim()}`);

  const flattened = name.replace(/[()]/g, '').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!out.includes(flattened)) out.push(flattened);

  const base = name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (base && !out.includes(base)) out.push(base);

  return out;
}

/**
 * Best-effort coordinates for a place name, or null.
 *
 * Only `place` results count. Without that filter a search for a kibbutz can
 * return a street, a bus stop or a winery named after it, which geocodes to a
 * confident-looking point in the wrong spot — the failure mode that actually
 * hurts, and the same one MAX_DISTANCE_KM guards against in the app.
 */
async function geocode(name) {
  for (const q of queryCandidates(name)) {
    const url = `${NOMINATIM}?format=jsonv2&countrycodes=il&limit=5`
      + `&accept-language=he&q=${encodeURIComponent(q)}`;
    let hits = [];
    try {
      hits = await getJson(url, { 'User-Agent': AGENT });
    } catch (e) {
      console.warn(`    lookup failed for "${q}": ${e.message}`);
    }
    await sleep(NOMINATIM_DELAY_MS);

    const place = hits.find((h) => (h.category ?? h.class) === 'place');
    if (place) {
      return {
        latitude: Number(place.lat),
        longitude: Number(place.lon),
        matchedOn: q,
        matchedType: place.type,
      };
    }
  }
  return null;
}

/** One call for every point — open-meteo takes comma-separated lists. */
async function elevations(points) {
  if (!points.length) return [];
  const lat = points.map((p) => p.latitude).join(',');
  const lon = points.map((p) => p.longitude).join(',');
  try {
    const json = await getJson(`${ELEVATION}?latitude=${lat}&longitude=${lon}`);
    return Array.isArray(json?.elevation) ? json.elevation : [];
  } catch (e) {
    console.warn(`  elevation lookup failed (${e.message}) — leaving elevation unset`);
    return [];
  }
}

// ── Firestore ────────────────────────────────────────────────────────────────

initializeApp({ credential: cert(JSON.parse(readFileSync('scripts/serviceAccount.json', 'utf8'))) });
const db = getFirestore();

const cityRef = db.collection('cities').doc(cityId);
const citySnap = await cityRef.get();
if (!citySnap.exists) {
  console.error(`no such city: ${cityId}`);
  process.exit(1);
}
const city = citySnap.data();
if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) {
  console.error(`${cityId} has no coordinates — they are the centre every geocode is measured against.`);
  process.exit(1);
}
console.log(`tenant: ${cityId}  (${city.name ?? '—'})  centre ${city.latitude}, ${city.longitude}`);

const existing = new Map();
const existingSnap = await db.collection('areas').where('cityId', '==', cityId).get();
for (const d of existingSnap.docs) existing.set(d.id, d.data());
console.log(`${existing.size} area(s) already recorded for this tenant`);

const overrides = overridesPath
  ? JSON.parse(readFileSync(overridesPath, 'utf8'))
  : {};

// ── Fetch the official list ──────────────────────────────────────────────────

const listUrl = `${CKAN}?resource_id=${LOCALITIES_RESOURCE}&limit=1000`
  + `&filters=${encodeURIComponent(JSON.stringify({ 'שם_מועצה': council }))}`;
const list = await getJson(listUrl);
if (!list?.success) {
  console.error('data.gov.il returned an error for the locality query');
  process.exit(1);
}

const localities = (list.result.records ?? [])
  // The filter is exact, but a re-check costs nothing and this is the one field
  // the whole import is scoped by.
  .filter((r) => String(r['שם_מועצה']).trim() === council)
  .map((r) => ({ cbsCode: String(r['סמל_ישוב']).trim(), name: String(r['שם_ישוב']).trim() }))
  .sort((a, b) => a.name.localeCompare(b.name, 'he'));

if (!localities.length) {
  console.error(`no localities found for שם_מועצה = "${council}" — check the spelling against the register`);
  process.exit(1);
}
console.log(`${localities.length} localities returned for "${council}"\n`);

// ── Resolve each one ─────────────────────────────────────────────────────────

const rows = [];
for (const loc of localities) {
  const id = `area-${loc.cbsCode}`;
  const prev = existing.get(id);
  const over = overrides[loc.cbsCode] ?? {};
  const name = over.name ?? loc.name;

  let latitude = null;
  let longitude = null;
  let source;

  if (Number.isFinite(over.latitude) && Number.isFinite(over.longitude)) {
    ({ latitude, longitude } = over);
    source = 'override';
  } else if (!REFRESH && prev && Number.isFinite(prev.latitude) && Number.isFinite(prev.longitude)) {
    ({ latitude, longitude } = prev);
    source = 'kept';
  } else {
    console.log(`  looking up ${name}…`);
    const hit = await geocode(name);
    if (hit) {
      const km = haversineKm(city.latitude, city.longitude, hit.latitude, hit.longitude);
      if (km > maxKm) {
        console.warn(`    rejected: ${km.toFixed(1)} km from the centre (max ${maxKm})`);
        source = 'rejected';
      } else {
        latitude = hit.latitude;
        longitude = hit.longitude;
        source = `osm/${hit.matchedType}`;
      }
    } else {
      source = 'not found';
    }
  }

  rows.push({
    id,
    cbsCode: loc.cbsCode,
    name,
    latitude,
    longitude,
    source,
    radiusKm: over.radiusKm ?? prev?.radiusKm ?? radiusKm,
    elevation: prev?.elevation ?? null,
    isNew: !prev,
    distanceKm: latitude == null ? null : haversineKm(city.latitude, city.longitude, latitude, longitude),
  });
}

// Elevation only for points that have coordinates and no elevation yet — the
// value is a property of the point, so a kept coordinate keeps its height too.
const needElevation = rows.filter((r) => r.latitude != null && r.elevation == null);
if (needElevation.length) {
  const heights = await elevations(needElevation);
  needElevation.forEach((r, i) => {
    if (typeof heights[i] === 'number') r.elevation = Math.round(heights[i]);
  });
}

// ── Report ───────────────────────────────────────────────────────────────────

const pad = (v, n) => String(v ?? '—').padEnd(n);
console.log('\n  status   cbs    lat        lon        elev    dist   source        name');
console.log('  ' + '─'.repeat(78));
for (const r of rows) {
  const status = r.latitude == null ? 'SKIP' : r.isNew ? 'new' : 'update';
  console.log(
    `  ${pad(status, 8)} ${pad(r.cbsCode, 6)} `
    + `${pad(r.latitude?.toFixed(5), 10)} ${pad(r.longitude?.toFixed(5), 10)} `
    + `${pad(r.elevation, 7)} ${pad(r.distanceKm?.toFixed(1), 6)} ${pad(r.source, 13)} ${r.name}`,
  );
}

const ready = rows.filter((r) => r.latitude != null);
const skipped = rows.filter((r) => r.latitude == null);
console.log(`\n${ready.length} ready, ${skipped.length} without coordinates`);
if (skipped.length) {
  console.log('  pin these by hand with --overrides:');
  for (const r of skipped) console.log(`    "${r.cbsCode}": { "latitude": 0, "longitude": 0 },   // ${r.name}`);
}

if (!WRITE) {
  console.log('\ndry run — nothing was written. Check the points above, then re-run with --write.');
  process.exit(0);
}

// ── Write ────────────────────────────────────────────────────────────────────

// An area with no coordinates is worse than a missing one: it would be offered
// in a picker and then compute zmanim from nothing. Those stay out until a
// human supplies a point.
const batch = db.batch();
for (const r of ready) {
  batch.set(db.collection('areas').doc(r.id), {
    cityId,
    name: r.name,
    cbsCode: r.cbsCode,
    latitude: r.latitude,
    longitude: r.longitude,
    ...(r.elevation == null ? {} : { elevation: r.elevation }),
    radiusKm: r.radiusKm,
    isDefault: false,
    // Written explicitly rather than left absent so `where('parentId','==',null)`
    // returns every top-level area, including these.
    parentId: null,
    source: `data.gov.il/${LOCALITIES_RESOURCE}`,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

batch.update(cityRef, {
  kind: 'regional_council',
  ...(label ? { areaLabel: label } : {}),
});

await batch.commit();
console.log(`\nsaved ${ready.length} area(s) to areas/, and marked ${cityId} as a regional council.`);
if (label) console.log(`areas are called "${label}" in this tenant.`);
console.log('Nothing reads these yet — step 1 is what makes the app aware of them.');
