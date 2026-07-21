/**
 * Volume/weight display. Vita is metric-only (APP-071 — the imperial choice was
 * removed): ml under 1 L, else L (2 dp); kg. `t` keeps the unit words i18n-ready.
 */
export function formatVolume(ml: number, t: (k: string) => string): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(2)} ${t("common.l")}`;
  return `${ml} ${t("common.ml")}`;
}
