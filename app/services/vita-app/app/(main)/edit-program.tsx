/**
 * APP-140 — `wpOn`, the training-program editor (handoff v4.3 §3, PLAN R6/R10/R11/R12).
 *
 * The third thing you can do with a program, after "import over it" and "build a new
 * one": change the one that is already there. The draft is born from the saved
 * document and every row keeps its source object, so saving is a spread — muscle
 * roles, whole-body flags and anything else the wire carries ride through untouched.
 *
 * Session names are NOT editable here (§3.7): the name is the primary key of every
 * history lookup (day records, Trends aggregates, the rotation). The footer says so
 * in one line, and building a program is where that changes.
 */
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { getCachedProgram, clearDaySkips, updateProgram } from "../../src/db/plan";
import { logChanged } from "../../src/db/notify";
import { PickExerciseSheet } from "../../src/workout/PickExerciseSheet";
import { BuilderShell } from "../../src/build/parts";
import type { BwExercise } from "../../src/build/train/draft";
import { fromDoc, projection, toDoc, type EpDay, type EpExercise } from "../../src/edit/program/draft";
import { ExerciseRow, NothingChanged, SessionMap, SessionTabs } from "../../src/edit/program/parts";
import { Button, PressScale, Text, colors, fonts, radii } from "../../src/ui";
import { showToast } from "../../src/ui/toast";

export default function EditProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  /** Read once. Re-reading mid-edit would swap the `src` objects under the draft. */
  const [seed] = useState(() => {
    const doc = getCachedProgram();
    return doc && doc.days.length > 0 ? { doc, days: fromDoc(doc) } : null;
  });
  const [draft, setDraft] = useState<EpDay[]>(seed?.days ?? []);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [pick, setPick] = useState(false);

  // The draft as it was opened: the dirty check's baseline AND the load the stored
  // kcal was calibrated against. Never mutated — every edit builds new objects.
  const snapshot = useMemo(() => projection(seed?.days ?? []), [seed]);
  const dirty = projection(draft) !== snapshot;

  const session = draft[tab];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/library"));

  const patch = (fn: (d: EpDay) => EpDay) => setDraft((all) => all.map((d, i) => (i === tab ? fn(d) : d)));
  const patchEx = (i: number, p: Partial<EpExercise>) =>
    patch((d) => ({ ...d, ex: d.ex.map((e, j) => (j === i ? { ...e, ...p } : e)) }));
  const removeEx = (i: number) => {
    patch((d) => ({ ...d, ex: d.ex.filter((_, j) => j !== i) }));
    setOpen(null);
  };
  /** §3.5 — the row lands at the end and opens: the sheet just asked for its numbers,
   *  and the open card confirms where they went. */
  const addEx = (e: BwExercise) => {
    setOpen(session?.ex.length ?? null);
    patch((d) => ({ ...d, ex: [...d.ex, e] }));
  };

  const saved = useRef(false);
  const save = () => {
    if (!seed || saved.current) return; // double-tap guard — one version per commit
    saved.current = true;
    // `updateProgram` writes the cache synchronously before its first await, so the
    // new program is already the truth by the time this screen unmounts; the PUT
    // finishes (or leaves the doc dirty for the next sync) on its own.
    void updateProgram(toDoc(seed.doc, draft, seed.days)).then(logChanged);
    // §3.6 `exOv:{}` — today's per-exercise check-offs are keyed by session + exercise
    // NAME, so a removed exercise's tick is inert but a re-added one would come back
    // pre-ticked. One clear, all sessions: the cheapest correct scope for state that
    // resets itself at midnight anyway.
    clearDaySkips();
    showToast(t("edit.program.saved", { count: draft.length }));
    back();
  };

  return (
    <>
      <BuilderShell eyebrow={t("edit.program.eyebrow")} step={t("edit.program.editing")} onBack={back} backLabel={t("common.back")}>
        {session ? (
          <>
            <View style={{ gap: 8, paddingTop: 8, paddingBottom: 2 }}>
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.2 }} color={colors.inkHeading}>
                {t("edit.program.title")}
              </Text>
              <Text variant="caption" style={{ fontSize: 12.5, lineHeight: 18.75 }} color={colors.muted}>
                {t("edit.program.sub")}
              </Text>
            </View>

            <SessionTabs
              names={draft.map((d) => d.n)}
              index={tab}
              onPick={(i) => {
                setTab(i);
                setOpen(null); // a session change closes whatever was expanded
              }}
            />

            <SessionMap ex={session.ex} />

            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: radii.cardLarge,
                borderWidth: 1,
                borderColor: colors.borderFaint,
                padding: 18,
                gap: 11,
              }}
            >
              <View style={{ gap: 3 }}>
                {/* Text, not an input — §3.7. */}
                <Text style={{ fontFamily: fonts.bold, fontSize: 19 }} color={colors.inkHeading}>
                  {session.n}
                </Text>
                <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.faint}>
                  {t("edit.program.sessionSub", { count: session.ex.length })}
                </Text>
              </View>

              {session.ex.length === 0 ? (
                <Text variant="caption" style={{ fontSize: 12.5, lineHeight: 18 }} color={colors.faint}>
                  {t("edit.program.emptySession")}
                </Text>
              ) : (
                session.ex.map((e, i) => (
                  <ExerciseRow
                    key={`${e.n}-${i}`}
                    e={e}
                    open={open === i}
                    onToggle={() => setOpen(open === i ? null : i)}
                    onField={(p) => patchEx(i, p)}
                    onRemove={() => removeEx(i)}
                  />
                ))
              )}

              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t("edit.program.add")}
                onPress={() => setPick(true)}
                style={{
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.5,
                  borderStyle: "dashed",
                  borderColor: colors.dashedBorder,
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.inkMuted}>
                  {t("edit.program.add")}
                </Text>
              </PressScale>
            </View>

            {dirty ? <Button label={t("edit.program.save")} onPress={save} /> : <NothingChanged label={t("edit.program.clean")} />}
            <Text variant="caption" style={{ fontSize: 10.5, lineHeight: 15 }} color={colors.faint}>
              {t("edit.program.note")}
            </Text>
          </>
        ) : null}
      </BuilderShell>
      {/* PLAN R10 — the builder's own sheet, rendered by this route with its own
          `onAdd`. It portals to PopHost, so it draws above this screen for free. */}
      <PickExerciseSheet visible={pick} dayName={session?.n ?? ""} onAdd={addEx} onClose={() => setPick(false)} />
    </>
  );
}
