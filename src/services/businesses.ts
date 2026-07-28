import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Business, KosherCertificate } from '../types';

const COL = 'businesses';

// Firestore rejects undefined at any depth — recursively replace with null
function sanitize(value: any): any {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
}

// ── Kashrut category metadata (shared across screens) ───────────────────────
export const CATEGORY_META: { key: string; label: string; icon: string }[] = [
  { key: 'meat',   label: 'בשרי',   icon: '🥩' },
  { key: 'dairy',  label: 'חלבי',   icon: '🧀' },
  { key: 'pareve', label: 'פרווה',  icon: '🌿' },
  { key: 'vegan',  label: 'טבעוני', icon: '🌱' },
  { key: 'cafe',   label: 'קפה',    icon: '☕' },
  { key: 'bakery', label: 'מאפייה', icon: '🥐' },
];
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORY_META.map((c) => [c.key, c.label]));
export const CATEGORY_ICONS:  Record<string, string> = Object.fromEntries(CATEGORY_META.map((c) => [c.key, c.icon]));

/** Multi-choice categories, falling back to the legacy single `category`. */
export function businessCategories(r: { categories?: string[]; category?: string }): string[] {
  if (r.categories?.length) return r.categories;
  return r.category ? [r.category] : [];
}

// ── Kashrut certification ───────────────────────────────────────────────────

/** Curated third-party badatzim (consistent spelling → consistent filtering). */
export const BADATZ_LIST: string[] = [
  'בד"ץ בית יוסף',
  'בד"ץ העדה החרדית',
  'בד"ץ בעלז',
  'בד"ץ מהדרין',
  'בד"ץ חתם סופר',
  'בד"ץ רובין',
  'בד"ץ שארית ישראל',
  'בד"ץ אגודת ישראל',
];

const ATTR_TAGS: Record<string, string> = {
  chalav_israel: 'חלב ישראל',
  bishul_israel: 'בישול ישראל',
  glatt:         'גלאט',
};

// Preferred ordering for the kashrut filter chips
const TAG_ORDER = ['רבנות', 'מהדרין', 'חלב ישראל', 'בישול ישראל', 'גלאט'];

export function isLocalRabbanut(c: KosherCertificate): boolean {
  return c.certifierType === 'local_rabbanut'
    || (c.id ?? '').startsWith('cert-local-')          // certs created by this app
    || (!c.certifierType && (c.issuedBy ?? '').includes('רבנות')); // legacy fallback
}

/**
 * Filterable kashrut tags for a business, derived from its active certificates:
 *  • local rabbanut (רגיל)   → "רבנות"
 *  • local rabbanut (מהדרין) → "מהדרין"
 *  • each badatz              → its name
 *  • attributes              → "חלב ישראל" / "בישול ישראל" / "גלאט"
 */
export function certificationTags(r: { kosherCertificates?: KosherCertificate[] }): string[] {
  const tags = new Set<string>();
  for (const c of r.kosherCertificates ?? []) {
    if (!c.isActive) continue;
    if (isLocalRabbanut(c)) {
      tags.add(c.kosherLevel.includes('mehadrin') ? 'מהדרין' : 'רבנות');
    } else if (c.issuedBy) {
      tags.add(c.issuedBy);
      if (c.kosherLevel.includes('mehadrin')) tags.add('מהדרין');
    }
    for (const lvl of c.kosherLevel) {
      if (ATTR_TAGS[lvl]) tags.add(ATTR_TAGS[lvl]);
    }
  }
  return [...tags];
}

// ── Per-cert change detection (for kashrut update alerts) ───────────────────

export interface CertChange {
  direction: 'up' | 'down';
  certType: 'local_rabbanut' | 'badatz';
  tags: string[];
  note?: string;
}

/**
 * Compares old vs new cert arrays and returns one CertChange per meaningful
 * difference — one for the rabbanut (level/active change) and one per badatz
 * added or removed.  Never conflates the two.
 */
export function detectCertChanges(
  oldCerts: KosherCertificate[],
  newCerts: KosherCertificate[],
): CertChange[] {
  const changes: CertChange[] = [];

  // ── Local rabbanut ──────────────────────────────────────────────────────
  // The rabbanut cert is ALWAYS first in the array — that's the only reliable
  // invariant for old data that may lack certifierType or a recognisable name.
  // isLocalRabbanut is tried first; position is the fallback.
  const oldRab = oldCerts.find(isLocalRabbanut) ?? oldCerts[0];
  const newRab = newCerts.find(isLocalRabbanut) ?? newCerts[0];
  const wasActive   = oldRab?.isActive ?? false;
  const isActive    = newRab?.isActive ?? false;
  const wasMehadrin = (oldRab?.kosherLevel ?? []).includes('mehadrin');
  const isMehadrin  = (newRab?.kosherLevel ?? []).includes('mehadrin');

  if (wasActive !== isActive) {
    changes.push({
      direction: isActive ? 'up' : 'down',
      certType: 'local_rabbanut',
      tags: [isActive ? 'הופעלה' : 'הושבתה'],
    });
  } else if (wasActive && isActive && wasMehadrin !== isMehadrin) {
    changes.push({
      direction: isMehadrin ? 'up' : 'down',
      certType: 'local_rabbanut',
      tags: [isMehadrin ? 'מהדרין' : 'רגיל'],
    });
  }

  // ── Badatz — everything that is NOT the rabbanut cert ──────────────────
  // Use object identity to exclude whichever cert was resolved as rabbanut above.
  const oldBadatz = oldCerts.filter((c) => c !== oldRab);
  const newBadatz = newCerts.filter((c) => c !== newRab);
  const rabbanutStillActive = isActive; // rabbanut state after the save

  // Removed / deactivated
  for (const old of oldBadatz) {
    if (!old.isActive) continue;
    const match = newBadatz.find((n) => n.id === old.id || n.issuedBy === old.issuedBy);
    if (!match || !match.isActive) {
      changes.push({
        direction: 'down',
        certType: 'badatz',
        tags: [old.issuedBy || 'בד"ץ'],
        note: rabbanutStillActive ? 'כשרות הרבנות בתוקף' : undefined,
      });
    }
  }

  // Added / reactivated
  for (const nw of newBadatz) {
    if (!nw.isActive) continue;
    const match = oldBadatz.find((o) => o.id === nw.id || o.issuedBy === nw.issuedBy);
    if (!match || !match.isActive) {
      changes.push({
        direction: 'up',
        certType: 'badatz',
        tags: [nw.issuedBy || 'בד"ץ'],
      });
    }
  }

  return changes;
}

/** Sort tags with the common ones first, badatzim after (alpha). */
export function sortCertTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => {
    const ia = TAG_ORDER.indexOf(a), ib = TAG_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, 'he');
  });
}

export async function getBusinessesByCity(cityId: string): Promise<Business[]> {
  const q = query(collection(db, COL), where('cityId', '==', cityId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Business));
}

export async function getBusiness(id: string): Promise<Business | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Business;
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...sanitize(data), updatedAt: serverTimestamp() });
}

export async function addBusiness(data: Omit<Business, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...sanitize(data), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function deleteBusiness(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export async function updateKosherCertificates(
  businessId: string,
  certificates: KosherCertificate[]
): Promise<void> {
  await updateDoc(doc(db, COL, businessId), {
    kosherCertificates: sanitize(certificates),
    updatedAt: serverTimestamp(),
  });
}
