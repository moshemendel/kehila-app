/**
 * A handful of timestamps from the moment the JS bundle starts running.
 *
 * Kept in release builds on purpose. This session spent four rounds guessing at
 * a slowness that turned out to be a blocked API key retrying for eight
 * seconds — visible in logcat the moment anyone looked, and invisible from the
 * code. The marks below make the same question answerable next time without a
 * rebuild:
 *
 *   adb logcat -d | grep startup
 *
 * Each mark is one console.log. That reaches logcat and costs nothing at this
 * volume; a mark inside a render or a loop would not belong here.
 */
const t0 = Date.now();
const seen = new Set<string>();

/** Time since the bundle started, in ms. */
export function sinceStart(): number {
  return Date.now() - t0;
}

/**
 * Record a milestone. Repeats are ignored, so a mark can sit in a callback that
 * fires on every snapshot and still report only the first — which is the one
 * that says how long the user waited.
 */
export function mark(label: string): void {
  if (seen.has(label)) return;
  seen.add(label);
  console.log(`[startup] +${sinceStart()}ms ${label}`);
}
