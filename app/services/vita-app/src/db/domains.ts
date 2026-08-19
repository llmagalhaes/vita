/**
 * Composition flags — "what Vita keeps" (APP-095; prototype `domRows` line 1526,
 * `dom` gating map lines 1612–1614).
 *
 * Five keys, every one default ON: meals · water · move · habits · weight. Turning
 * one off HIDES its surfaces everywhere — it never deletes a thing, which is why the
 * toast says "history stays". Storage is `Settings.domains`, one plain serializable
 * object, so the later user_settings sync (APP-110) can wrap this module instead of
 * reshaping it.
 */
import { showToast } from "../ui/toast";
import { useLogVersion } from "./notify";
import { getSettings, patch, type Domains } from "./settings";

export type DomainKey = keyof Domains;

/** Row names (prototype `domRows`) — also the subject of the toggle toasts. */
// ponytail: literal copy until the round's i18n sweep moves the whole app's strings
// into `t()` (app-plan §"i18n"); the acceptance test pins the exact prototype wording.
export const DOMAIN_NAMES: Record<DomainKey, string> = {
  meals: "Meals & eating plan",
  water: "Water",
  move: "Movement",
  habits: "Habits",
  weight: "Body weight",
};

export const DOMAIN_KEYS = Object.keys(DOMAIN_NAMES) as DomainKey[];

/** Persisted flags, per-key default ON (absent field = pre-v4 profile = everything on). */
export function getDomains(): Domains {
  const d = getSettings()?.domains;
  return Object.fromEntries(DOMAIN_KEYS.map((k) => [k, d?.[k] !== false])) as Domains;
}

/** The gating predicates the screens consume, alongside the raw flags. */
export type DomainState = Domains & {
  /** Overview water+macros row (prototype `rowWM`). */
  rowWM: boolean;
  /** Any Overview zone at all (prototype `ovOn`). */
  ovOn: boolean;
  /** "Your day" timeline (prototype `tlOn`). */
  tlOn: boolean;
};

export const derive = (d: Domains): DomainState => ({
  ...d,
  rowWM: d.water || d.meals,
  ovOn: d.water || d.habits || d.weight || d.meals,
  tlOn: d.meals || d.move,
});

/** Non-React readers (recap lines, notifier, exports). */
export const domainState = (): DomainState => derive(getDomains());

/** Screens: re-reads on any local write (the same `logChanged` signal `patch` fires). */
export function useDomains(): DomainState {
  useLogVersion();
  return domainState();
}

/** Bulk write, no toast — onboarding step 2 commits the whole set at once. */
export function setDomains(next: Partial<Domains>): void {
  patch({ domains: { ...getDomains(), ...next } });
}

/** One row toggled in Library → write + the prototype's toast. Never deletes data. */
export function setDomain(key: DomainKey, on: boolean): void {
  setDomains({ [key]: on });
  showToast(on ? `${DOMAIN_NAMES[key]} is back` : `${DOMAIN_NAMES[key]} hidden — history stays`);
}

export const toggleDomain = (key: DomainKey): void => setDomain(key, !getDomains()[key]);
