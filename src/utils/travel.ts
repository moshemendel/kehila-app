/**
 * Travel-time estimates, and whether a minyan is still reachable.
 *
 * The question this screen really answers is not "which minyan is nearest" but
 * "which one can I still get to". A minyan starting in four minutes 1.5 km away
 * is useless even though it is both near and soon, and sorting by time alone
 * puts exactly that at the top of the list.
 *
 * WALKING — 15 min/km, about 4 km/h, slower than a brisk walk on purpose.
 * Distances come from `haversineKm`, a straight line, while מעלה אדומים is built
 * across ridges with wadis between them: the real path is routinely longer than
 * the line, sometimes much longer. A deliberately slow pace absorbs part of that
 * error rather than promising times people cannot hit.
 *
 * DRIVING — 40 km/h, plus a fixed overhead. In-town driving is stop-start, and
 * the clock does not begin when the car moves: it begins when you start walking
 * to it and ends when you have parked and reached the door. Without that
 * overhead the maths claims a 300 m drive takes 30 seconds, which would be a
 * lie in the direction that makes people late. With it, short distances come out
 * roughly level with walking — which is the truth.
 *
 * These are ESTIMATES and never promises, which is why callers flag rather than
 * filter. Hiding a minyan because a straight-line guess called it unreachable
 * would be worse than showing it with a warning — the congregant knows the
 * shortcut through the wadi, and we do not.
 */

export const WALK_MIN_PER_KM = 15;   // ≈ 4 km/h
export const DRIVE_KMH = 40;

/** Door-to-door overhead for driving: reaching the car, parking, walking in. */
export const DRIVE_OVERHEAD_MIN = 3;

/** Minutes you want to be standing there BEFORE it starts. */
export const ARRIVE_BUFFER_MIN = 2;

/** Slack at or below this reads as "only just" rather than comfortable. */
const TIGHT_SLACK_MIN = 3;

/**
 * How far past the deadline still counts as "you'll make it if you don't dawdle".
 *
 * The walking estimate carries a couple of minutes of error in either direction,
 * so treating slack of -1 as a hard failure would be false precision pointing
 * the wrong way — telling someone they cannot reach a shul five minutes away.
 */
const ESTIMATE_TOLERANCE_MIN = 2;

/**
 * Driving is only worth suggesting if it saves real time.
 *
 * Without this the maths recommends a car for a 300 m walk, because the arrival
 * buffer tips the balance by a minute. Nobody drives 300 m to מנחה, and advice
 * people would ignore makes the rest of the advice easier to ignore too.
 */
const MIN_DRIVE_SAVING_MIN = 3;

export function walkingMinutes(km: number): number {
  return Math.max(1, Math.ceil(km * WALK_MIN_PER_KM));
}

export function drivingMinutes(km: number): number {
  return Math.max(1, Math.ceil((km / DRIVE_KMH) * 60 + DRIVE_OVERHEAD_MIN));
}

/** "~9 דק׳" / "~1 שע׳ 5 דק׳". The ~ is doing honest work. */
export function formatMinutes(m: number): string {
  if (m < 60) return `~${m} דק׳`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `~${h} שע׳ ${rem} דק׳` : `~${h} שע׳`;
}

export type ReachKind =
  /** No distance to work from — location denied, or the shul has no coordinates. */
  | 'unknown'
  /** Comfortable on foot. */
  | 'walk-ok'
  /** Makes it on foot, only just. */
  | 'walk-tight'
  /** Too late to walk, but drivable in time. */
  | 'drive-only'
  /** Not reachable in time by either. */
  | 'late';

export interface Reach {
  kind: ReachKind;
  walkMin: number;
  driveMin: number;
}

/**
 * Can this still be reached, and how?
 *
 * `minutesLeft` is minutes until the minyan starts. 'unknown' is a normal state
 * (location not granted), not a failure — callers should show nothing rather
 * than a warning, since a warning we cannot justify is worse than silence.
 */
export function reachInTime(km: number | null, minutesLeft: number): Reach {
  if (km == null || !Number.isFinite(km)) {
    return { kind: 'unknown', walkMin: 0, driveMin: 0 };
  }

  const walkMin = walkingMinutes(km);
  const driveMin = drivingMinutes(km);
  const walkSlack = minutesLeft - walkMin - ARRIVE_BUFFER_MIN;
  const driveSlack = minutesLeft - driveMin - ARRIVE_BUFFER_MIN;

  if (walkSlack > TIGHT_SLACK_MIN) return { kind: 'walk-ok', walkMin, driveMin };
  if (walkSlack >= -ESTIMATE_TOLERANCE_MIN) return { kind: 'walk-tight', walkMin, driveMin };

  const drivingHelps = walkMin - driveMin >= MIN_DRIVE_SAVING_MIN;
  if (drivingHelps && driveSlack >= 0) return { kind: 'drive-only', walkMin, driveMin };

  return { kind: 'late', walkMin, driveMin };
}
