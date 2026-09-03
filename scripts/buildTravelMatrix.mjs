/**
 * Precomputes real walking and driving times from anywhere in a city to every
 * synagogue in it, once, so the app never has to ask a routing service again.
 *
 *   node scripts/buildTravelMatrix.mjs                      dry run — prints the plan, calls nothing
 *   node scripts/buildTravelMatrix.mjs --write              runs it, writes data/travel/<cityId>.json
 *   node scripts/buildTravelMatrix.mjs --write --engine ors --key $ORS_KEY
 *
 * ── Why precompute at all ────────────────────────────────────────────────────
 *
 * The screen sorts minyanim by how far away they are, and until now "far" meant
 * the straight line — a קו אווירי. מעלה אדומים is built across ridges with
 * wadis between them, so two buildings 400 m apart can be a 1.2 km walk around,
 * and the list confidently puts the unreachable one first. Only real routing
 * fixes the ORDER, because only real routing knows about the wadi.
 *
 * The obvious fix is to call a routing API per screen load, which costs money
 * forever, needs a key on the device or a server to hide it behind, and breaks
 * in the underground car park where there is no signal. But nothing about the
 * question actually changes between calls: the streets don't move, the 69 shuls
 * don't move, and the only variable — where the user is standing — has a finite
 * number of meaningful answers. So we ask every question ONCE, here, offline,
 * and ship the answers.
 *
 * The city is cut into a grid of ~150 m cells. For each cell centre we ask the
 * routing engine for the time to every synagogue, on foot and by car. The
 * result is a table the app reads by rounding the user's GPS position to a cell
 * — no network, no key, no cost, and instant.
 *
 * 150 m is chosen against the error we already carry: `Accuracy.Balanced`
 * gives the phone's position to about 100 m, so a finer grid would be false
 * precision, and a coarser one would start hiding real corners.
 *
 * ── On the engines ───────────────────────────────────────────────────────────
 *
 * `--engine valhalla` (default) talks to a Valhalla you run yourself, usually
 * in Docker on your own machine for the length of the run. It is free, fast
 * enough to finish a city in minutes, and it is the only one of the two that
 * can price a hill.
 *
 * That last part is the reason it is the default HERE. This city sits between
 * roughly 400 and 650 m, and the same path takes 30-50% longer going up than
 * coming down. Valhalla only knows that if its tiles were built WITH elevation
 * data — pass an elevation directory to valhalla_build_tiles and set
 * `additional_data.elevation` in the config. Tiles built without it will still
 * answer every request, silently, with uphill and downhill costing the same.
 * The run prints which it got (see `probeElevation`) so a whole city doesn't
 * get built on a flat lie.
 *
 * Getting one up is roughly this — check the image's README, it moves:
 *
 *   docker run -dt --name valhalla -p 8002:8002 \
 *     -v "$PWD/valhalla:/custom_files" \
 *     -e tile_urls=https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf \
 *     -e build_elevation=True \
 *     -e min_x=34.2 -e max_x=35.9 -e min_y=29.4 -e max_y=33.4 \
 *     gisops/valhalla:latest
 *
 * The first run downloads the extract and builds tiles, which takes a while and
 * is the whole cost of this approach. `build_elevation` with the bounding box
 * is the part that matters — without it the tiles come out flat, and this
 * script will say so before it builds a city on them.
 *
 * `--engine ors` talks to OpenRouteService's hosted API with a free key. It
 * needs nothing installed, but it ignores elevation and its free tier allows
 * ~2,500 requests a day, so a city takes a day or two of background running.
 * The run resumes where it stopped (see the cache below), so hitting the daily
 * cap is an interruption rather than a failure.
 *
 * ── Resuming ────────────────────────────────────────────────────────────────
 *
 * Progress is written to data/travel/.cache-<cityId>.json after every chunk.
 * A crash, a rate limit or a closed laptop costs you one chunk, not the run.
 * Delete the cache, or pass --fresh, to start over.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir   = join(__dirname, '../data');
const outDir    = join(dataDir, 'travel');

// ── Arguments ────────────────────────────────────────────────────────────────

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
}

const WRITE  = process.argv.includes('--write');
const FRESH  = process.argv.includes('--fresh');
const ENGINE = String(flag('engine', 'valhalla'));
const ORS_KEY = flag('key', process.env.ORS_KEY);
const VALHALLA_URL = String(flag('url', 'http://localhost:8002')).replace(/\/$/, '');
const OSRM_URL = String(flag('url', 'https://router.project-osrm.org')).replace(/\/$/, '');

/**
 * Route only N cells instead of the whole city, for a look rather than a build.
 *
 * Spread evenly across the grid rather than taken from one corner, so the
 * sample covers the ridges and the valleys instead of one neighbourhood. The
 * output goes to <cityId>.sample.json and is marked inside, because a partial
 * matrix that got mistaken for the real one would leave most of the city
 * silently falling back to the estimate.
 */
