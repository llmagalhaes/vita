/**
 * APP-124/125/127 — the training builder's two phase bodies (handoff v4.2 §3.2,
 * §3.3, §3.6, §3.7). View only: every piece of state lives in the route.
 *
 * Criterion 23: there is no warning, no suggestion and no judgement about balance
 * anywhere in here. The map shows what a day touches; the person reads it.
 */
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { BodyMap } from "../../muscle/BodyMap";
import { MUSCLE_KEYS, type MuscleKey } from "../../muscle/muscleData";
import { coverage, dominant, mfill, type Family } from "../../workout/exerciseCatalog";
import { Text, PressScale, colors, fonts, mixOklab, radii, shadowCard, useAccent } from "../../ui";
import { CountChips, EstimateAction, PhaseQuestion } from "../parts";
import { dayLetter, type BwDay, type BwExercise } from "./draft";

/** 11.5/800, 1.4 letter-spacing, uppercase, faint (handoff §5 "Eyebrow"). */
export function Eyebrow({ text }: { text: string }) {
  return (
    <Text
      variant="caption"
      style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase" }}
      color={colors.labelMuted}
    >
      {text}
    </Text>
  );
}

/** Field sitting directly on the canvas (handoff §5) — card fill, hairline, radius 18. */
const fieldStyle = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.borderControlStrong,
  borderRadius: 18,
  paddingVertical: 15,
  paddingHorizontal: 17,
  fontFamily: fonts.semiBold,
  fontSize: 15,
  color: colors.ink,
} as const;

/** Card, radius 26, hairline, the §5 raise. */
const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: radii.cardLarge,
  borderWidth: 1,
  borderColor: colors.borderFaint,
  padding: 18,
  gap: 14,
  ...shadowCard,
} as const;

// ── shape phase (APP-124) ────────────────────────────────────────────────────

