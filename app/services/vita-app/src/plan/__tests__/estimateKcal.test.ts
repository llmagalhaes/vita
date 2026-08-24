/**
 * APP-116 — the food table and the estimate seam (handoff v4.2 §2.4, criterion 8).
 */
import { estK, estimateKcal } from "../estimateKcal";
import { api } from "../../api";
import { createMockApi } from "../../api/mock";

describe("estK", () => {
  it("prices Oats · 60 g at 235 (criterion 8)", () => {
    expect(estK({ name: "Oats", quantity: 60, unit: "g" })).toBe(235); // 60 × 3.89 = 233.4 → 235
  });

  it("keys on the first word only, case-insensitively", () => {
    expect(estK({ name: "oats, rolled", quantity: 60, unit: "g" })).toBe(235);
    expect(estK({ name: "Chicken breast", quantity: 100, unit: "g" })).toBe(165);
  });

  it("falls back per unit — g ×1.3, ml ×.45, serving 135, unit 90", () => {
    expect(estK({ name: "Feijoada", quantity: 100, unit: "g" })).toBe(130);
    expect(estK({ name: "Smoothie", quantity: 200, unit: "ml" })).toBe(90);
    expect(estK({ name: "Feijoada", quantity: 1, unit: "serving" })).toBe(135);
    expect(estK({ name: "Feijoada", quantity: 2, unit: "unit" })).toBe(180);
  });

  it("always lands on a multiple of 5, floor 5", () => {
    expect(estK({ name: "Rice", quantity: 150, unit: "g" })).toBe(195); // 195 exactly
    expect(estK({ name: "Tomato", quantity: 90, unit: "g" })).toBe(15); // 16.2 → 15
    expect(estK({ name: "Water", quantity: 500, unit: "ml" })).toBe(5); // 0 → the floor
    expect(estK({ name: "Coffee", quantity: 200, unit: "ml" })).toBe(5); // 4 → the floor
  });

  it("treats a missing/zero quantity as one", () => {
    expect(estK({ name: "Egg", unit: "unit" })).toBe(80); // 78 → 80
    expect(estK({ name: "Egg", quantity: 0, unit: "unit" })).toBe(80);
  });
});

describe("estimateKcal", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns the server's numbers, index-aligned, nulls passed through", async () => {
    const spy = jest
      .spyOn(api, "estimateFoodKcal")
      .mockResolvedValue({ items: [{ kcal: 235 }, { kcal: null }, { kcal: 90 }] });
    const out = await estimateKcal([
      { name: "Oats", quantity: 60, unit: "g" },
      { name: "Bolinho da vó", quantity: 1, unit: "unit" },
      { name: "Rice", quantity: 70, unit: "g" },
    ]);
    expect(out).toEqual([235, null, 90]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("pads a short answer rather than shifting the plan", async () => {
    jest.spyOn(api, "estimateFoodKcal").mockResolvedValue({ items: [{ kcal: 235 }] });
    expect(await estimateKcal([{ name: "Oats", quantity: 60, unit: "g" }, { name: "Rice", quantity: 70, unit: "g" }])).toEqual([235, null]);
  });

  it("falls back to the on-device table when the call fails", async () => {
    jest.spyOn(api, "estimateFoodKcal").mockRejectedValue(new Error("offline"));
    expect(await estimateKcal([{ name: "Oats", quantity: 60, unit: "g" }, { name: "Water", quantity: 500, unit: "ml" }])).toEqual([235, 5]);
  });

  it("slices past the contract's 60-item cap instead of 400ing", async () => {
    const spy = jest.spyOn(api, "estimateFoodKcal").mockImplementation(async ({ items }) => ({ items: items.map(() => ({ kcal: 5 })) }));
    const out = await estimateKcal(Array.from({ length: 61 }, () => ({ name: "Rice", quantity: 10, unit: "g" })));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(61);
  });

  it("asks nothing of the network for an empty list", async () => {
    const spy = jest.spyOn(api, "estimateFoodKcal");
    expect(await estimateKcal([])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

test("the mock API answers from the same table", async () => {
  const mock = createMockApi();
  await expect(mock.estimateFoodKcal({ items: [{ name: "Oats", quantity: 60, unit: "g" }] })).resolves.toEqual({
    items: [{ kcal: 235 }],
  });
});