const SAMPLE = Number(flag('sample', 0));

const CITY_ID     = flag('city', null);
const CELL_M      = Number(flag('cell', 150));
/** How far past the outermost synagogue the grid still covers. Someone standing
 *  at the edge of the neighbourhood is inside the city even if no shul is. */
const MARGIN_M    = Number(flag('margin', 600));
/**
 * Cells whose nearest synagogue is further than this are not routed at all.
 *
 * The grid is a rectangle and the city is not. Between the ridges there are
 * wadis, and past the last street there is desert — cells there cost a request
 * each and come back unroutable or useless. With 68 shuls threaded through the
 * neighbourhoods, anywhere anyone actually lives has one well inside 2 km.
 */
const MAX_NEAREST_M = Number(flag('max-nearest', 2000));
/** Cells per request — resolved once the synagogue count is known, below. */
const CHUNK_FLAG  = flag('chunk', null);

const MODES = String(flag('modes', 'walk,drive')).split(',').map((m) => m.trim());

/**
 * Times past these are not stored at all.
 *
 * Not a size trick — a statement about what anyone acts on. Nobody walks an
 * hour to a weekday mincha, and nobody drives half an hour across their own
 * town to one. Past the cap the app falls back to its estimate, which is what
 * a number that large deserves. This is also what keeps a metropolis from
 * storing the time from every corner of it to every corner of it.
 */
const MAX_MIN = {
  walk:  Number(flag('max-walk', 60)),
  drive: Number(flag('max-drive', 30)),
};

/**
 * At most this many synagogues per cell, nearest first.
 *
 * The time caps bound an ordinary town on their own. They do not bound a dense
 * religious neighbourhood, where several hundred shuls can sit inside a
 * twenty-minute walk — so this is the backstop for that case. Set high enough
 * that it never bites in a town like this one, where dropping the 41st-nearest
 * shul would quietly break a full "sort them all by car" list.
 */
const TOP_N = Number(flag('top', 120));

// ── The city and its synagogues ──────────────────────────────────────────────
//
// Firestore, not data/synagogues.json.
//
// The JSON is a mirror the import scripts write, and it drifts: a gabbai moving
// a pin in the admin console updates Firestore and nothing else. When this was
// written the two disagreed about where אביר יעקב stands by 238 m — more than a
// whole grid cell, so every walking time to it would have been built against a
// building that isn't there. The app reads Firestore; so must this.
//
// --source json falls back to the mirror, and so does a missing service
// account, but the run says which it used rather than leaving you to wonder.

const SOURCE = flag('source', null);
const credentialsPath = join(__dirname, 'serviceAccount.json');

async function loadSynagogues() {
  const wantJson = SOURCE === 'json';
  const canFirestore = existsSync(credentialsPath);

  if (!wantJson && canFirestore) {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    initializeApp({ credential: cert(JSON.parse(readFileSync(credentialsPath, 'utf8'))) });
    const snap = await getFirestore().collection('synagogues').get();
    return { rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), source: 'firestore' };
  }

  if (!wantJson && !canFirestore) {
    console.log('No scripts/serviceAccount.json — falling back to the data/synagogues.json mirror,');
    console.log('which can be behind whatever the admin console has changed.\n');
  }

  return {
    rows: JSON.parse(readFileSync(join(dataDir, 'synagogues.json'), 'utf8')).synagogues,
    source: 'json',
  };
}

const { rows: all, source: SOURCE_USED } = await loadSynagogues();