export function ShapePhase({
  name,
  onName,
  dayN,
  onDayN,
}: {
  name: string;
  onName: (s: string) => void;
  dayN: number;
  onDayN: (n: number) => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  return (
    <View style={{ gap: 18 }}>
      <PhaseQuestion text={t("build.program.shape.question")} sub={t("build.program.shape.sub")} />
      <TextInput
        value={name}
        onChangeText={onName}
        placeholder={t("build.program.shape.namePlaceholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("build.program.shape.namePlaceholder")}
        style={fieldStyle}
      />
      <View style={{ gap: 10 }}>
        <Eyebrow text={t("build.program.shape.howMany")} />
        {/* 1…5 with a dashed `+` that climbs to 10 — ten sessions is Day J. */}
        <CountChips values={[1, 2, 3, 4, 5]} value={dayN} onChange={onDayN} height={54} fontSize={18} plusWidth={46} />
      </View>
      <View style={cardStyle}>
        {Array.from({ length: dayN }, (_, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 9,
                backgroundColor: mixOklab(accent, 12, colors.card),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={accent}>
                {dayLetter(i)}
              </Text>
            </View>
            <Text variant="label" style={{ flex: 1, fontSize: 14 }} color={colors.inkMuted}>
              {t("build.program.dayLetter", { letter: dayLetter(i) })}
            </Text>
            <Text variant="caption" style={{ fontSize: 12 }} color={colors.disabled}>
              {t("build.program.shape.empty")}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" style={{ fontSize: 11, lineHeight: 16 }} color={colors.labelMuted}>
        {t("build.program.shape.footer")}
      </Text>
    </View>
  );
}

// ── the live muscle map (APP-127) ────────────────────────────────────────────

/**
 * What this day touches. Two sources, two bands: by-set work paints the full
 * tone, a whole-body activity paints pale — and nothing here adds up, because
 * the question is "was this worked?", not "how much" (criterion 20).
 */
export function MuscleMapCard({ exercises }: { exercises: BwExercise[] }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const cov = coverage(exercises);
  const covered = MUSCLE_KEYS.filter((k) => (cov.covS[k] ?? 0) > 0 || (cov.covD[k] ?? 0) > 0);
  const anySoft = covered.some((k) => !(cov.covS[k] ?? 0));
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingVertical: 13,
        paddingHorizontal: 15,
        backgroundColor: colors.input,
        borderRadius: radii.innerBlock,
        borderWidth: 1,
        borderColor: colors.borderControl,
      }}
    >
      {/* labels={false}: at 122px wide the FRONT/BACK captions render at ~5px (criterion 22). */}
      <View style={{ width: 122 }}>
        <BodyMap intensities={{}} maxWidth={122} labels={false} fill={(k) => mfill(k, cov, accent)} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Eyebrow text={t("build.program.map.eyebrow")} />
        {covered.length === 0 ? (
          <Text variant="caption" style={{ fontSize: 11.5, lineHeight: 16 }} color={colors.labelMuted}>
            {t("build.program.map.empty")}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {covered.map((k) => {
                const strong = (cov.covS[k] ?? 0) > 0;
                return (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mfill(k, cov, accent) }} />
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={strong ? colors.inkMuted : "#A79C8D"}>
                      {t(`muscle.name.${k}` as const)}
                    </Text>
                  </View>
                );
              })}
            </View>
            {anySoft ? (
              <Text variant="caption" style={{ fontSize: 11, lineHeight: 15 }} color={colors.labelMuted}>
                {t("build.program.map.soft")}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

// ── the day card (APP-125) ───────────────────────────────────────────────────

/** 22×22 family badge — the two 11×11 icon paths of handoff §3.3, verbatim. */
export function FamilyBadge({ fam }: { fam: Family }) {
  const accent = useAccent();
  const bg = fam === "set" ? mixOklab(accent, 12, colors.card) : colors.green.bg;
  const ink = fam === "set" ? accent : colors.green.ink;
  const d =
    fam === "set"
      ? "M1.2 5.5 h1.3 M8.5 5.5 h1.3 M3.2 3.5 v4 M6.8 3.5 v4 M3.2 5.5 h3.6"
      : "M5.5 1.6 A3.9 3.9 0 1 1 5.4 1.6 M5.5 3.4 v2.4 h1.8";
  return (
    <View style={{ width: 22, height: 22, borderRadius: 8, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Svg width={11} height={11} viewBox="0 0 11 11">
        <Path d={d} fill="none" stroke={ink} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function ExerciseRow({ e, onRemove }: { e: BwExercise; onRemove: () => void }) {
  const { t } = useTranslation();
  const dom = dominant(e.mus, 3) as MuscleKey[];
  // `4 × 8` or `30 min` — the whole measure, two families deep and no further.
  const measure = e.fam === "set" ? t("build.program.day.sets", { sets: e.sets, reps: e.reps }) : t("build.program.day.minutes", { min: e.min });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <FamilyBadge fam={e.fam} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.semiBold, fontSize: 14 }} color={colors.ink}>
          {e.n}
        </Text>
        <Text variant="caption" style={{ fontSize: 11 }} color={colors.faint}>
          {dom.length ? dom.map((k) => t(`muscle.name.${k}` as const)).join(" · ") : t("build.program.day.notMapped")}
        </Text>
      </View>
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 12 }} color={colors.muted}>
        {measure}
      </Text>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t("build.program.day.remove", { name: e.n })}
        onPress={onRemove}
        style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.disabled}>
          ×
        </Text>
      </PressScale>
    </View>
  );
}

/**
 * APP-135 / CEO Round-16 #4 — the day's `~kcal`, "estimadas tanto pelo usuário
 * quanto pela IA". One discreet line: type it, or have it worked out from what is
 * in the day. Empty stays empty — no line reaches the Day surface at all.
 *
 * A typed number is NEVER overwritten: the estimate control only exists while the
 * field is empty, so "never overwritten" is structural rather than a check.
 */
function DayKcalLine({
  day,
  onKcal,
  busy,
  onEstimate,
}: {
  day: BwDay;
  onKcal: (s: string) => void;
  busy: boolean;
  onEstimate: () => void;
}) {
  const { t } = useTranslation();
  const est = day.kcalEst === true && (day.kcal ?? "") !== "";
  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Eyebrow text={t("build.program.dayKcalLabel")} />
        <View style={{ flex: 1 }} />
        {est ? (
          <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.estimateInk}>
            ~
          </Text>
        ) : null}
        <TextInput
          value={day.kcal ?? ""}
          onChangeText={onKcal}
          keyboardType="numeric"
          placeholder={t("build.program.dayKcalPlaceholder")}
          placeholderTextColor={colors.disabled}
          accessibilityLabel={t("build.program.dayKcalLabel")}
          style={{
            minWidth: 58,
            textAlign: "right",
            paddingVertical: 3,
            fontFamily: fonts.bold,
            fontSize: 15,
            color: est ? colors.estimateInk : colors.inkHeading,
            borderBottomWidth: 1,
            borderStyle: "dashed",
            // The estimate mark IS this baseline going amber (§2.4) — the same
            // dashed line the day-name input wears, so nothing new appears.
            borderBottomColor: est ? colors.estimateDash : colors.dashedBorder,
          }}
        />
        <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.labelMuted}>
          {t("build.program.dayKcalUnit")}
        </Text>
      </View>
      {day.ex.length > 0 && (busy || (day.kcal ?? "") === "") ? (
        <EstimateAction
          busy={busy}
          label={t("build.program.dayKcalEstimate")}
          working={t("build.program.dayKcalWorking")}
          onPress={onEstimate}
        />
      ) : null}
      <Text variant="caption" style={{ fontSize: 11, lineHeight: 15 }} color={colors.labelMuted}>
        {t("build.program.dayKcalHint")}
      </Text>
    </View>
  );
}

export function DayCard({
  day,
  onName,
  onRemove,
  onAdd,
  onKcal,
  kcalBusy,
  onEstimateKcal,
}: {
  day: BwDay;
  onName: (s: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  onKcal: (s: string) => void;
  kcalBusy: boolean;
  onEstimateKcal: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={cardStyle}>
      {/* "Invisible" input (handoff §5): no box, one dashed baseline. */}
      <TextInput
        value={day.n}
        onChangeText={onName}
        accessibilityLabel={day.n}
        style={{
          fontFamily: fonts.bold,
          fontSize: 20,
          color: colors.inkHeading,
          paddingVertical: 4,
          borderBottomWidth: 1,
          borderStyle: "dashed",
          borderBottomColor: colors.dashedBorder,
        }}
      />
      <MuscleMapCard exercises={day.ex} />
      <DayKcalLine day={day} onKcal={onKcal} busy={kcalBusy} onEstimate={onEstimateKcal} />
      {day.ex.length === 0 ? (
        <Text variant="caption" style={{ fontSize: 12.5, lineHeight: 18 }} color={colors.muted}>
          {t("build.program.day.empty")}
        </Text>
      ) : (
        <View style={{ gap: 12 }}>
          {day.ex.map((e, i) => (
            <ExerciseRow key={`${e.n}-${i}`} e={e} onRemove={() => onRemove(i)} />
          ))}
        </View>
      )}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t("build.program.day.add")}
        onPress={onAdd}
        style={{
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: colors.dashedBorder,
          borderRadius: radii.innerBlockTight,
          paddingVertical: 13,
          alignItems: "center",
        }}
      >
        <Text variant="label" style={{ fontSize: 13.5 }} color={colors.inkMuted}>
          {t("build.program.day.add")}
        </Text>
      </PressScale>
    </View>
  );
}
