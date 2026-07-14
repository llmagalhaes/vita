/**
 * On-device export (APP-031, standing decision D2). The log NEVER leaves the
 * phone until the user picks a share target: we build an HTML document from the
 * local SQLite entries, render it to a PDF with expo-print, then hand that file
 * to expo-sharing. No backend, no upload.
 *
 * `buildExportHtml` is pure (entries in → HTML string out) so the shaping is
 * unit-tested; `exportPdf` is the thin IO wrapper that reads the DB and drives
 * the native modules (lazy-required so Jest never loads them).
 */
import type { MealDetail, Units, WaterDetail, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import { entriesInRange } from "../db/entries";
import { aggregateDays } from "../trends/aggregate";
import { formatVolume } from "../lib/units";

export type Section = "meals" | "water" | "workouts" | "energy" | "macros";

/** Per-reader defaults — each export includes only what its reader needs. */
export type Audience = { id: string; sections: Section[] };
export const AUDIENCES: Audience[] = [
  { id: "doctor", sections: ["meals", "water", "energy"] },
  { id: "trainer", sections: ["workouts", "energy"] },
  { id: "nutritionist", sections: ["meals", "macros", "water"] },
  { id: "myself", sections: ["meals", "water", "workouts", "energy", "macros"] },
];

const EXPORT_DAYS = 30;

/** Escape user free-text before it enters HTML (trust boundary — meal titles etc.). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
  " " +
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const est = '<span class="est">estimate</span>';

function mealsSection(entries: LocalEntry[]): string {
  const rows = entries
    .filter((e) => e.type === "meal")
    .map((e) => {
      const d = e.detail as MealDetail;
      const kcal = Math.round(d.totals?.kcal ?? 0);
      return `<tr><td>${esc(dateLabel(e.occurredAt))}</td><td>${esc(d.title ?? "Meal")}</td><td class="num">${kcal} kcal ${est}</td></tr>`;
    })
    .join("");
  return rows ? section("Meals", `<table>${rows}</table>`) : "";
}

function workoutsSection(entries: LocalEntry[]): string {
  const rows = entries
    .filter((e) => e.type === "workout")
    .map((e) => {
      const d = e.detail as WorkoutDetail;
      const bits = [d.durationMin != null ? `${d.durationMin} min` : "", d.kcal != null ? `${Math.round(d.kcal)} kcal ${est}` : ""].filter(Boolean).join(" · ");
      return `<tr><td>${esc(dateLabel(e.occurredAt))}</td><td>${esc(d.title ?? "Workout")}</td><td class="num">${bits}</td></tr>`;
    })
    .join("");
  return rows ? section("Workouts", `<table>${rows}</table>`) : "";
}

function dailySection(entries: LocalEntry[], units: Units, today: Date, kind: "water" | "energy" | "macros", t?: (k: string) => string): string {
  const tr = t ?? ((k: string) => (k === "common.ml" ? "ml" : k === "common.l" ? "L" : k === "common.oz" ? "oz" : k));
  // 30-day buckets; only days with data print.
  const buckets = aggregateDays(entries, "M", today).filter((b) => b.consumedKcal || b.waterMl || b.spentKcal);
  if (buckets.length === 0) return "";
  const rows = buckets
    .map((b) => {
      const day = esc(b.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      if (kind === "water") return `<tr><td>${day}</td><td class="num">${esc(formatVolume(b.waterMl, units, tr))}</td></tr>`;
      if (kind === "macros")
        return `<tr><td>${day}</td><td class="num">P ${Math.round(b.protein)} · C ${Math.round(b.carbs)} · F ${Math.round(b.fat)} g ${est}</td></tr>`;
      return `<tr><td>${day}</td><td class="num">${Math.round(b.consumedKcal)} in · ${Math.round(b.spentKcal)} out kcal ${est}</td></tr>`;
    })
    .join("");
  const title = kind === "water" ? "Water" : kind === "macros" ? "Macros" : "Energy";
  return section(title, `<table>${rows}</table>`);
}

const section = (title: string, body: string) => `<h2>${title}</h2>${body}`;

export type ExportOpts = {
  audienceLabel: string;
  sections: Section[];
  units: Units;
  today?: Date;
  t?: (k: string) => string;
};

/** Build the export HTML from local entries. Pure — no DB, no native modules. */
export function buildExportHtml(entries: LocalEntry[], opts: ExportOpts): string {
  const today = opts.today ?? new Date();
  const inc = (s: Section) => opts.sections.includes(s);
  const parts = [
    inc("meals") ? mealsSection(entries) : "",
    inc("workouts") ? workoutsSection(entries) : "",
    inc("water") ? dailySection(entries, opts.units, today, "water", opts.t) : "",
    inc("macros") ? dailySection(entries, opts.units, today, "macros", opts.t) : "",
    inc("energy") ? dailySection(entries, opts.units, today, "energy", opts.t) : "",
  ].filter(Boolean);
  const body = parts.length ? parts.join("") : `<p class="empty">No entries in the last ${EXPORT_DAYS} days.</p>`;
  const generated = esc(today.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#4A4238;padding:34px 30px;line-height:1.5}
    h1{font-size:22px;margin:0 0 2px}
    .sub{color:#8A7E70;font-size:12px;margin:0 0 4px}
    .note{color:#8A7E70;font-size:11px;margin:0 0 18px}
    h2{font-size:14px;color:#A66A3F;text-transform:uppercase;letter-spacing:1px;margin:22px 0 6px}
    table{width:100%;border-collapse:collapse;font-size:12.5px}
    td{padding:6px 4px;border-bottom:1px solid #EDE5D6;vertical-align:top}
    td.num{text-align:right;color:#6E6355;white-space:nowrap}
    .est{color:#A66A3F;font-size:10px;font-style:italic}
    .empty{color:#8A7E70}
    footer{margin-top:26px;color:#B7AB9C;font-size:10.5px}
  </style></head><body>
    <h1>Vita — your log</h1>
    <p class="sub">Prepared for ${esc(opts.audienceLabel)} · last ${EXPORT_DAYS} days · generated ${generated}</p>
    <p class="note">Every number is an estimate from what you told Vita — Vita sets no goals and gives no advice.</p>
    ${body}
    <footer>Exported on device from Vita. Nothing was uploaded.</footer>
  </body></html>`;
}

/**
 * Read the last 30 days from SQLite, build the HTML, render a PDF and open the
 * OS share sheet. Nothing leaves the device until the user chooses a target.
 */
export async function exportPdf(opts: ExportOpts): Promise<void> {
  const today = opts.today ?? new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - EXPORT_DAYS);
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  const entries = [
    ...entriesInRange("meal", start, end),
    ...entriesInRange("water", start, end),
    ...entriesInRange("workout", start, end),
  ];
  const html = buildExportHtml(entries, opts);
  // Lazy require so tests and the pure builder never load the native modules.
  const Print = require("expo-print");
  const Sharing = require("expo-sharing");
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  }
}