const cityIds = [...new Set(all.map((s) => s.cityId).filter(Boolean))];
const cityId = CITY_ID ?? (cityIds.length === 1 ? cityIds[0] : null);
if (!cityId) {
  console.error(`synagogues.json holds more than one city (${cityIds.join(', ')}). Pass --city <id>.`);
  process.exit(1);
}

const synagogues = all
  .filter((s) => s.cityId === cityId)
  .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));

const skipped = all.filter((s) => s.cityId === cityId).length - synagogues.length;

/**
 * How many cells go in one request.
 *
 * ORS caps a matrix at 3,500 routed elements, and elements are cells × shuls —
 * so the cell count has to be derived from the shul count rather than fixed, or
 * a city with more shuls than this one silently starts failing every request.
 * A self-hosted Valhalla has no such cap; 200 is just a comfortable payload.
 */
const CHUNK = CHUNK_FLAG
  ? Number(CHUNK_FLAG)
  : ENGINE === 'ors'
    ? Math.max(1, Math.floor(3500 / Math.max(synagogues.length, 1)))
    // OSRM takes one coordinate list capped at 100, shared between both ends.
    : ENGINE === 'osrm'
      ? Math.max(1, 100 - synagogues.length)
      : 200;

if (synagogues.length === 0) {
  console.error(`No synagogue in ${cityId} has coordinates. Nothing to build.`);
  process.exit(1);
}

// ── The grid ─────────────────────────────────────────────────────────────────

const M_PER_DEG_LAT = 111_320;

function buildGrid() {
  const lats = synagogues.map((s) => s.latitude);
  const lons = synagogues.map((s) => s.longitude);
  const latMid = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((latMid * Math.PI) / 180);

  const padLat = MARGIN_M / M_PER_DEG_LAT;
  const padLon = MARGIN_M / mPerDegLon;

  const lat0 = Math.min(...lats) - padLat;
  const lon0 = Math.min(...lons) - padLon;
  const lat1 = Math.max(...lats) + padLat;
  const lon1 = Math.max(...lons) + padLon;

  const dLat = CELL_M / M_PER_DEG_LAT;
  const dLon = CELL_M / mPerDegLon;

  return {
    lat0, lon0,
    dLat, dLon,
    rows: Math.ceil((lat1 - lat0) / dLat),
    cols: Math.ceil((lon1 - lon0) / dLon),
    cellMeters: CELL_M,
  };
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Cell index → the point we route from: the middle of the cell. */
function cellCentre(grid, index) {
  const row = Math.floor(index / grid.cols);
  const col = index % grid.cols;
  return {
    lat: grid.lat0 + (row + 0.5) * grid.dLat,
    lon: grid.lon0 + (col + 0.5) * grid.dLon,
  };
}

// ── Engines ──────────────────────────────────────────────────────────────────
//
// Each adapter takes cell centres and synagogues and returns, for every source,
// an array of one-way durations in MINUTES aligned to `synagogues` — with null
// wherever the engine could not route. Everything above this line is engine
// agnostic, and everything below it is the only thing that changes if a third
// engine is ever added.

async function postJson(url, body, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt >= 4) throw new Error(`${url} unreachable: ${e.message}`);
      await sleep(attempt * 2000);
      continue;
    }

    if (res.ok) return res.json();

    const text = await res.text().catch(() => '');

    // The daily quota is not a transient error — retrying it just burns the
    // next day's allowance too. Stop, and say what to do.
    if (res.status === 403 || (res.status === 429 && /daily|quota/i.test(text))) {
      throw new QuotaReached(`${res.status} ${text.slice(0, 200)}`);
    }
    if (res.status === 429 && attempt < 6) { await sleep(attempt * 5000); continue; }
    if (res.status >= 500 && attempt < 4) { await sleep(attempt * 2000); continue; }

    throw new Error(`${url} → ${res.status} ${text.slice(0, 300)}`);
  }
}

class QuotaReached extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VALHALLA_COSTING = { walk: 'pedestrian', drive: 'auto' };

