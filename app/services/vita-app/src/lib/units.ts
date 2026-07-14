import type { Units } from "../api/client";

const ML_PER_OZ = 29.5735; // US fluid ounce (matches the prototype's trends conversion)

/**
 * Water volume as a display string, respecting the user's units.
 * Metric: ml under 1 L, else L (2 dp). Imperial: whole fl oz.
 * `t` keeps the unit words i18n-ready (common.ml / common.l / common.oz).
 */
export function formatVolume(ml: number, units: Units, t: (k: string) => string): string {
  if (units === "imperial") return `${Math.round(ml / ML_PER_OZ)} ${t("common.oz")}`;
  if (ml >= 1000) return `${(ml / 1000).toFixed(2)} ${t("common.l")}`;
  return `${ml} ${t("common.ml")}`;
}
