import i18n from "../../i18n";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry, entriesInRange } from "../../db/entries";
import { buildExportHtml } from "../pdf";

beforeEach(() => resetDbForTests());

// The real locale file — the PDF must carry no literal of its own (APP-108).
const t = (k: string, v?: Record<string, unknown>) => i18n.t(k, v ?? {});

function seed() {
  addLocalEntry({ type: "meal", occurredAt: new Date().toISOString(), inputMethod: "text", isEstimate: true, detail: { title: "Chicken & rice", items: [], totals: { kcal: 620, proteinG: 42, carbsG: 68, fatG: 22 } } });
  addLocalEntry({ type: "water", occurredAt: new Date().toISOString(), inputMethod: "tap", isEstimate: false, detail: { amountMl: 500 } });
  addLocalEntry({ type: "workout", occurredAt: new Date().toISOString(), inputMethod: "text", isEstimate: true, detail: { title: "Leg day", durationMin: 45, kcal: 320, muscles: ["quads"], exercises: [] } });
}

/** Read the same window exportPdf reads (last 30 days) from SQLite. */
function allEntries() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  return [
    ...entriesInRange("meal", start, end),
    ...entriesInRange("water", start, end),
    ...entriesInRange("workout", start, end),
  ];
}

test("builds HTML from local SQLite entries with the selected sections", () => {
  seed();
  const html = buildExportHtml(allEntries(), { audienceLabel: "My nutritionist", sections: ["meals", "water", "energy"], t });
  expect(html).toContain("Chicken &amp; rice"); // meal from SQLite
  expect(html).toContain("620 kcal");
  expect(html).toContain(t("export.section.water"));
  expect(html).toContain(t("export.section.energy"));
  expect(html).toContain("My nutritionist");
});

test("estimates are labeled in the PDF", () => {
  seed();
  const html = buildExportHtml(allEntries(), { audienceLabel: "Just for me", sections: ["meals"], t });
  expect(html).toMatch(/estimate/); // every number is flagged an estimate
});

test("only the chosen sections appear (workouts excluded here)", () => {
  seed();
  const html = buildExportHtml(allEntries(), { audienceLabel: "My nutritionist", sections: ["meals", "macros", "water"], t });
  expect(html).toContain("Macros");
  expect(html).not.toContain("<h2>Workouts</h2>"); // not requested
});

test("user free-text is HTML-escaped (trust boundary)", () => {
  addLocalEntry({ type: "meal", occurredAt: new Date().toISOString(), inputMethod: "text", isEstimate: true, detail: { title: "<script>x</script>", items: [], totals: { kcal: 10 } } });
  const html = buildExportHtml(allEntries(), { audienceLabel: "Me", sections: ["meals"], t });
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>x</script>");
});
