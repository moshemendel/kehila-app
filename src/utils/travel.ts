/**
 * Travel-time estimates, and whether a minyan is still reachable.
 *
 * The question this screen really answers is not "which minyan is nearest" but
 * "which one can I still get to". A minyan starting in four minutes 1.5 km away
 * is useless even though it is both near and soon, and sorting by time alone
 * puts exactly that at the top of the list.
 *
 * ── The straight-line problem ────────────────────────────────────────────────
 *
 * Distances reach us from `haversineKm` — a קו אווירי, the line a bird flies.
 * Nobody walks that line. מעלה אדומים is built across ridges with wadis between
 * them, so the walked path is routinely longer than the line and occasionally
 * far longer: two buildings 400 m apart across a wadi can be a 1.2 km walk
 * around it.
 *
 * An earlier version hid this inside a deliberately slow pace — 15 min/km,
 * which is really 12 min/km of walking plus an unnamed allowance for detour.
 * That is unreasonable-about: nobody can say whether it is too generous or too
 * mean, because the two errors are tangled. So the model is now explicit:
 *
 *     straight line  ×  detour factor  =  distance actually travelled
 *     that distance  ÷  real pace      =  time
 *
 * Each number can now be argued with on its own, and swapping in real routing
 * later means replacing ONE step — routeKm — and nothing else.
 *
 * ── The detour factors ───────────────────────────────────────────────────────
 *
 * Street networks in ordinary towns run about 1.2–1.4× the straight line.
 * Walking gets the lower factor here and driving the higher one, which is the
 * opposite of the usual assumption but right for this terrain: pedestrians have
 * stairs and paths across the wadis that cars cannot use, so a car often has to
 * go the long way round while someone on foot cuts straight down and up.
 *
 * These remain ESTIMATES. They are wrong in individual cases by design, which
 * is why callers flag rather than filter: the congregant knows which staircase
 * exists, and we do not.
 */

/** Walked path ÷ straight line. Lower than driving — footpaths cross wadis. */
export const WALK_DETOUR = 1.35;

/** Driven path ÷ straight line. Cars follow roads around the terrain. */
export const DRIVE_DETOUR = 1.6;

/** Actual walking pace, applied to the DETOURED distance, not the straight line. */
export const WALK_KMH = 5;

/** In-town driving speed: stop-start, junctions, 30-50 zones. */
export const DRIVE_KMH = 45;

/** Straight-line km → km actually walked. */
export const walkKm = (km: number) => km * WALK_DETOUR;

/** Straight-line km → km actually driven. */
export const driveKm = (km: number) => km * DRIVE_DETOUR;

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

/** Minutes on foot for a straight-line distance, detour included. */
export function walkingMinutes(km: number): number {
  return Math.max(1, Math.ceil((walkKm(km) / WALK_KMH) * 60));
}

/** Minutes by car for a straight-line distance, detour and overhead included. */
export function drivingMinutes(km: number): number {
  return Math.max(1, Math.ceil((driveKm(km) / DRIVE_KMH) * 60 + DRIVE_OVERHEAD_MIN));
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
