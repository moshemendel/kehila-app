#!/usr/bin/env npx tsx
/**
 * Zmanim comparison test — mirrors astral_times.py output format.
 *
 * Usage (from kehila-app/):
 *   npx tsx scripts/test-zmanim.ts                                     # today, Maale Adumim
 *   npx tsx scripts/test-zmanim.ts 31.774683 35.300101                 # coords, today
 *   npx tsx scripts/test-zmanim.ts 31.774683 35.300101 2026-06-18      # coords + date
 *
 * Requires Node 18+ (built-in fetch).
 */

import { calcZmanim, minToStr, PRESET_RAV_OVADIA } from '../src/utils/zmanim';

// ── Mountain angle math (same as mountainAngle.ts, no AsyncStorage) ───────────

function getDeclRad(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const doy   = Math.round((date.getTime() - start.getTime()) / 86_400_000);
  const g     = (2 * Math.PI / 365) * (doy - 1);
  return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
       - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
}

function sunriseAzimuth(latDeg: number, declRad: number): number {
  const D   = Math.PI / 180;
  const lat = latDeg * D;
  const cosAz = (Math.sin(declRad) + Math.sin(-0.833 * D) * Math.sin(lat))
              / (Math.cos(0.833  * D) * Math.cos(lat));
  return Math.acos(Math.max(-1, Math.min(1, cosAz))) / D;
}

function destPoint(lat: number, lon: number, azDeg: number, km: number): [number, number] {
  const D = Math.PI / 180, R = 6371;
  const la = lat * D, lo = lon * D, b = azDeg * D, d = km / R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [la2 / D, lo2 / D];
}

async function fetchElevation(lat: number, lon: number): Promise<number> {
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
  if (!res.ok) return 0;
  const data = (await res.json()) as { elevation: number[] };
  return Math.round(data.elevation?.[0] ?? 0);
}

async function computeMountainAngle(lat: number, lon: number, myElev: number, date: Date): Promise<number> {
  const az  = sunriseAzimuth(lat, getDeclRad(date));
  const pts = Array.from({ length: 80 }, (_, i) => destPoint(lat, lon, az, i + 1));
  const res = await fetch(
    `https://api.open-meteo.com/v1/elevation` +
    `?latitude=${pts.map(p => p[0].toFixed(6)).join(',')}` +
    `&longitude=${pts.map(p => p[1].toFixed(6)).join(',')}`
  );
  if (!res.ok) return 0;
  const data = (await res.json()) as { elevation: (number | null)[] };
  let maxAngle = 0;
  (data.elevation ?? []).forEach((elev, i) => {
    if (elev != null) maxAngle = Math.max(maxAngle, Math.atan2(elev - myElev, (i + 1) * 1000) * (180 / Math.PI));
  });
  return Math.round(maxAngle * 1000) / 1000;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const lat     = parseFloat(args[0] ?? '31.774683');
  const lon     = parseFloat(args[1] ?? '35.300101');
  const dateStr = args[2] ?? new Date().toISOString().slice(0, 10);

  // Use midday Israel time so the date is unambiguous regardless of UTC offset
  const date = new Date(`${dateStr}T12:00:00+03:00`);

  process.stderr.write(`Fetching elevation for ${lat}, ${lon}...\n`);
  const elevation = await fetchElevation(lat, lon);

  process.stderr.write(`Computing mountain angle (80-point terrain scan)...\n`);
  const declRad     = getDeclRad(date);
  const azimuth     = Math.round(sunriseAzimuth(lat, declRad) * 100) / 100;
  const mountainAngle = await computeMountainAngle(lat, lon, elevation, date);

  process.stderr.write(`Calculating zmanim...\n`);
  const zmanim = calcZmanim(date, lat, lon, PRESET_RAV_OVADIA, 'Asia/Jerusalem', 0, mountainAngle);

  const output = {
    metadata: {
      location: { lat, lon },
      date: dateStr,
      elevation_m: elevation,
      sun_azimuth: azimuth,
      mountain_angle: mountainAngle,
      shaah_zmanit_gra: Math.round(zmanim.shaahZmanitGra * 100) / 100,
    },
    zmanim: {
      alos_hashachar_72_zman:  minToStr(zmanim.alot,              true),
      sunrise_mishori:         minToStr(zmanim.netz,              true),
      sunrise_visible_vatikin: minToStr(zmanim.netzVatikin,       true),
      shema_mga_strict:        minToStr(zmanim.sofZmanShmaMga,    true),
      shema_gra:               minToStr(zmanim.sofZmanShma,       true),
      tefila_gra:              minToStr(zmanim.sofZmanTfila,      true),
      chatzot:                 minToStr(zmanim.chatzot,           true),
      shkiat_hachama:          minToStr(zmanim.shkia,             true),
      'tzeit_geonim_13.5':     minToStr(zmanim.tzetHakochavim,   true),
      tzeit_geonim_18:         minToStr(zmanim.tzetHakochavim18,  true),
      tzeit_rabbenu_tam_72:    minToStr(zmanim.tzetRabbenuTam,   true),
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
