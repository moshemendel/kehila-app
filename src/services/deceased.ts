/**
 * Search in a burial society's deceased register, copied weekly into
 * `deceased` by the syncDeceased function (functions/src/deceasedSync.ts).
 *
 * Firestore has no text search, so each record carries `keys`: every 2+
 * letter prefix of every name word, and "word|prefix" pairs of two of its
 * words (see deceasedSync.ts). Two or more words typed query the pair — first
 * word whole, second as typed so far, then the reverse order — because a
 * common surname alone has more rows than one search reads. A single word
 * queries its prefix. Either way the result keeps only records where every
 * typed word starts some name word, so word order does not matter.
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

export async function searchDeceased(
  cityId: string,
  text: string,
): Promise<{ results: DeceasedRecord[]; truncated: boolean }> {
  const words = normaliseHebrew(text).split(' ').filter((w) => w.length >= 2);
  if (!cityId || words.length === 0) return { results: [], truncated: false };
  const run = (key: string) => getDocs(query(
    collection(db, 'deceased'),
    where('cityId', '==', cityId),
    where('keys', 'array-contains', key),
    limit(MAX_RESULTS),
  ));
  let snap = words.length >= 2 ? await run(`${words[0]}|${words[1]}`) : null;
  if (snap?.empty) snap = await run(`${words[1]}|${words[0]}`);
  if (!snap || snap.empty) snap = await run(words.reduce((a, b) => (b.length > a.length ? b : a)));

  const results = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as DeceasedRecord))
    .filter((r) => {
      const nameWords = normaliseHebrew(`${r.lastName} ${r.firstName} ${r.fatherName}`).split(' ');
      return words.every((w) => nameWords.some((n) => n.startsWith(w)));
    })
    .sort((a, b) =>
      a.lastName.localeCompare(b.lastName, 'he') || a.firstName.localeCompare(b.firstName, 'he'));
  return { results, truncated: snap.size >= MAX_RESULTS };
}
