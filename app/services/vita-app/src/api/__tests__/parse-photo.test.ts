import type { MealDetail, WorkoutDetail } from "../client";
import { createHttpApi } from "../client";
import { createMockApi, mockPhotoParse } from "../mock";
import { resetDbForTests } from "../../db/db";
import { addLocalEntry, entriesForDay, getEntry } from "../../db/entries";
import { drainOutbox, pendingCount } from "../../db/outbox";

describe("mockPhotoParse (BE-018 stand-in)", () => {
  test("a plate photo → one meal draft, inputMethod photo, stepper-able items", () => {
    const { drafts } = mockPhotoParse();
    expect(drafts).toHaveLength(1);
    const meal = drafts[0]!;
    expect(meal.type).toBe("meal");
    expect(meal.inputMethod).toBe("photo");
    expect(meal.isEstimate).toBe(true);
    const detail = meal.detail as MealDetail;
    expect(detail.items.length).toBeGreaterThan(1);
    expect(detail.items.every((i) => (i.quantity ?? 1) >= 1)).toBe(true);
    expect(detail.totals!.kcal).toBe(620);
  });

  test("a gym caption → workout (whiteboard) draft", () => {
    const { drafts } = mockPhotoParse("gym whiteboard");
    expect(drafts[0]!.type).toBe("workout");
    const detail = drafts[0]!.detail as WorkoutDetail;
    expect(detail.exercises!.length).toBeGreaterThan(0);
    expect(detail.muscles).toContain("chest");
  });
});

describe("photo → confirm → outbox", () => {
  beforeEach(() => resetDbForTests());

  test("a photo-parsed draft writes locally and drains to the server", async () => {
    const draft = mockPhotoParse().drafts[0]!;
    const local = addLocalEntry(draft); // the confirm path's local write
    expect(entriesForDay(new Date())).toHaveLength(1);
    expect(pendingCount()).toBe(1);

    const { synced } = await drainOutbox(createMockApi());
    expect(synced).toBe(1);
    expect(getEntry(local.id)!.syncState).toBe("synced");
  });
});

describe("http client multipart transport (the shape BE-018 must match)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("POST /parse/photo sends a FormData body with no JSON content-type", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({ drafts: [] }) } as never;
    }) as never;

    const api = createHttpApi("https://api.test/v1");
    await api.parsePhoto({ image: { uri: "file://photo.jpg" }, caption: "lunch" });

    expect(captured!.url).toBe("https://api.test/v1/parse/photo");
    expect(captured!.init.method).toBe("POST");
    expect(captured!.init.body).toBeInstanceOf(FormData);
    const headers = (captured!.init.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });
});