async function valhallaMatrix(sources, targets, mode) {
  const body = {
    sources: sources.map((p) => ({ lat: p.lat, lon: p.lon })),
    targets: targets.map((p) => ({ lat: p.lat, lon: p.lon })),
    costing: VALHALLA_COSTING[mode],
    units: 'kilometers',
  };

  // use_hills=1 lets the hill penalty apply at full strength. It does nothing
  // at all unless the tiles carry elevation — see probeElevation.
  if (mode === 'walk') {
    body.costing_options = { pedestrian: { use_hills: 1, walking_speed: 5.0 } };
  }

  const json = await postJson(`${VALHALLA_URL}/sources_to_targets`, body);

  // Valhalla has shipped two shapes for this: a flat array of rows, and (newer)
  // a `sources_to_targets` object holding one. Accept either rather than
  // pinning the run to one build of the engine.
  const rows = Array.isArray(json.sources_to_targets)
    ? json.sources_to_targets
    : json.sources_to_targets?.durations ?? null;

  if (!rows) throw new Error(`Unexpected Valhalla response: ${JSON.stringify(json).slice(0, 200)}`);

  return rows.map((row) =>
    row.map((cell) => {
      const seconds = typeof cell === 'number' ? cell : cell?.time;
      return Number.isFinite(seconds) ? seconds / 60 : null;
    }),
  );
}

const ORS_PROFILE = { walk: 'foot-walking', drive: 'driving-car' };

async function orsMatrix(sources, targets, mode) {
  // ORS takes one location list and indexes into it, so the two sets are
  // concatenated and addressed by position.
  const locations = [
    ...sources.map((p) => [p.lon, p.lat]),
    ...targets.map((p) => [p.lon, p.lat]),
  ];

  const json = await postJson(
    `https://api.openrouteservice.org/v2/matrix/${ORS_PROFILE[mode]}`,
    {
      locations,
      sources: sources.map((_, i) => i),
      destinations: targets.map((_, i) => sources.length + i),
      metrics: ['duration'],
    },
    { Authorization: String(ORS_KEY) },
  );

  if (!Array.isArray(json.durations)) {
    throw new Error(`Unexpected ORS response: ${JSON.stringify(json).slice(0, 200)}`);
  }

  return json.durations.map((row) =>
    row.map((seconds) => (Number.isFinite(seconds) ? seconds / 60 : null)),
  );
}

/**
 * OSRM's table service. Real roads, no key, nothing to install — and car only.
 *
 * The public demo at router.project-osrm.org runs the driving profile, so this
 * cannot answer the walking half at all, and its fair-use policy rules it out
 * for building a whole city. It earns its place for --sample: a few requests
 * are enough to see how far the straight-line estimate really is from the road
 * network, without waiting on Docker. Point --url at your own OSRM to use it
 * for real.
 */
