/**
 * R19 (APP-142) — the transparent modal screen every OS-presented pop renders into.
 * Declared at the ROOT, not under `(main)`: `PanelShell` renders ABOVE `(main)`'s
 * Stack, so a modal declared there would open *underneath* the panels. Options
 * (`transparentModal` + `fade`) live in `app/_layout.tsx`.
 */
import { PopScreenContent } from "../src/ui/popScreen";

export default PopScreenContent;
