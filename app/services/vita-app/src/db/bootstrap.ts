/**
 * Launch-time hydration — the one place the app pulls its persisted state down.
 *
 * This used to live in `src/tabs/Home.tsx`'s mount effect. The APP-108 sweep deleted
 * that file and nothing replaced it, so on a clean install `getCachedPlan()` stayed
 * null forever (empty timeline, no day-close notification, "plan unknown" on every
 * past day), APP-111's log restore never ran, a plan finished server-side while the
 * app was backgrounded was never adopted, an offline plan/program edit was never
 * re-pushed, and the vacation accent never came back on a cold start.
 *
 * Order matters and is the old one: plan → program → vacation → log restore. Every
 * call is offline-tolerant and swallows its own failures; `restoreLog` drains the
 * outbox itself before paging, so nothing here needs to.
 */
import { api } from "../api";
import { refreshHealthConnect } from "../health/healthConnect";
import { logChanged } from "./notify";
import { syncPlan, syncProgram } from "./plan";
import { restoreLog } from "./restore";
import { syncVacation } from "./vacation";

/** Fire-and-forget: never blocks first paint (CEO Round-14: the restore is silent). */
export function startAppSync(): void {
  void syncPlan().then(logChanged);
  void syncProgram().then(logChanged);
  void syncVacation().then(logChanged);
  // Today's Health Connect totals, when that source is connected (no-op otherwise).
  void refreshHealthConnect();
  void restoreLog(api).catch(() => {});
}