async function osrmMatrix(sources, targets, mode) {
  if (mode !== 'drive') {
    throw new Error('OSRM here is the public driving demo — it cannot do walking. Use --modes drive.');
  }

  const coords = [...sources, ...targets].map((p) => `${p.lon},${p.lat}`).join(';');
  const src = sources.map((_, i) => i).join(';');
  const dst = targets.map((_, i) => sources.length + i).join(';');
  const url = `${OSRM_URL}/table/v1/driving/${coords}?sources=${src}&destinations=${dst}&annotations=duration`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM: ${json.code} ${json.message ?? ''}`);

  return json.durations.map((row) => row.map((s) => (Number.isFinite(s) ? s / 60 : null)));
}

const ENGINES = {
  valhalla: { matrix: valhallaMatrix, pauseMs: 0,    knowsHills: true  },
  // One request at a time against a shared community server, and never a
  // whole city — see the note above osrmMatrix.
  osrm:     { matrix: osrmMatrix,     pauseMs: 1200, knowsHills: false },
  // ORS allows 40 requests a minute; 1.6 s between them keeps us just under it
  // without the run stopping to be rate-limited and retried.
  ors:      { matrix: orsMatrix,      pauseMs: 1600, knowsHills: false },
};

/**
 * Does this Valhalla actually know about hills?
 *
 * Routes the same steep pair both ways. Tiles built with elevation give a
 * noticeably slower uphill; tiles built without give two identical numbers.
 * Reported rather than enforced — a flat build is a legitimate choice, it just
 * has to be a knowing one.
 */
async function probeElevation() {
  if (ENGINE !== 'valhalla' || !MODES.includes('walk')) return null;

  const lats = synagogues.map((s) => s.latitude);
  const lons = synagogues.map((s) => s.longitude);
  const a = { lat: Math.min(...lats), lon: Math.min(...lons) };
  const b = { lat: Math.max(...lats), lon: Math.max(...lons) };

  try {
    const there = (await valhallaMatrix([a], [b], 'walk'))[0][0];
    const back  = (await valhallaMatrix([b], [a], 'walk'))[0][0];
    if (there == null || back == null) return null;
    const spread = Math.abs(there - back) / Math.max(there, back);
    return { there, back, spread, hilly: spread > 0.03 };
  } catch {
    return null;
  }
}

// ── The run ──────────────────────────────────────────────────────────────────

const grid = buildGrid();
const cellCount = grid.rows * grid.cols;
const targets = synagogues.map((s) => ({ lat: s.latitude, lon: s.longitude }));

/** The cells worth asking about — see MAX_NEAREST_M. Order is the run order. */
let liveCells = [];
for (let i = 0; i < cellCount; i++) {
  const c = cellCentre(grid, i);
  const nearest = Math.min(...targets.map((t) => haversineM(c.lat, c.lon, t.lat, t.lon)));
  if (nearest <= MAX_NEAREST_M) liveCells.push(i);
}

if (SAMPLE > 0 && SAMPLE < liveCells.length) {
  // Evenly spaced across the grid, not the first N — a sample taken from one
  // corner would describe one neighbourhood and call it the city.
  const step = liveCells.length / SAMPLE;
  liveCells = Array.from({ length: SAMPLE }, (_, i) => liveCells[Math.floor(i * step)]);
}

const chunks = Math.ceil(liveCells.length / CHUNK);

const SUFFIX    = SAMPLE > 0 ? '.sample' : '';
const cachePath = join(outDir, `.cache-${cityId}${SUFFIX}.json`);
const outPath   = join(outDir, `${cityId}${SUFFIX}.json`);

function loadCache() {
  if (FRESH || !existsSync(cachePath)) return {};
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  // A cache built against a different grid or a different set of shuls answers
  // different questions. Better to redo the run than to blend two of them.
  const sameShape =
    cache.cityId === cityId &&
    cache.engine === ENGINE &&
    cache.liveCellCount === liveCells.length &&
    JSON.stringify(cache.maxMin) === JSON.stringify(MAX_MIN) &&
    JSON.stringify(cache.grid) === JSON.stringify(grid) &&
    JSON.stringify(cache.synagogueIds) === JSON.stringify(synagogues.map((s) => s.id));
  if (!sameShape) {
    console.log('Cache is from a different grid or synagogue list — starting fresh.\n');
    return {};
  }
  return cache;
}

function plan() {
  const km = (m) => (m / 1000).toFixed(1);
  const spanLat = grid.rows * grid.dLat * M_PER_DEG_LAT;
  const spanLon = grid.cols * grid.dLon * M_PER_DEG_LAT * Math.cos((grid.lat0 * Math.PI) / 180);

  console.log(`City            ${cityId}`);
  console.log(`Source          ${SOURCE_USED}`);
  console.log(`Synagogues      ${synagogues.length}${skipped ? `  (${skipped} skipped — no coordinates)` : ''}`);
  console.log(`Area            ${km(spanLon)} × ${km(spanLat)} km, ${MARGIN_M} m past the outermost shul`);
  console.log(`Grid            ${grid.cols} × ${grid.rows} = ${cellCount.toLocaleString()} cells of ${CELL_M} m`);
  if (SAMPLE > 0) console.log(`SAMPLE          ${liveCells.length} cells only — a look, not a city build`);
  console.log(`Routed          ${liveCells.length.toLocaleString()} cells  (${(cellCount - liveCells.length).toLocaleString()} skipped — no shul within ${MAX_NEAREST_M} m)`);
  console.log(`Modes           ${MODES.join(', ')}`);
  console.log(`Engine          ${ENGINE}${ENGINE === 'valhalla' ? ` at ${VALHALLA_URL}` : ''}`);
  console.log(`Elements        ${(liveCells.length * synagogues.length * MODES.length).toLocaleString()}`);
  console.log(`Requests        ${(chunks * MODES.length).toLocaleString()}  (${CHUNK} cells × ${synagogues.length} shuls each)`);

  if (ENGINE === 'ors') {
    const days = Math.ceil((chunks * MODES.length) / 2500);
    console.log(`Free tier       ~2,500 requests/day → ${days === 1 ? 'one sitting' : `${days} days of background running`}`);
  }
  console.log(`Output          data/travel/${cityId}.json`);
}

async function run() {
  mkdirSync(outDir, { recursive: true });

  const engine = ENGINES[ENGINE];
  if (!engine) { console.error(`Unknown engine "${ENGINE}". Use valhalla or ors.`); process.exit(1); }
  if (ENGINE === 'ors' && !ORS_KEY) { console.error('ORS needs a key: --key <key> or ORS_KEY in the environment.'); process.exit(1); }

  const hills = await probeElevation();
  if (hills) {
    console.log(hills.hilly
      ? `Elevation       yes — the test pair differs by ${(hills.spread * 100).toFixed(0)}% by direction\n`
      : `Elevation       NO — uphill and downhill came back identical. Tiles were built\n` +
        `                without elevation data, so every hill in this city is invisible\n` +
        `                to the walking times. Rebuild the tiles with an elevation\n` +
        `                directory, or accept flat numbers.\n`);
  }

  const cache = loadCache();
  cache.cityId = cityId;
  cache.engine = ENGINE;
  cache.grid = grid;
  cache.liveCellCount = liveCells.length;
  cache.maxMin = MAX_MIN;
  cache.synagogueIds = synagogues.map((s) => s.id);
  cache.modes ??= {};

  const started = Date.now();

  for (const mode of MODES) {
    cache.modes[mode] ??= { cells: new Array(cellCount).fill(null), done: 0 };
    const state = cache.modes[mode];

    for (let chunkIndex = Math.floor(state.done / CHUNK); chunkIndex < chunks; chunkIndex++) {
      const from = chunkIndex * CHUNK;
      const to = Math.min(from + CHUNK, liveCells.length);
      const batch = liveCells.slice(from, to);
      const sources = batch.map((i) => cellCentre(grid, i));

      let rows;
      try {
        rows = await engine.matrix(sources, targets, mode);
      } catch (e) {
        if (e instanceof QuotaReached) {
          writeFileSync(cachePath, JSON.stringify(cache));
          console.log(`\n\nDaily quota reached at ${state.done.toLocaleString()} / ${cellCount.toLocaleString()} cells (${mode}).`);
          console.log(`Progress is saved. Run the same command again tomorrow and it picks up here.`);
          process.exit(0);
        }
        throw e;
      }

      rows.forEach((row, i) => {
        const cap = MAX_MIN[mode] ?? 60;
        const minutes = row.map((m) => (m == null || m > cap ? null : Math.round(m)));
        // A cell the engine could not route to a single shul is stored as one
        // null rather than 68 of them. Most of those are the wadi floors the
        // rectangle swept up, and they are a third of the file otherwise.
        state.cells[batch[i]] = minutes.some((m) => m != null) ? minutes : null;
      });

      state.done = to;
      writeFileSync(cachePath, JSON.stringify(cache));

      const pct = ((to / liveCells.length) * 100).toFixed(0);
      const elapsed = (Date.now() - started) / 1000;
      const rate = to / Math.max(elapsed, 0.001);
      const left = Math.round((liveCells.length - to) / Math.max(rate, 0.001));
      process.stdout.write(`\r${mode.padEnd(5)} ${String(pct).padStart(3)}%  ${to.toLocaleString()} / ${liveCells.length.toLocaleString()} cells   ~${left}s left      `);

      if (engine.pauseMs) await sleep(engine.pauseMs);
    }

    process.stdout.write(`\r${mode.padEnd(5)} 100%  ${liveCells.length.toLocaleString()} cells                              \n`);
  }

  return cache;
}

/**
 * Two ways to store a cell, and which one wins depends on the city.
 *
 *   dense  [12, 30, null, 8, ...]      one entry per synagogue, positional
 *   pairs  [3, 8, 0, 12, 7, 19, ...]   [index, minutes] for the ones that count
 *
 * Dense spends nothing on indices, so it wins whenever a cell keeps most of the
 * city's shuls — which is every ordinary town. Pairs cost two numbers per entry
 * but only carry what survived the caps, so they win in a city big enough that
 * a cell reaches a small fraction of it. מעלה אדומים is squarely dense; a city
 * with hundreds of shuls is squarely pairs, by a factor of ten.
 *
 * Rather than guess, build both and keep the smaller. The layout is recorded in
 * the file so the reader knows which it got — the branch is a few lines there,
 * and it is what stops one large city from arriving as a 25 MB download.
 */
function encode(cells) {
  const dense = cells.map((c) => {
    if (!c) return null;
    const kept = c.map((v) => v);
    // The rank cap has to be applied to dense too, or the backstop does nothing
    // in the layout that a dense city would never have chosen anyway.
    if (kept.filter((v) => v != null).length > TOP_N) {
      const order = kept
        .map((v, i) => [i, v])
        .filter(([, v]) => v != null)
        .sort((a, b) => a[1] - b[1])
        .slice(TOP_N);
      for (const [i] of order) kept[i] = null;
    }
    return kept;
  });

  const pairs = cells.map((c) => {
    if (!c) return null;
    return c
      .map((v, i) => [i, v])
      .filter(([, v]) => v != null)
      .sort((a, b) => a[1] - b[1])
      .slice(0, TOP_N)
      .flat();
  });

  return JSON.stringify(dense).length <= JSON.stringify(pairs).length
    ? { layout: 'dense', cells: dense }
    : { layout: 'pairs', cells: pairs };
}

function write(cache) {
  const encoded = Object.fromEntries(MODES.map((mode) => [mode, encode(cache.modes[mode].cells)]));

  const out = {
    format: 2,
    cityId,
    generatedAt: new Date().toISOString(),
    engine: ENGINE,
    /** Where the synagogue coordinates came from — 'json' means the run may be
     *  built on a mirror the admin console has since moved on from. */
    source: SOURCE_USED,
    /** Set when only some cells were routed (--sample). Not a city build. */
    sampledCells: SAMPLE > 0 ? liveCells.length : undefined,
    /** Minutes, one-way, rounded, capped per mode. A synagogue with no entry is
     *  further than the cap or unroutable — the app falls back to its estimate. */
    maxMinutes: MAX_MIN,
    topN: TOP_N,
    grid,
    synagogueIds: synagogues.map((s) => s.id),
    layout: Object.fromEntries(MODES.map((mode) => [mode, encoded[mode].layout])),
    modes: Object.fromEntries(MODES.map((mode) => [mode, encoded[mode].cells])),
  };

  const json = JSON.stringify(out);
  writeFileSync(outPath, json);

  console.log(`\n✓ data/travel/${cityId}.json — ${(json.length / 1024).toFixed(0)} KB`);
  for (const mode of MODES) {
    const cells = cache.modes[mode].cells;
    const routed = cells.filter((c) => c && c.some((v) => v != null));
    const perCell = routed.map((c) => c.filter((v) => v != null).length);
    const avg = perCell.length ? (perCell.reduce((a, b) => a + b, 0) / perCell.length).toFixed(0) : 0;
    console.log(
      `  ${mode.padEnd(5)} ${routed.length.toLocaleString()} of ${liveCells.length.toLocaleString()} cells` +
      `, ${avg} shuls each within ${MAX_MIN[mode]} min, stored ${encoded[mode].layout}`,
    );
  }
  console.log(`  (cells with none are outside the road network — the app estimates those.)`);

  rmSync(cachePath, { force: true });
}

plan();

if (!WRITE) {
  console.log(`\nDry run. Nothing was called and nothing was written.`);
  console.log(`Add --write to run it${ENGINE === 'valhalla' ? `, once Valhalla is answering at ${VALHALLA_URL}` : ''}.`);
} else {
  console.log('');
  run().then(write).catch((e) => {
    console.error(`\n\n${e.message}`);
    console.error(`Progress up to the last completed chunk is in data/travel/.cache-${cityId}.json — rerun to resume.`);
    process.exit(1);
  });
}
