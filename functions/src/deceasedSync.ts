/**
 * Weekly copy of a burial society's public deceased register into `deceased`,
 * so the app can search it from the cemeteries tab.
 *
 * WHY A COPY. Ramla's register (mod-ramla.org.il → קדישה → חיפוש נפטרים) is a
 * Ninja Tables table that ships all ~41,000 rows to the browser in 3,000-row
 * chunks behind a nonce that changes. Searching it live from a phone would
 * mean downloading the whole register per search. A copy in Firestore costs a
 * search ~a page of reads, and the council asked for the feature.
 *
 * WHAT IT DOES. Reads the page for the current data URL (the nonce rides in
 * it), pulls every chunk, and writes only rows whose content changed — each
 * stored row carries a hash of its source fields. Rows gone from the source
 * are deleted, unless the fetch came back much smaller than what is stored:
 * a half-broken fetch must not wipe the register.
 *
 * Search keys, normalised the same way the app normalises a query
 * (src/services/deceased.ts) — keep normaliseHebrew identical in both places:
 *   "כה", "כהנ"        every 2+ letter prefix of every name word
 *   "כהנ|מש", "משה|כה" a whole word, '|', a prefix of another of the record's
 *                      words. A common surname has thousands of rows, more
 *                      than one search reads; the pair narrows "כהן משה" in
 *                      the query itself instead of after a truncated read.
 * KEYS_VERSION is part of each row's hash, so changing how keys are built
 * rewrites every row on the next sync.
 */
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

export interface DeceasedSource {
  /** Prefix of every document id from this source, and the `source` field. */
  source: string;
  cityId: string;
  pageUrl: string;
  /** The register's cemetery name → that cemetery's document id, if any. */
  cemeteryIds: Record<string, string>;
}

export const DECEASED_SOURCES: DeceasedSource[] = [
  {
    source: 'mod-ramla',
    cityId: '3pNY38qHXF5uaTUn',
    pageUrl: 'https://www.mod-ramla.org.il/%d7%a7%d7%93%d7%99%d7%a9%d7%94/deceased/',
    cemeteryIds: {
      'בית עלמין חדש': 'rml-cem-new',
      'בית עלמין ישן': 'rml-cem-old',
    },
  },
];

const KEYS_VERSION = 2;

/** Below this share of the stored count, a fetch is treated as broken. */
const MIN_FETCH_RATIO = 0.9;

export function normaliseHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')            // niqqud and cantillation
    .replace(/["'`׳״\-–.,()]/g, ' ')
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function searchKeys(...names: string[]): string[] {
  const words = [...new Set(names.flatMap((n) => normaliseHebrew(n).split(' ')).filter((w) => w.length >= 2))];
  const prefixes = (w: string) => Array.from({ length: w.length - 1 }, (_, i) => w.slice(0, i + 2));
  const keys = new Set<string>();
  for (const w of words) {
    prefixes(w).forEach((p) => keys.add(p));
    for (const other of words) if (other !== w) prefixes(other).forEach((p) => keys.add(`${w}|${p}`));
  }
  return [...keys];
}

/** "03/05/40" → "1940-05-03". Two-digit years: at or below this year's two
 *  digits is this century, above is the last. */
function isoDate(dmy: string): string | null {
  const m = dmy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (m[3].length === 2) {
    const yy = new Date().getFullYear() % 100;
    y += y <= yy ? 2000 : 1900;
  }
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

interface NinjaRow { value: Record<string, string | number> }

async function fetchRows(pageUrl: string): Promise<NinjaRow[]> {
  const page = await (await fetch(pageUrl, { headers: { 'User-Agent': 'kehila-app deceased sync' } })).text();
  const m = page.match(/"data_request_url":"([^"]+)"/);
  if (!m) throw new Error('data_request_url not found on the register page');
  const base = m[1].replace(/\\\//g, '/');
  const rows: NinjaRow[] = [];
  for (let chunk = 0; chunk < 200; chunk++) {
    const url = base.replace(/chunk_number=\d+/, `chunk_number=${chunk}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'kehila-app deceased sync' } });
    if (!res.ok) throw new Error(`chunk ${chunk}: HTTP ${res.status}`);
    const part = (await res.json()) as NinjaRow[];
    if (!Array.isArray(part) || part.length === 0) break;
    rows.push(...part);
  }
  return rows;
}

export async function syncDeceasedSource(
  db: admin.firestore.Firestore,
  src: DeceasedSource,
): Promise<{ fetched: number; written: number; deleted: number; skippedDelete: boolean }> {
  const rows = await fetchRows(src.pageUrl);
  const s = (v: unknown) => String(v ?? '').trim();

  const incoming = new Map<string, Record<string, unknown>>();
  for (const { value: v } of rows) {
    const rowId = s(v.___id___);
    if (!rowId) continue;
    const raw = {
      lastName: s(v.ninja_column_1), firstName: s(v.ninja_column_2), fatherName: s(v.ninja_column_3),
      cemeteryName: s(v.ninja_column_4), plot: s(v.ninja_column_5), row: s(v.ninja_column_6),
      grave: s(v.ninja_column_7), deathDateRaw: s(v.ninja_column_8), deathDateHe: s(v.ninja_column_9),
      burialDateRaw: s(v.ninja_column_10),
    };
    const hash = createHash('sha1').update(JSON.stringify({ ...raw, v: KEYS_VERSION })).digest('hex').slice(0, 16);
    const deathDate = isoDate(raw.deathDateRaw);
    const burialDate = isoDate(raw.burialDateRaw);
    const cemeteryId = src.cemeteryIds[raw.cemeteryName];
    incoming.set(`${src.source}-${rowId}`, {
      ...raw,
      ...(deathDate ? { deathDate } : {}),
      ...(burialDate ? { burialDate } : {}),
      ...(cemeteryId ? { cemeteryId } : {}),
      cityId: src.cityId,
      source: src.source,
      keys: searchKeys(raw.lastName, raw.firstName, raw.fatherName),
      hash,
    });
  }

  const stored = await db.collection('deceased').where('source', '==', src.source).select('hash').get();
  const storedHash = new Map(stored.docs.map((d) => [d.id, d.get('hash') as string]));

  const writer = db.bulkWriter();
  let written = 0;
  for (const [id, doc] of incoming) {
    if (storedHash.get(id) === doc.hash) continue;
    writer.set(db.collection('deceased').doc(id), doc);
    written++;
  }

  const gone = [...storedHash.keys()].filter((id) => !incoming.has(id));
  const skippedDelete = incoming.size < storedHash.size * MIN_FETCH_RATIO;
  if (!skippedDelete) gone.forEach((id) => writer.delete(db.collection('deceased').doc(id)));
  await writer.close();

  return { fetched: incoming.size, written, deleted: skippedDelete ? 0 : gone.length, skippedDelete };
}
