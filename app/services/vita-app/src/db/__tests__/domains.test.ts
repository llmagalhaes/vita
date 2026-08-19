import { getToast } from "../../ui/toast";
import { resetDbForTests } from "../db";
import {
  DOMAIN_KEYS,
  derive,
  domainState,
  getDomains,
  setDomain,
  setDomains,
  toggleDomain,
} from "../domains";
import { kvGet, kvSet } from "../kv";
import { saveSettings, type Domains } from "../settings";

const only = (on: Partial<Domains>): Domains => ({
  meals: false,
  water: false,
  move: false,
  habits: false,
  weight: false,
  ...on,
});

beforeEach(() => {
  jest.useFakeTimers();
  resetDbForTests();
  saveSettings({ name: "Sam" });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test("every flag defaults on — with settings, and before onboarding wrote any", () => {
  expect(getDomains()).toEqual(only({ meals: true, water: true, move: true, habits: true, weight: true }));
  resetDbForTests(); // no settings row at all
  expect(getDomains()).toEqual(only({ meals: true, water: true, move: true, habits: true, weight: true }));
});

test("pre-v4 keepTrack prefs (incl. cycle) are ignored, not migrated", () => {
  // A profile persisted before APP-095: no `domains` field, a `cycle` key we dropped.
  kvSet("settings", {
    name: "Sam",
    keepTrack: { meals: true, water: false, workouts: false, habits: false, cycle: true },
  });
  expect(getDomains()).toEqual(only({ meals: true, water: true, move: true, habits: true, weight: true }));
  expect(Object.keys(getDomains())).toEqual(DOMAIN_KEYS);
});

test("a partially stored blob keeps its explicit offs and defaults the rest on", () => {
  saveSettings({ name: "Sam", domains: { water: false, meals: true } as Domains });
  expect(getDomains()).toEqual(only({ meals: true, move: true, habits: true, weight: true }));
});

test("predicates: rowWM = water||meals · ovOn = water||habits||weight||meals · tlOn = meals||move", () => {
  expect(derive(only({}))).toMatchObject({ rowWM: false, ovOn: false, tlOn: false });
  expect(derive(only({ water: true }))).toMatchObject({ rowWM: true, ovOn: true, tlOn: false });
  expect(derive(only({ meals: true }))).toMatchObject({ rowWM: true, ovOn: true, tlOn: true });
  expect(derive(only({ move: true }))).toMatchObject({ rowWM: false, ovOn: false, tlOn: true });
  expect(derive(only({ habits: true }))).toMatchObject({ rowWM: false, ovOn: true, tlOn: false });
  expect(derive(only({ weight: true }))).toMatchObject({ rowWM: false, ovOn: true, tlOn: false });
});

/** Snapshot of the gating map: what each flag alone switches on (acceptance). */
test("each flag's consumer list", () => {
  const consumers = (k: string) =>
    Object.entries(derive(only({ [k]: true })))
      .filter(([, on]) => on)
      .map(([name]) => name)
      .sort();
  expect(Object.fromEntries(DOMAIN_KEYS.map((k) => [k, consumers(k)]))).toEqual({
    meals: ["meals", "ovOn", "rowWM", "tlOn"],
    water: ["ovOn", "rowWM", "water"],
    move: ["move", "tlOn"],
    habits: ["habits", "ovOn"],
    weight: ["ovOn", "weight"],
  });
});

test("toggling persists, toasts the prototype's copy, and deletes nothing", () => {
  kvSet("entries", ["a meal I logged"]); // stand-in for any recorded history

  toggleDomain("water");
  expect(getDomains().water).toBe(false);
  expect(getToast()?.text).toBe("Water hidden — history stays");
  expect(domainState()).toMatchObject({ rowWM: true, ovOn: true }); // meals still on

  setDomain("water", true);
  expect(getDomains().water).toBe(true);
  expect(getToast()?.text).toBe("Water is back");

  setDomain("meals", false);
  expect(getToast()?.text).toBe("Meals & eating plan hidden — history stays");
  expect(domainState()).toMatchObject({ tlOn: true }); // move still on

  expect(kvGet("entries")).toEqual(["a meal I logged"]); // hidden ≠ deleted
});

test("bulk write (onboarding step 2) sets the set without toasting", () => {
  setDomains({ habits: false, weight: false });
  expect(getDomains()).toEqual(only({ meals: true, water: true, move: true }));
  expect(getToast()).toBeNull();
});
