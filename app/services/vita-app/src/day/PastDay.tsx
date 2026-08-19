/**
 * APP-099 — a past day (prototype lines 355–429). Two shapes, and the difference
 * between them is the whole product philosophy:
 *
 *  - **recorded** → "Closed — as planned" / "Closed — with adjustments" plus the
 *    lines that were actually recorded, captioned "recorded by you — counters,
 *    not scores". A day closed later than it happened says so ("closed later,
 *    by you" — derived from `loggedAt`, PLAN R2), because a retro-close is a
 *    different claim than a live one.
 *  - **unrecorded** → a dashed, quiet card: "No record for this day · Vita
 *    assumed nothing". Never a failure, never a red anything. The retro-close CTA
 *    carries the honesty caption and is the ONLY way a past day gains a record.
 *
 * Everything is read from the day record (SQLite entries — no `/days`, R1).
 */
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { Text, colors, fonts, hit, mixOklab, radii, shadowCta, typeScale, useAccent } from "../ui";
import { showToast } from "../ui/toast";
import { deleteEntry } from "../db/entries";
import { logChanged, useLogVersion } from "../db/notify";
import { applyClose, getDayRecord, recordWorkout } from "../db/dayRecord";
import { getCachedPlan } from "../db/plan";
import { useDomains } from "../db/domains";
import { planDailyTotals } from "../plan/compute";
import { BodyMap } from "../muscle/BodyMap";
import { MuscleSheet } from "../muscle/MuscleSheet";
import { MUS, intensitiesOf, programChips, type MuscleKey, type WorkoutSession } from "../muscle/muscleData";
import { usePortal } from "../ui/popHost";
import { cardSurface, MicroLabel } from "./overview/parts";
import { retroClose } from "./close";
import { atMinutes, dayMeals, workoutEntryId, type DayRecord } from "./record";
import { setSelectedOffset } from "./selection";
import { dayCounters, dayIsRetro, dayStatus } from "./state";

/** One bullet row = fragments joined by " · ", each an i18n key + params. */
export type RowPart = { k: string; v?: Record<string, unknown> };

type Flags = { meals?: boolean; move?: boolean; water?: boolean };

/**
 * The recorded card's bullet rows — counters only, never a verdict. Pure, so the
 * "an untouched day never reads as failure" rule is unit-testable.
 */
export function pastRows(day: DayRecord, flags: Flags = {}): RowPart[][] {
  const on = (k: keyof Flags) => flags[k] !== false;
  const rows: RowPart[][] = [];
  const c = dayCounters(day);
  if (on("meals") && c.done + c.adjusted + c.skipped > 0) {
    rows.push([
      ...(c.done > 0 ? [{ k: "pastDay.rows.meals", v: { count: c.done } }] : []),
      ...(c.adjusted > 0 ? [{ k: "pastDay.rows.adjusted", v: { count: c.adjusted } }] : []),
      ...(c.skipped > 0 ? [{ k: "pastDay.rows.skipped", v: { count: c.skipped } }] : []),
    ]);
  }
  if (on("move") && day.workout) {
    const skipped = day.workout.state === "skipped";
    rows.push([{ k: skipped ? "pastDay.rows.workoutSkipped" : "pastDay.rows.workoutDone", v: { title: day.workout.title } }]);
  }
  if (on("water") && day.waterMl > 0) rows.push([{ k: "pastDay.rows.water", v: { ml: day.waterMl.toLocaleString("en-US") } }]);
  if (dayIsRetro(day)) rows.push([{ k: "pastDay.rows.closedLater" }]);
  return rows;
}

