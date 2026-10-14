/**
 * Search in a burial society's deceased register, copied weekly into
 * `deceased` by the syncDeceased function (functions/src/deceasedSync.ts).
 *
 * Firestore has no text search, so each record carries `keys`: every 2+
 * letter prefix of every name word, and "word|prefix" pairs of two of its
 * words (see deceasedSync.ts). Two or more words typed query the pair — first
 * word whole, second as typed so far, then the reverse order — because a
 * common surname alone has more rows than one search reads. A single word
 * queries its prefix.
 *
 * Typed words are matched to the deceased's own first and last name, in any
 * order. The father's name is matched only after "בן" or "בת", the way the
 * name is said: "משה בן אריה", "שרה בת דוד". Without it, "משה כהן" would also
 * find משה יוסף whose father is אריה כהן.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase';

export interface DeceasedRecord {
  id: string;
  cityId: string;
  lastName: string;
  firstName: string;
  fatherName: string;
  cemeteryName: string;
  cemeteryId?: string;
  plot: string;
  row: string;
  grave: string;
  /** "YYYY-MM-DD" when the register's date parsed. */
  deathDate?: string;
  deathDateRaw: string;
  deathDateHe: string;
}

/** The most rows one search reads. Past this the person is asked to narrow. */
const MAX_RESULTS = 300;

/** Keep identical to normaliseHebrew in functions/src/deceasedSync.ts —
 *  stored keys and queries must normalise the same way. */
export function normaliseHebrew(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'`׳״\-–.,()]/g, ' ')
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** "בן" / "בת" as normaliseHebrew leaves them (final ן → נ). */
const SON_OF = new Set(['בנ', 'בת']);

/**
 * Splits a query into the deceased's own name words and the father's.
 * "בן" is read as "son of" only after at least one name word — as the first
 * word it is a surname (בן דוד, בן שושן). Returns null when there is no
 * "son of" to split on.
 */
function splitSonOf(words: string[]): { own: string[]; father: string[] } | null {
  const at = words.findIndex((w, i) => i > 0 && SON_OF.has(w));
  if (at < 0) return null;
  return { own: words.slice(0, at), father: words.slice(at + 1) };
}

export async function searchDeceased(
  cityId: string,
  text: string,
): Promise<{ results: DeceasedRecord[]; truncated: boolean }> {
  const words = normaliseHebrew(text).split(' ').filter((w) => w.length >= 2);
  if (!cityId || words.length === 0) return { results: [], truncated: false };

  const split = splitSonOf(words);
  if (split) {
    const found = await searchParts(cityId, split.own, split.father);
    // "משה בן דוד" can also be Moshe Ben-David. Nothing as "son of" → try
    // the whole thing as names.
    if (found.results.length > 0) return found;
  }
  return searchParts(cityId, words, []);
}

async function searchParts(
  cityId: string,
  own: string[],
  father: string[],
): Promise<{ results: DeceasedRecord[]; truncated: boolean }> {
  const all = [...own, ...father];
  if (all.length === 0) return { results: [], truncated: false };
  const run = (key: string) => getDocs(query(
    collection(db, 'deceased'),
    where('cityId', '==', cityId),
    where('keys', 'array-contains', key),
    limit(MAX_RESULTS),
  ));
  // Keys are built over all three name fields, so a pair can join an own
  // name word and a father's word — the split is applied by the filter below.
  let snap = all.length >= 2 ? await run(`${all[0]}|${all[1]}`) : null;
  if (snap?.empty) snap = await run(`${all[1]}|${all[0]}`);
  if (!snap || snap.empty) snap = await run(all.reduce((a, b) => (b.length > a.length ? b : a)));

  const starts = (typed: string[], field: string) => {
    const have = normaliseHebrew(field).split(' ');
    return typed.every((w) => have.some((n) => n.startsWith(w)));
  };
  const results = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as DeceasedRecord))
    .filter((r) => starts(own, `${r.lastName} ${r.firstName}`) && starts(father, r.fatherName))
    .sort((a, b) =>
      a.lastName.localeCompare(b.lastName, 'he') || a.firstName.localeCompare(b.firstName, 'he'));
  return { results, truncated: snap.size >= MAX_RESULTS };
}
