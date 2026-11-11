/**
 * Per-city look of the home header: its colour, and how the council's emblem
 * sits in it. The console's city settings write these fields; the console's
 * preview mirrors this file's rules, so change them together.
 */

export type LogoFrame = 'disc' | 'none';

export const DEFAULT_HEADER = { top: '#1B4E8A', bottom: '#2E6DB4' } as const;

export const LOGO_SCALE_MIN = 0.6;
export const LOGO_SCALE_MAX = 1.3;

/** Header text is white, so a background must reach this contrast against white. */
const MIN_CONTRAST_WITH_WHITE = 4.5;

const HEX = /^#[0-9a-fA-F]{6}$/;

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** WCAG 2.x relative luminance of an sRGB colour. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of the colour against white (1–21). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** A usable header colour: well-formed and dark enough for white text. */
export function isValidHeaderColor(hex: unknown): hex is string {
  return typeof hex === 'string' && HEX.test(hex) && contrastWithWhite(hex) >= MIN_CONTRAST_WITH_WHITE;
}

/**
 * Gradient colours for a city's header. Anything absent, malformed or too light
 * falls back to the default blue, so a bad value in the database can never
 * leave the white text unreadable.
 */
export function resolveHeaderColors(headerColor?: string): { top: string; bottom: string } {
  if (!isValidHeaderColor(headerColor)) return { ...DEFAULT_HEADER };
  const bottom = headerColor.toUpperCase();
  const top = toHex(channels(bottom).map((c) => Math.round(c * 0.75)) as [number, number, number]);
  return { top, bottom };
}

export function resolveLogoFrame(frame?: string): LogoFrame {
  return frame === 'none' ? 'none' : 'disc';
}

export function resolveLogoScale(scale?: number): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return 1;
  return Math.min(LOGO_SCALE_MAX, Math.max(LOGO_SCALE_MIN, scale));
}
