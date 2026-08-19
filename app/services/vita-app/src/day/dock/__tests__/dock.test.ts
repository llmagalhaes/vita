import {
  dotState,
  gaussian,
  hoverIndex,
  idleFingerX,
  indexForOffset,
  offsetForIndex,
  slotWidth,
  spreadFor,
  IDLE_SELECTED_SCALE,
  MAXD,
  NDAYS,
} from "../dock";

describe("dock math", () => {
  const rowWidth = 322; // prototype fallback width
  const slot = slotWidth(rowWidth);

  it("maps dot index ↔ day offset (rightmost = today)", () => {
    expect(offsetForIndex(9)).toBe(0); // rightmost dot = today
    expect(offsetForIndex(0)).toBe(9); // leftmost dot = 9 days ago
    expect(indexForOffset(0)).toBe(9);
    expect(indexForOffset(9)).toBe(0);
    // round-trip
    for (let i = 0; i < NDAYS; i++) expect(indexForOffset(offsetForIndex(i))).toBe(i);
  });

  it("hoverIndex clamps to [0,9] across the row", () => {
    expect(hoverIndex(0, slot)).toBe(0);
    expect(hoverIndex(rowWidth, slot)).toBe(MAXD);
    expect(hoverIndex(-50, slot)).toBe(0); // below the row
    expect(hoverIndex(rowWidth + 50, slot)).toBe(MAXD); // past the row
    // the finger over the center of dot 4 selects dot 4
    expect(hoverIndex((4 + 0.5) * slot, slot)).toBe(4);
  });

  it("gaussian peaks at 1 when d===0 and falls off", () => {
    const spread = spreadFor(slot);
    expect(gaussian(0, spread)).toBeCloseTo(1, 10);
    expect(gaussian(spread, spread)).toBeCloseTo(Math.exp(-1), 6);
    expect(gaussian(spread * 3, spread)).toBeLessThan(0.001);
  });

  it("idleFingerX lands on the selected dot's center", () => {
    // selected offset 0 (today) → dot index 9
    expect(idleFingerX(0, slot)).toBeCloseTo((9 + 0.5) * slot, 6);
    expect(idleFingerX(9, slot)).toBeCloseTo((0 + 0.5) * slot, 6);
  });

  it("dotState: dragging magnifies under the finger; idle rests the selected dot", () => {
    // finger dead-center on dot 5 while dragging → dot 5 at peak scale
    const under = dotState(5, (5 + 0.5) * slot, slot, true, 0);
    expect(under.mag).toBeCloseTo(1, 6);
    expect(under.scale).toBeGreaterThan(2); // 1 + 1.15
    expect(under.translateY).toBeLessThan(0); // lifts upward
    // a far dot barely moves
    const far = dotState(0, (5 + 0.5) * slot, slot, true, 0);
    expect(far.scale).toBeLessThan(1.05);
    // idle: today (offset 0 = dot 9) rests at the selected scale, others at 1
    const idleSel = dotState(9, idleFingerX(0, slot), slot, false, 0);
    expect(idleSel.scale).toBe(IDLE_SELECTED_SCALE);
    const idleOther = dotState(3, idleFingerX(0, slot), slot, false, 0);
    expect(idleOther.scale).toBe(1);
    expect(idleOther.opacity).toBeCloseTo(0.85, 6);
  });
});
