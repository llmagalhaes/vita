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
import type { MealDetail, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import { entriesInRange } from "../db/entries";
import { aggregateDays } from "../trends/aggregate";
import { formatVolume } from "../lib/units";

export type Section = "meals" | "water" | "workouts" | "energy" | "macros";

/** Per-reader defaults — each export includes only what its reader needs. */
export type Audience = { id: string; sections: Section[] };
export const AUDIENCES: Audience[] = [
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

/** Every user-visible word in the PDF comes from the locale file (no literals here). */
export type Tr = (k: string, v?: Record<string, unknown>) => string;

function mealsSection(entries: LocalEntry[], t: Tr): string {
  const est = `<span class="est">${esc(t("common.estimate"))}</span>`;
  const rows = entries
    .filter((e) => e.type === "meal")
    .map((e) => {
      const d = e.detail as MealDetail;
      const kcal = Math.round(d.totals?.kcal ?? 0);
      return `<tr><td>${esc(dateLabel(e.occurredAt))}</td><td>${esc(d.title ?? t("export.pdf.meal"))}</td><td class="num">${kcal} ${esc(t("common.kcal"))} ${est}</td></tr>`;
    })
    .join("");
  return rows ? section(esc(t("export.section.meals")), `<table>${rows}</table>`) : "";
}

function workoutsSection(entries: LocalEntry[], t: Tr): string {
  const est = `<span class="est">${esc(t("common.estimate"))}</span>`;
  const rows = entries
    .filter((e) => e.type === "workout")
    .map((e) => {
      const d = e.detail as WorkoutDetail;
      const bits = [
        d.durationMin != null ? `${d.durationMin} ${esc(t("common.min"))}` : "",
        d.kcal != null ? `${Math.round(d.kcal)} ${esc(t("common.kcal"))} ${est}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr><td>${esc(dateLabel(e.occurredAt))}</td><td>${esc(d.title ?? t("export.pdf.workout"))}</td><td class="num">${bits}</td></tr>`;
    })
    .join("");
  return rows ? section(esc(t("export.section.workouts")), `<table>${rows}</table>`) : "";
}

function dailySection(entries: LocalEntry[], today: Date, kind: "water" | "energy" | "macros", t: Tr): string {
  const est = `<span class="est">${esc(t("common.estimate"))}</span>`;
  // 30-day buckets; only days with data print.
  const buckets = aggregateDays(entries, EXPORT_DAYS, today).filter((b) => b.consumedKcal || b.waterMl || b.spentKcal);
  if (buckets.length === 0) return "";
  const rows = buckets
    .map((b) => {
      const day = esc(b.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      if (kind === "water") return `<tr><td>${day}</td><td class="num">${esc(formatVolume(b.waterMl, t))}</td></tr>`;
      if (kind === "macros") {
        const line = t("export.pdf.macroLine", { p: Math.round(b.protein), c: Math.round(b.carbs), f: Math.round(b.fat) });
        return `<tr><td>${day}</td><td class="num">${esc(line)} ${est}</td></tr>`;
      }
      const line = t("export.pdf.energyLine", { in: Math.round(b.consumedKcal), out: Math.round(b.spentKcal) });
      return `<tr><td>${day}</td><td class="num">${esc(line)} ${est}</td></tr>`;
    })
    .join("");
  return section(esc(t(`export.section.${kind}`)), `<table>${rows}</table>`);
}

const section = (title: string, body: string) => `<h2>${title}</h2>${body}`;

export type ExportOpts = {
  audienceLabel: string;
  sections: Section[];
  today?: Date;
  t: Tr;
};

/** Build the export HTML from local entries. Pure — no DB, no native modules. */
export function buildExportHtml(entries: LocalEntry[], opts: ExportOpts): string {
  const today = opts.today ?? new Date();
  const t = opts.t;
  const inc = (s: Section) => opts.sections.includes(s);
  const parts = [
    inc("meals") ? mealsSection(entries, t) : "",
    inc("workouts") ? workoutsSection(entries, t) : "",
    inc("water") ? dailySection(entries, today, "water", t) : "",
    inc("macros") ? dailySection(entries, today, "macros", t) : "",
    inc("energy") ? dailySection(entries, today, "energy", t) : "",
  ].filter(Boolean);
  const body = parts.length
    ? parts.join("")
    : `<p class="empty">${esc(t("export.pdf.empty", { days: EXPORT_DAYS }))}</p>`;
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
    <h1>${esc(t("export.pdf.title"))}</h1>
    <p class="sub">${esc(t("export.pdf.preparedFor", { who: opts.audienceLabel, days: EXPORT_DAYS, date: today.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) }))}</p>
    <p class="note">${esc(t("export.pdf.note"))}</p>
    ${body}
    <footer>${esc(t("export.pdf.footer"))}</footer>
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
  const { File, Paths } = require("expo-file-system");
  if (!(await Sharing.isAvailableAsync())) {
    // Don't silently succeed — the caller surfaces this so it's not a mystery no-op.
    throw new Error("Sharing is not available on this device.");
  }
  // expo-print writes into a print-cache path that neither the share FileProvider
  // nor the File API may READ (device-verified: "not allowed to read file under
  // given url" / "Missing 'READ' permission"). So take the PDF as base64 straight
  // from expo-print and write it to the document dir ourselves, then share that
  // file (CEO bug #4).
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  const dest = new File(Paths.document, "vita-log.pdf");
  if (dest.exists) dest.delete();
  dest.write(base64, { encoding: "base64" });
  await Sharing.shareAsync(dest.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}
