/**
 * APP-124/125/127/128 — `bwOn`, the hand-built training program (handoff v4.2 §3).
 *
 *   shape (name + how many sessions)  →  days (one card per session)
 *
 * A rotation, not a weekly calendar: which day falls where in the week is the
 * Day's decision, not this screen's. Back walks the same ladder down — a day, then
 * the shape, then out.
 */
import { useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { saveProgram } from "../../src/db/plan";
import { logChanged } from "../../src/db/notify";
import { PickExerciseSheet } from "../../src/workout/PickExerciseSheet";
import { BuilderShell } from "../../src/build/parts";
import { DayCard, ShapePhase } from "../../src/build/train/parts";
import { dayLetter, resizeDays, toProgramDraft, type BwDay, type BwExercise } from "../../src/build/train/draft";
import { Button } from "../../src/ui";
import { showToast } from "../../src/ui/toast";

export default function BuildProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [phase, setPhase] = useState<"shape" | "days">("shape");
  const [name, setName] = useState("");
  const [dayN, setDayN] = useState(3);
  const [step, setStep] = useState(0);
  const [days, setDays] = useState<BwDay[]>([]);
  const [pick, setPick] = useState(false);

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
    router.back();
  };

  const patch = (fn: (d: BwDay) => BwDay) => setDays((all) => all.map((d, i) => (i === step ? fn(d) : d)));
  const addExercise = (e: BwExercise) => patch((d) => ({ ...d, ex: [...d.ex, e] }));

  const finish = () => {
    const doc = toProgramDraft(name, days, t("build.program.fallbackName"));
    void saveProgram(doc).then(() => logChanged());
    showToast(t("build.program.saved", { name: doc.summary, count: doc.days.length }));
    router.back();
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
