/**
 * brandPalette.ts
 * The fixed 30-color Brand Kit palette shown in the color picker UI.
 *
 * This list must stay in sync with supabase/functions/_shared/palette.ts —
 * both files define the same 30 colors so a color a user picks in the app
 * always matches the color rendered into their generated documents.
 * Duplicated (not imported across the Deno/Vite boundary) since edge
 * functions and the frontend build are separate runtimes.
 */

export interface PaletteColor {
  /** Stable identifier stored in the database, e.g. "forest". */
  key: string;
  /** Human-readable name shown in the UI, e.g. "Forest". */
  name: string;
  /** Hex value, no leading "#". */
  hex: string;
}

export const BRAND_PALETTE: PaletteColor[] = [
  // Navy / Blue
  { key: 'navy',        name: 'Midnight Navy', hex: '1E3A5F' },
  { key: 'slate-blue',  name: 'Slate Blue',    hex: '3B5776' },
  { key: 'steel-blue',  name: 'Steel Blue',    hex: '46647F' },
  { key: 'denim',       name: 'Denim',         hex: '34506B' },
  { key: 'ink',         name: 'Ink',           hex: '16283D' },
  // Green
  { key: 'sage',        name: 'Sage',          hex: '6FAF9A' },
  { key: 'forest',      name: 'Forest',        hex: '3F6B52' },
  { key: 'olive',       name: 'Olive',         hex: '6B7A4A' },
  { key: 'eucalyptus',  name: 'Eucalyptus',    hex: '5B8C7B' },
  { key: 'moss',        name: 'Moss',          hex: '566B3E' },
  // Terracotta / Warm
  { key: 'terracotta',  name: 'Terracotta',    hex: 'C16B4F' },
  { key: 'clay',        name: 'Clay',          hex: 'B8794F' },
  { key: 'rust',        name: 'Rust',          hex: 'A85035' },
  { key: 'amber-gold',  name: 'Amber Gold',    hex: 'C08A32' },
  { key: 'ochre',       name: 'Ochre',         hex: 'B08635' },
  // Plum / Wine
  { key: 'plum',        name: 'Plum',          hex: '6B4570' },
  { key: 'wine',        name: 'Wine',          hex: '6E2C3B' },
  { key: 'mauve',       name: 'Mauve',         hex: '8C6076' },
  { key: 'berry',       name: 'Berry',         hex: '7A3B54' },
  { key: 'aubergine',   name: 'Aubergine',     hex: '4A3050' },
  // Charcoal / Neutral
  { key: 'charcoal',    name: 'Charcoal',      hex: '3A3D42' },
  { key: 'espresso',    name: 'Espresso',      hex: '4A3B32' },
  { key: 'stone',       name: 'Stone',         hex: '6B685F' },
  { key: 'taupe',       name: 'Taupe',         hex: '7D7267' },
  { key: 'graphite',    name: 'Graphite',      hex: '52565C' },
  // Deep accents
  { key: 'teal',        name: 'Teal',          hex: '2E6B6B' },
  { key: 'bronze',      name: 'Bronze',        hex: '8A6339' },
  { key: 'copper',      name: 'Copper',        hex: 'A6623B' },
  { key: 'indigo',      name: 'Indigo',        hex: '3D3F7A' },
  { key: 'burgundy',    name: 'Burgundy',      hex: '5C2430' },
];

const PALETTE_BY_KEY: Record<string, PaletteColor> = Object.fromEntries(
  BRAND_PALETTE.map((c) => [c.key, c])
);

/** Look up a palette color's hex by its key. Returns null for an unknown/missing key. */
export function paletteHex(key: string | null | undefined): string | null {
  if (!key) return null;
  return PALETTE_BY_KEY[key]?.hex ?? null;
}

/** Default primary/secondary keys used when a user has no Brand Kit yet. */
export const DEFAULT_PRIMARY_KEY = 'navy';
export const DEFAULT_SECONDARY_KEY = 'sage';

// ── Tint generation ──────────────────────────────────────────────────────────
// Mirrors supabase/functions/_shared/palette.ts's deriveTint() exactly, so
// the in-app doc viewer's "chip" colors match what's baked into the .docx
// file itself. Duplicated rather than shared since the edge functions
// (Deno) and this frontend (Vite) are separate build targets.

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Derive a light chip background + darker chip foreground from a base hex. */
export function deriveTint(baseHex: string): { bg: string; fg: string } {
  const [r, g, b] = hexToRgb(baseHex);
  const [h, s] = rgbToHsl(r, g, b);

  const bgSat = Math.max(0.25, Math.min(s, 0.5));
  const [bgR, bgG, bgB] = hslToRgb(h, bgSat, 0.93);

  const fgSat = Math.max(s, 0.35);
  const [fgR, fgG, fgB] = hslToRgb(h, fgSat, 0.28);

  return { bg: rgbToHex(bgR, bgG, bgB), fg: rgbToHex(fgR, fgG, fgB) };
}
