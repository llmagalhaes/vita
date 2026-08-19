/**
 * `color-mix(in oklab, accent N%, base)` — the real thing (APP-093).
 *
 * v4 mixes up to 86% accent (muscle map fill `16 + v*70`); the old sRGB lerp in
 * `tint()` was only documented accurate to ~35%. Björn Ottosson's oklab matrices,
 * sRGB transfer function both ways. Hex in / hex out, opaque only — CSS
 * `color-mix` in a rectangular space is a plain per-coordinate lerp, so this
 * matches the prototype exactly.
 *
 * Always call `mixOklab(useAccent(), N)` so vacation mode swaps every tint at
 * once — never hardcode the mixed color.
 */

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (c: number): number => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

type Oklab = [number, number, number];

function hexToOklab(hex: string): Oklab {
  const s = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLinear(parseInt(s.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const t = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * t,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * t,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * t,
  ];
}

function oklabToHex([L, A, B]: Oklab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const t = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * t,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * t,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * t,
  ];
  return `#${rgb.map((c) => linearToSrgb(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** `color-mix(in oklab, accent pct%, base)`. `pct` is 0–100. */
export function mixOklab(accent: string, pct: number, base = "#FFFDF7"): string {
  const a = hexToOklab(accent);
  const b = hexToOklab(base);
  const f = Math.max(0, Math.min(100, pct)) / 100;
  return oklabToHex([0, 1, 2].map((i) => a[i] * f + b[i] * (1 - f)) as Oklab);
}
