/**
 * Password rules for email registration.
 *
 * Enforced on the client only — Firebase Auth's own floor is 6 characters, and
 * raising it server-side needs Identity Platform. That's an accepted limit: the
 * rules exist so ordinary users don't pick "123456", not to stop someone
 * determined to call the REST API directly with a weak one.
 *
 * ENGLISH ONLY. Every character must be printable ASCII. A Hebrew password is
 * a trap on a phone: the keyboard switches layout between the field where it
 * was chosen and the field where it's retyped, the masked dots give no clue
 * which layout is active, and the same password typed on the admin dashboard's
 * physical keyboard usually comes out different. The account then can't be
 * entered and — before the reset flow existed — couldn't be recovered either.
 *
 * Turn a rule off by deleting its entry from RULES. An uppercase rule was tried
 * and dropped before the pilot: on a phone keyboard it's the rule that stops
 * older users cold, and it buys far less than the length does. If registrations
 * still stall, drop `symbol` next — never the length.
 */

export const MIN_LENGTH = 8;
/** Firebase itself rejects anything over 4096; well below any real password. */
export const MAX_LENGTH = 64;

export interface PasswordRule {
  key: string;
  /** Shown to the user as a live checklist while they type. */
  label: string;
  test: (pw: string) => boolean;
}

export const RULES: PasswordRule[] = [
  {
    key: 'length',
    label: `לפחות ${MIN_LENGTH} תווים`,
    test: (pw) => pw.length >= MIN_LENGTH,
  },
  {
    key: 'letter',
    // Case-insensitive: with the uppercase rule gone there is no reason to
    // reject an all-caps password, only to require a Latin letter somewhere.
    label: 'אות באנגלית (a-z)',
    test: (pw) => /[A-Za-z]/.test(pw),
  },
  {
    key: 'digit',
    label: 'ספרה אחת לפחות (0-9)',
    test: (pw) => /\d/.test(pw),
  },
  {
    key: 'symbol',
    // ASCII punctuation only, matching the english-only check below — a broader
    // test would pass a Hebrew geresh (״) that the next rule then rejects,
    // leaving the user with one green tick and one red error over one keystroke.
    label: 'תו מיוחד אחד לפחות (!@#$…)',
    test: (pw) => /[!-\/:-@[-`{-~]/.test(pw),
  },
  {
    key: 'english',
    // Printable ASCII, space excluded — a space is invisible in a masked field.
    label: 'אותיות באנגלית בלבד (ללא עברית ורווחים)',
    test: (pw) => /^[!-~]+$/.test(pw),
  },
];

/**
 * Passwords that pass every rule above and are still worthless.
 *
 * Short list on purpose — it catches the shapes people actually reach for when
 * a form demands "a capital and a symbol", not a dictionary.
 */
const BLOCKLIST = [
  'password1!', 'password123!', 'passw0rd!', 'qwerty123!', 'abcd1234!',
  'aaaaaaa1!', '1qaz2wsx!', 'admin123!', 'welcome1!', 'kehila123!',
];

export interface PasswordCheck {
  /** Every rule with its current pass/fail, in display order. */
  rules: { key: string; label: string; met: boolean }[];
  /** True when the password may be submitted. */
  ok: boolean;
  /** 0–4, for the strength bar. */
  score: number;
  /** Set when the password is rejected for a reason no rule covers. */
  error?: string;
}

/**
 * Check a password, optionally against the user's own details.
 *
 * `name`/`email` are passed so "Israel2024!" for israel@… is refused — a
 * password built from the account it protects is the first thing anyone guesses.
 */
export function checkPassword(
  pw: string,
  who: { name?: string; email?: string } = {},
): PasswordCheck {
  const rules = RULES.map((r) => ({ key: r.key, label: r.label, met: r.test(pw) }));
  const allMet = rules.every((r) => r.met);

  let error: string | undefined;
  const lower = pw.toLowerCase();

  if (pw.length > MAX_LENGTH) {
    error = `הסיסמה ארוכה מדי (עד ${MAX_LENGTH} תווים)`;
  } else if (BLOCKLIST.includes(lower)) {
    error = 'הסיסמה נפוצה מדי — בחר/י צירוף אחר';
  } else if (/^(.)\1+$/.test(pw)) {
    error = 'הסיסמה מורכבת מתו אחד חוזר';
  } else {
    // A name or email prefix of 3+ characters appearing whole inside the
    // password. Shorter than that produces false positives on common letters.
    const parts = [
      ...(who.name ?? '').split(/\s+/),
      (who.email ?? '').split('@')[0],
    ].map((v) => v.trim().toLowerCase()).filter((v) => v.length >= 3);
    if (parts.some((v) => lower.includes(v))) {
      error = 'הסיסמה לא יכולה להכיל את השם או האימייל שלך';
    }
  }

  // Score is for the bar only — the rules decide whether it's accepted. Scaled
  // to the rule count rather than counted, so adding or removing a rule doesn't
  // silently change what a full bar means.
  const met = rules.filter((r) => r.met).length;
  let score = Math.round((met / rules.length) * 4);
  if (pw.length >= 12 && allMet) score = 4;
  if (error) score = Math.min(score, 1);

  return {
    rules,
    ok: allMet && !error,
    score: Math.max(0, Math.min(4, score)),
    error,
  };
}

export const STRENGTH_LABELS = ['חלשה מאוד', 'חלשה', 'בינונית', 'טובה', 'חזקה'];
