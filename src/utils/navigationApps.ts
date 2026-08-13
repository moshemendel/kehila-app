import { Linking, Platform } from 'react-native';

/**
 * Opening a destination in whatever navigation app the user prefers.
 *
 * ANDROID uses the OS app chooser via a `geo:` URI. That's deliberate: the
 * chooser lists every installed app that handles navigation — Waze, Google
 * Maps, Moovit, offline map apps — which a hardcoded list never could, and it
 * is the picker users already recognise.
 *
 * The URI format matters. The old code sent:
 *
 *     geo:0,0?q=<lat>,<lon>(<name>)
 *
 * `geo:0,0` means "I have no coordinates — treat q as a search string". Google
 * Maps is lenient and parses the numbers back out of q, but Waze took the whole
 * thing (including the Google-specific "(name)" suffix) as free text, failed to
 * read it as a location, and navigated to a default city instead.
 *
 * We now put the real coordinates in the URI authority AND in q, with no
 * parenthesised label, so an app is correct whichever half it reads. The label
 * is what made q unparseable, and a correct pin matters more than a named one.
 *
 * iOS has no equivalent chooser, so callers fall back to an in-app sheet — see
 * hooks/useNavigateTo.tsx.
 */

export interface NavTarget {
  latitude?: number;
  longitude?: number;
  /** Used when no coordinates are stored — the app searches for this text. */
  address?: string;
  /** Admin-provided Waze permalink, preferred over coordinates when present. */
  wazeLink?: string;
}

const hasCoords = (t: NavTarget): t is NavTarget & { latitude: number; longitude: number } =>
  typeof t.latitude === 'number' && typeof t.longitude === 'number';

/** True when the platform can show its own "open with" chooser. */
export const HAS_NATIVE_CHOOSER = Platform.OS === 'android';

export function buildGeoUri(t: NavTarget): string {
  if (hasCoords(t)) {
    const ll = `${t.latitude},${t.longitude}`;
    return `geo:${ll}?q=${ll}`;
  }
  // No coordinates — here `geo:0,0` is correct: it genuinely IS a text search.
  // (The old bug was using that form to carry coordinates.)
  return `geo:0,0?q=${encodeURIComponent(t.address ?? '')}`;
}

/** Android: hand the OS a well-formed geo: URI and let it show the chooser. */
export async function openNativeChooser(t: NavTarget): Promise<void> {
  try {
    await Linking.openURL(buildGeoUri(t));
  } catch {
    // No geo: handler at all (rare) — fall back to Google Maps on the web.
    await Linking.openURL(webFallback(t)).catch(() => {});
  }
}

/** Google Maps web URL — works on any platform, app or browser. */
export function webFallback(t: NavTarget): string {
  return hasCoords(t)
    ? `https://www.google.com/maps/dir/?api=1&destination=${t.latitude},${t.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.address ?? '')}`;
}

// ─── iOS fallback: explicit per-app links ────────────────────────────────────

export type NavAppId = 'waze' | 'google' | 'apple';

export interface NavApp {
  id: NavAppId;
  label: string;
  icon: string;
  color: string;
}

export const IOS_NAV_APPS: NavApp[] = [
  { id: 'apple',  label: 'מפות',        icon: 'compass',  color: '#0A84FF' },
  { id: 'waze',   label: 'Waze',        icon: 'navigate', color: '#33CCFF' },
  { id: 'google', label: 'Google Maps', icon: 'map',      color: '#34A853' },
];

function iosUrls(app: NavAppId, t: NavTarget): { primary: string; fallback: string } {
  if (!hasCoords(t)) {
    const q = encodeURIComponent(t.address ?? '');
    const search = {
      waze:   `waze://?q=${q}&navigate=yes`,
      google: `comgooglemaps://?q=${q}`,
      apple:  `maps://?q=${q}`,
    }[app];
    return { primary: t.wazeLink ?? search, fallback: webFallback(t) };
  }
  const ll = `${t.latitude},${t.longitude}`;
  switch (app) {
    case 'waze':
      return {
        primary:  t.wazeLink ?? `waze://?ll=${ll}&navigate=yes`,
        fallback: t.wazeLink ?? `https://waze.com/ul?ll=${ll}&navigate=yes`,
      };
    case 'google':
      return {
        primary:  `comgooglemaps://?daddr=${ll}&directionsmode=driving`,
        fallback: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
      };
    case 'apple':
      return {
        primary:  `maps://?daddr=${ll}&dirflg=d`,
        fallback: `https://maps.apple.com/?daddr=${ll}&dirflg=d`,
      };
  }
}

/** Open one specific app (iOS sheet rows). Falls back to its web URL. */
export async function openInNavApp(app: NavAppId, t: NavTarget): Promise<void> {
  const { primary, fallback } = iosUrls(app, t);
  try {
    await Linking.openURL(primary);
  } catch {
    await Linking.openURL(fallback).catch(() => {});
  }
}
