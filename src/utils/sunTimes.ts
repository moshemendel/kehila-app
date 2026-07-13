/**
 * NOAA sunrise/sunset algorithm.
 * Returns local times as minutes from midnight.
 * altitude: solar altitude at event (degrees). Default -0.8333 = standard sunrise/sunset.
 */

function julianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function jdToLocalMin(jd: number, tzOffsetHours: number): number {
  const frac = (jd + 0.5) % 1;
  const utcMin = frac * 1440;
  let localMin = utcMin + tzOffsetHours * 60;
  if (localMin < 0) localMin += 1440;
  if (localMin >= 1440) localMin -= 1440;
  return localMin;
}

export interface SunTimes {
  sunrise: number;   // minutes from local midnight, -1 if no sunrise
  sunset: number;    // minutes from local midnight, -1 if no sunset
  solarNoon: number;
}

export function getSunTimes(
  date: Date,
  lat: number,
  lon: number,
  altitude = -0.8333,
  tzOffsetHours = 3,
  elevationMeters = 0,
): SunTimes {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const day   = date.getDate();

  // Horizon dip due to elevation (with atmospheric refraction correction).
  // At higher elevation the visual horizon dips below the mathematical horizon,
  // so the sun is seen earlier at sunrise and later at sunset.
  const horizonDip = elevationMeters > 0 ? 0.0293 * Math.sqrt(elevationMeters) : 0;
  const effectiveAltitude = altitude - horizonDip;

  const JD = julianDayNumber(year, month, day);
  const n  = JD - 2451545.0;

  const Jstar = n - lon / 360;

  const M    = (357.5291 + 0.98560028 * Jstar) % 360;
  const Mrad = (M * Math.PI) / 180;

  const C =
    1.9148 * Math.sin(Mrad) +
    0.02   * Math.sin(2 * Mrad) +
    0.0003 * Math.sin(3 * Mrad);

  const lambda    = (M + C + 180 + 102.9372) % 360;
  const lambdaRad = (lambda * Math.PI) / 180;

  const Jtransit =
    2451545.0 + Jstar + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lambdaRad);

  const sinDec = Math.sin(lambdaRad) * Math.sin((23.4397 * Math.PI) / 180);
  const dec    = Math.asin(sinDec);

  const latRad = (lat * Math.PI) / 180;
  const altRad = (effectiveAltitude * Math.PI) / 180;
  const cosOmega =
    (Math.sin(altRad) - Math.sin(latRad) * sinDec) /
    (Math.cos(latRad) * Math.cos(dec));

  const solarNoon = jdToLocalMin(Jtransit, tzOffsetHours);

  if (cosOmega < -1 || cosOmega > 1) {
    return { sunrise: -1, sunset: -1, solarNoon };
  }

  const omegaDeg = (Math.acos(cosOmega) * 180) / Math.PI;

  return {
    sunrise:   jdToLocalMin(Jtransit - omegaDeg / 360, tzOffsetHours),
    sunset:    jdToLocalMin(Jtransit + omegaDeg / 360, tzOffsetHours),
    solarNoon,
  };
}
