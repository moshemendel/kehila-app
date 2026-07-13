// ─── Kehila App — Unified Design System ─────────────────────────────────────
//
// Primary brand: royal blue (#2E6DB4) — authority, tradition, trust
// Accent:        ceremonial gold (#B8922A)  — Torah, holiness, heritage
// Each service module gets its own semantic color token so the whole app
// speaks a consistent visual language while every section stays distinct.

export const Colors = {
  // ── Brand primaries ─────────────────────────────────────────────────────
  primary:      '#2E6DB4',   // royal blue
  primaryLight: '#4A90D4',   // light royal blue (links, active chips)
  primaryDark:  '#1B4E8A',   // deep royal blue (gradient tops, avatar bg)

  // ── Gold accent ─────────────────────────────────────────────────────────
  gold:         '#B8922A',   // ceremonial gold (buttons, borders)
  goldBright:   '#F0C84C',   // bright gold (star favorites, highlights)
  goldMuted:    '#C9A84C',   // muted warm gold (zmanim screen values)

  // ── Module semantic colors ───────────────────────────────────────────────
  kosher:    '#1B6B47',   // forest green  — kashrut / restaurants
  mikveh:    '#0B6B87',   // water teal    — mikveh
  events:    '#5B3594',   // deep purple   — events / community / shiurim
  shacharit: '#C2600A',   // amber morning — shacharit prayer
  mincha:    '#2E6DB4',   // = primary     — mincha prayer
  maariv:    '#5B3594',   // = events      — maariv / night

  // ── System states ───────────────────────────────────────────────────────
  success: '#1B6B47',   // = kosher green
  warning: '#C2600A',   // = shacharit amber
  danger:  '#C0392B',   // red — closed / invalid / errors

  // ── Backgrounds ─────────────────────────────────────────────────────────
  background:     '#F4F7FC',   // soft blue-white (screen bg)
  cardBackground: '#FFFFFF',   // clean white (cards)

  // ── Text hierarchy ──────────────────────────────────────────────────────
  text:          '#0F1E38',   // near-black navy
  textSecondary: '#4A5A7A',   // slate blue
  textMuted:     '#8A9BBF',   // muted blue-grey

  // ── Borders & utility ───────────────────────────────────────────────────
  border:  '#D0DAF0',
  white:   '#FFFFFF',
  shadow:  'rgba(15,30,56,0.08)',

  // ── Legacy aliases (keep old references working without change) ──────────
  accent:      '#4A90D4',   // = primaryLight
  accentLight: '#C8DEFF',   // light blue (on-dark text accent)
};

export const Fonts = {
  regular: 'System',
  bold:    'System',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const Radius = {
  sm:   8,
  md:   12,
  lg:   20,
  full: 999,
};

export const Shadow = {
  card: {
    shadowColor: '#0F1E38',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
};
