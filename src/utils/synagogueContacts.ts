import { Synagogue } from '../types';

/**
 * Who to call about a synagogue, from whichever shape the record is in.
 *
 * ── Two generations of the same field ────────────────────────────────────────
 *
 * Contacts started as a flat pair, `gabbaiName` + `gabbaiPhone`, which holds
 * exactly one person. The admin console has since moved to a `gabbaim` array,
 * which holds as many as a shul actually has — but the two coexist in
 * Firestore, and until now nothing in the app read the array at all. A shul
 * edited into the new shape simply stopped showing a gabbai.
 *
 * So every screen goes through here instead of reaching for either field: the
 * array wins when it has anyone in it, the flat pair is the fallback, and a
 * record part-way between the two still answers.
 *
 * ── Why empty strings need their own handling ────────────────────────────────
 *
 * `??` only falls through on null and undefined. Every synagogue document
 * carries `phone: ""`, so the old `syn.phone ?? syn.gabbaiPhone` evaluated to
 * `""` — never reaching the gabbai's number — and the call button was hidden on
 * all 69 shuls including the 65 that had one. An empty string is not a phone
 * number, and treating it as one is the whole bug.
 */

export interface Gabbai {
  name: string;
  phone?: string | null;
}

/** Trimmed, or undefined when there was nothing there. "" is not a value. */
const text = (v?: string | null): string | undefined => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : undefined;
};

/** Every gabbai on the record, newest shape first, flat pair as fallback. */
export function gabbaimOf(syn: Pick<Synagogue, 'gabbaim' | 'gabbaiName' | 'gabbaiPhone'>): Gabbai[] {
  // flatMap rather than map+filter: dropping the nameless entries inside the
  // callback is what lets `name` come out as string rather than string|undefined.
  const listed: Gabbai[] = (syn.gabbaim ?? []).flatMap((g) => {
    const name = text(g?.name);
    return name ? [{ name, phone: text(g?.phone) }] : [];
  });

  if (listed.length > 0) return listed;

  const name = text(syn.gabbaiName);
  return name ? [{ name, phone: text(syn.gabbaiPhone) }] : [];
}

/**
 * The number to dial: the shul's own line if it has one, else the first gabbai
 * who left a number. Undefined when there is nobody to call — which is what
 * callers should hide the button on.
 */
export function contactPhoneOf(
  syn: Pick<Synagogue, 'phone' | 'gabbaim' | 'gabbaiName' | 'gabbaiPhone'>,
): string | undefined {
  return text(syn.phone) ?? gabbaimOf(syn).find((g) => text(g.phone))?.phone ?? undefined;
}

/** "אבי גינו  054-…" per gabbai, for a single-line contact row. */
export function gabbaiLines(syn: Pick<Synagogue, 'gabbaim' | 'gabbaiName' | 'gabbaiPhone'>): string[] {
  return gabbaimOf(syn).map((g) => (g.phone ? `${g.name}  ${g.phone}` : g.name));
}
