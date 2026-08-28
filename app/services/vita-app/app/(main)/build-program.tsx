/**
 * APP-124/125/127/128 — `bwOn`, the hand-built training program (handoff v4.2 §3).
 *
 *   shape (name + how many sessions)  →  days (one card per session)
 *
 * A rotation, not a weekly calendar: which day falls where in the week is the
 * Day's decision, not this screen's. Back walks the same ladder down — a day, then
 * the shape, then out.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { saveProgram } from "../../src/db/plan";
import { logChanged } from "../../src/db/notify";
import { PickExerciseSheet } from "../../src/workout/PickExerciseSheet";
import { BuilderShell } from "../../src/build/parts";
import { DayCard, ShapePhase } from "../../src/build/train/parts";
import { dayLetter, resizeDays, toProgramDraft, workoutKcalBody, type BwDay, type BwExercise } from "../../src/build/train/draft";
import { Button } from "../../src/ui";
import { showToast } from "../../src/ui/toast";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function BuildProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // A pure builder again (v4.3 R8): editing a saved program is `/edit-program`,
  // which drafts from the doc and PUTs it back.
  const [phase, setPhase] = useState<"shape" | "days">("shape");
  const [name, setName] = useState("");
  const [dayN, setDayN] = useState(3); // the stepper's ceiling is Day J
  const [step, setStep] = useState(0);
  const [days, setDays] = useState<BwDay[]>([]);
  const [pick, setPick] = useState(false);
  const [kcalBusy, setKcalBusy] = useState(false);

  // The estimate pass outlives a fast exit; nothing may setState after that.
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const day = days[step];
  const letter = (i: number) => t("build.program.dayLetter", { letter: dayLetter(i) });

  const start = () => {
    setDays((d) => resizeDays(d, dayN, letter));
    setStep(0);
    setPhase("days");
  };

  // `bwBack`: one day back → the shape → out. One button, the phase decides.
  const back = () => {
    if (phase === "days" && step > 0) return setStep(step - 1);
    if (phase === "days") return setPhase("shape");
    return router.canGoBack() ? router.back() : router.replace("/library");
  };

  const patch = (fn: (d: BwDay) => BwDay) => setDays((all) => all.map((d, i) => (i === step ? fn(d) : d)));
  const addExercise = (e: BwExercise) => patch((d) => ({ ...d, ex: [...d.ex, e] }));

  /**
   * D9 — one call per day, because energy is a property of the session.
   * The answer only ever lands on an EMPTY field (the control is hidden once a
   * number is there), so a typed number can never be overwritten.
   *
   * ponytail: no on-device fallback. A day's energy has no table to fall back to
   * the way food kcal does, and a made-up number is worse than none — a failure
   * simply leaves the field empty and editable.
   */
  const estimateKcal = async () => {
    const d = days[step];
    if (!d || d.ex.length === 0 || kcalBusy) return;
    setKcalBusy(true);
    try {
      // 1.5s is a FLOOR, not a fake timer: a slower answer simply takes longer.
      const [res] = await Promise.all([api.estimateWorkoutKcal({ exercises: workoutKcalBody(d) }), sleep(1500)]);
      if (!mounted.current) return;
      patch((x) => ((x.kcal ?? "") !== "" ? x : { ...x, kcal: String(res.kcal), kcalEst: true }));
    } catch {
      // nothing new on screen; the field stays empty and typeable
    } finally {
      if (mounted.current) setKcalBusy(false);
    }
  };

  const savedRef = useRef(false);
  const finish = () => {
    if (savedRef.current) return; // double-tap guard — no duplicate program version
    savedRef.current = true;
    const doc = toProgramDraft(name, days, t("build.program.fallbackName"));
    void saveProgram(doc).then(() => logChanged());
    showToast(t("build.program.saved", { name: doc.summary, count: doc.days.length }));
    if (router.canGoBack()) router.back();
    else router.replace("/day");
  };

  return (
    <>
      <BuilderShell
        eyebrow={t("build.program.eyebrow")}
        step={phase === "days" ? t("build.stepOf", { n: step + 1, total: days.length }) : ""}
        onBack={back}
        backLabel={t("common.back")}
      >
        {phase === "shape" ? (
          <>
            <ShapePhase name={name} onName={setName} dayN={dayN} onDayN={setDayN} />
            <Button label={t("build.program.shape.cta", { day: letter(0) })} onPress={start} />
          </>
        ) : day ? (
          <>
            <DayCard
              day={day}
              onName={(n) => patch((d) => ({ ...d, n }))}
              onRemove={(i) => patch((d) => ({ ...d, ex: d.ex.filter((_, j) => j !== i) }))}
              onAdd={() => setPick(true)}
              onKcal={(kcal) => patch((d) => ({ ...d, kcal, kcalEst: false }))}
              kcalBusy={kcalBusy}
              onEstimateKcal={() => void estimateKcal()}
            />
            <Button
              label={step === days.length - 1 ? t("build.program.day.finish") : t("build.program.day.next")}
              onPress={step === days.length - 1 ? finish : () => setStep(step + 1)}
            />
          </>
        ) : null}
      </BuilderShell>
      {/* Kept mounted so the sheet can play its close slide (SheetOverlay contract). */}
      <PickExerciseSheet visible={pick} dayName={day?.n ?? ""} onAdd={addExercise} onClose={() => setPick(false)} />
    </>
  );
}