const CheckIcon = ({ color }: { color: string }) => (
  <Svg width={15} height={15} viewBox="0 0 15 15">
    <Path d="M2.8 8 l3.2 3.2 L12.2 4.4" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ClockIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 18 18">
    <Circle cx={9} cy={9} r={6.6} fill="none" stroke={color} strokeWidth={1.5} />
    <Path d="M9 5.4 v3.8 l2.6 1.7" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export function PastDay({ date }: { date: string }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const domains = useDomains();
  const version = useLogVersion();
  const [muscle, setMuscle] = useState<MuscleKey | null>(null);

  const day = useMemo(() => getDayRecord(date), [date, version]);
  const status = dayStatus(day);
  const join = (row: RowPart[]) => row.map((p) => t(p.k, p.v ?? {})).join(" · ");

  // That day's session, and its muscle sheet — portaled to the app root (this card
  // renders inside the Day panel's ScrollView). Declared before the early return so
  // the hook order never depends on whether the day has a record.
  const session: WorkoutSession | null = day.workout ? { ...day.workout } : null;
  const worked = session != null && day.workout!.state !== "skipped";
  const mu = worked ? intensitiesOf(session!) : {};
  usePortal(
    <MuscleSheet
      muscle={muscle}
      sessions={session ? [session] : []}
      range="week"
      onClose={() => setMuscle(null)}
      // `dayOffset` is days back from TODAY (muscleData.dayOffsetOf), which is exactly
      // what the dock speaks — travel there instead of only closing the sheet.
      onOpenDay={(offset) => {
        setSelectedOffset(offset);
        setMuscle(null);
      }}
    />,
  );

  // ── unrecorded: a dashed, quiet card + the retro-close CTA ──────────────────
  if (status === "unrecorded") {
    const plan = getCachedPlan();
    const planLine = plan
      ? [
          t("pastDay.empty.planMeals", { count: dayMeals(plan.meals).length }),
          t("pastDay.empty.planKcal", { kcal: Math.round(planDailyTotals(plan).kcal).toLocaleString("en-US") }),
          ...(domains.move ? [t("pastDay.empty.planTraining")] : []),
        ].join(" · ")
      : t("pastDay.empty.planUnknown");

    const close = () => {
      const res = retroClose(day, plan?.meals ?? []);
      if (res.written.length === 0) return;
      applyClose(res);
      showToast(t("pastDay.empty.retroToast"), {
        undo: () => {
          for (const rec of res.written) deleteEntry(rec.entryId);
          logChanged();
        },
      });
    };

    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        style={{
          backgroundColor: colors.card,
          borderRadius: radii.card,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: colors.dashedBorder,
          paddingVertical: 24,
          paddingHorizontal: 20,
          alignItems: "center",
          gap: 8,
        }}
      >
        <View
          style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.well, alignItems: "center", justifyContent: "center" }}
        >
          <ClockIcon color={colors.amber.fill} />
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15.5, marginTop: 2 }} color={colors.inkHeading}>
          {t("pastDay.empty.title")}
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 19, maxWidth: 250, textAlign: "center" }} color={colors.muted}>
          {t("pastDay.empty.body", { plan: planLine })}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={{
            marginTop: 6,
            backgroundColor: accent,
            borderRadius: 19,
            paddingVertical: 11,
            paddingHorizontal: 18,
            ...shadowCta(accent),
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color="#FFF9F1">
            {t("pastDay.empty.cta")}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 10.5, lineHeight: 15, maxWidth: 230, textAlign: "center" }} color={colors.faint}>
          {t("pastDay.empty.caption")}
        </Text>
      </Animated.View>
    );
  }

  // ── recorded ────────────────────────────────────────────────────────────────
  const adjusted = status === "adjusted";
  const rows = pastRows(day, domains);

  const logWorkout = (title: string) => {
    const rec = { entryId: workoutEntryId(date), title, state: "done" as const, exercises: [], at: atMinutes(date, 18 * 60) };
    recordWorkout(rec);
    showToast(t("pastDay.movement.loggedToast", { name: title }), {
      undo: () => {
        deleteEntry(rec.entryId);
        logChanged();
      },
    });
  };

  return (
    <View style={{ gap: 13 }}>
      <Animated.View entering={FadeIn.duration(300)} style={{ ...cardSurface, padding: 17, gap: 11 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: adjusted ? colors.amber.bg : colors.green.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckIcon color={adjusted ? colors.amber.ink : colors.green.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15.5 }} color={colors.inkHeading}>
              {t(adjusted ? "pastDay.closedAdjusted" : "pastDay.closedAsPlanned")}
            </Text>
            <Text style={{ fontSize: typeScale.micro, marginTop: 1 }} color={colors.faint}>
              {t("pastDay.recordedBy")}
            </Text>
          </View>
        </View>
        {rows.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, borderStyle: "dashed", paddingTop: 10, gap: 8 }}>
            {rows.map((row) => (
              <View key={row[0]!.k} style={{ flexDirection: "row", gap: 9, alignItems: "center" }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green.fill }} />
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, flex: 1 }} color={colors.inkMuted}>
                  {join(row)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      {domains.move && (
        <Animated.View entering={FadeIn.duration(350).delay(100)} style={{ ...cardSurface, padding: 15, paddingHorizontal: 17, gap: 11 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <MicroLabel>{t("pastDay.movement.label")}</MicroLabel>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.muted}>
              {worked ? day.workout!.title : session ? t("pastDay.movement.rest") : t("pastDay.movement.nothing")}
            </Text>
          </View>

          {worked ? (
            <>
              <BodyMap intensities={mu} maxWidth={225} />
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                {programChips(mu).map((c) => (
                  <Pressable
                    key={c.key}
                    accessibilityRole="button"
                    onPress={() => setMuscle(c.key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      borderRadius: 11,
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      backgroundColor: c.tier === "primary" ? mixOklab(accent, 16, colors.card) : colors.sandChip,
                    }}
                  >
                    <Text
                      style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }}
                      color={c.tier === "primary" ? accent : colors.muted}
                    >
                      {t(`muscle.name.${c.key}`)}
                    </Text>
                    <Text
                      style={{ fontFamily: fonts.semiBold, fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.65 }}
                      color={c.tier === "primary" ? accent : colors.muted}
                    >
                      {t(`muscle.tier.${c.tier}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 10.5 }} color={colors.faint}>
                {t("pastDay.movement.mapCaption")}
              </Text>
            </>
          ) : session ? (
            <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20 }} color={colors.inkMuted}>
              {t("pastDay.movement.restLine")}
            </Text>
          ) : (
            <>
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20 }} color={colors.inkMuted}>
                {t("pastDay.movement.noneLine")}
              </Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {Object.keys(MUS).map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    onPress={() => logWorkout(name)}
                    style={{
                      minHeight: hit.min,
                      justifyContent: "center",
                      paddingVertical: 9,
                      paddingHorizontal: 13,
                      borderRadius: radii.innerBlockTight,
                      borderWidth: 1.5,
                      borderColor: colors.borderControlStrong,
                      backgroundColor: colors.card,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.inkMuted}>
                      {t("pastDay.movement.log", { name })}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 10.5 }} color={colors.faint}>
                {t("pastDay.movement.logCaption")}
              </Text>
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}
