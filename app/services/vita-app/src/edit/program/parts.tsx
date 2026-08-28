/**
 * APP-140 — the training editor's view (handoff v4.3 §3.1, §3.3, §3.4).
 * View only: every piece of state lives in the route.
 *
 * Nothing here judges what the session is made of. The map shows what it touches;
 * the reading is the person's.
 */
import { ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BodyMap } from "../../muscle/BodyMap";
import { MUSCLE_KEYS, type MuscleKey } from "../../muscle/muscleData";
import { coverage, dominant, mfill } from "../../workout/exerciseCatalog";
import { FamilyBadge } from "../../build/train/parts";
import { useFieldVisible } from "../../build/parts";
import { Chevron, PressScale, Text, colors, fonts, radii, shadowCard, useAccent } from "../../ui";
import type { EpExercise } from "./draft";

/**
 * Handoff §6 "soft destructive ink" — deliberately NOT `colors.danger` (#B0563F,
 * "Delete my data"): dropping a row from a draft nobody has saved yet does not carry
 * that weight. Local rather than a token, so this ticket touches no shared file.
 */
const REMOVE_INK = "#A05F4A";
const REMOVE_BORDER = "rgba(150,90,70,0.18)";
/** Handoff §6 "inert block" — the resting half of the footer. */
const INERT_BG = "#F0E9DB";

/** Uppercase field label — 10/800, the same eyebrow the builders wear, one size down. */
function FieldLabel({ text }: { text: string }) {
  return (
    <Text
      variant="caption"
      style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase" }}
      color={colors.labelMuted}
    >
      {text}
    </Text>
  );
}

// ── session tabs (§3.1) ──────────────────────────────────────────────────────

/**
 * One tab per session. Up to three they share the row; from four the row scrolls
 * horizontally instead of squeezing names to nothing.
 *
 * ponytail: no snap offsets — tab widths follow the session names, so there is no
 * interval to snap to. Add `snapToOffsets` from an onLayout pass only if the free
 * scroll ever reads as sloppy on a device.
 */
export function SessionTabs({ names, index, onPick }: { names: string[]; index: number; onPick: (i: number) => void }) {
  const scrolls = names.length >= 4;
  const tabs = names.map((n, i) => {
    const active = i === index;
    return (
      <PressScale
        key={`${n}-${i}`}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={n}
        onPress={() => onPick(i)}
        style={{
          flex: scrolls ? undefined : 1,
          height: 44,
          borderRadius: radii.innerBlockTight,
          paddingHorizontal: scrolls ? 16 : 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.dark.bg : colors.card,
          borderWidth: 1,
          borderColor: active ? colors.dark.bg : colors.borderControl,
        }}
      >
        <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 13 }} color={active ? colors.dark.ink : colors.inkMuted}>
          {n}
        </Text>
      </PressScale>
    );
  });
  if (!scrolls) return <View style={{ flexDirection: "row", gap: 7 }}>{tabs}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 7 }}>
      {tabs}
    </ScrollView>
  );
}

// ── the live muscle map (§3.3) ───────────────────────────────────────────────

/**
 * What the OPEN session touches. Same two bands as the builder's map (`mfill`):
 * by-set work paints the full tone, a whole-body activity paints pale, and nothing
 * adds up — the question is "was this worked?", never "how much".
 *
 * The fills are a function of the exercises' names and weights alone, so typing in
 * sets/reps/minutes cannot move a colour (§3.4): volume does not change what a
 * session touches, and a body that flickered per keystroke would read as effort.
 */
export function SessionMap({ ex }: { ex: EpExercise[] }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const cov = coverage(ex);
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
        backgroundColor: colors.card,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.borderFaint,
        ...shadowCard,
      }}
    >
      {/* labels={false}: at 122px the FRONT/BACK captions land at ~5px (v4.2 decision). */}
      <View style={{ width: 122 }}>
        <BodyMap intensities={{}} maxWidth={122} labels={false} fill={(k) => mfill(k, cov, accent)} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text
          variant="caption"
          style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}
          color={colors.labelMuted}
        >
          {t("edit.program.map.eyebrow")}
        </Text>
        {covered.length === 0 ? (
          <Text variant="caption" style={{ fontSize: 11.5, lineHeight: 16 }} color={colors.labelMuted}>
            {t("edit.program.map.empty")}
          </Text>
        ) : (
          <>
            {/* MGN order, not intensity order — sorting by weight would make the
                chips dance every time an exercise is added or dropped. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
              {covered.map((k) => {
                const strong = (cov.covS[k] ?? 0) > 0;
                return (
                  <View
                    key={k}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      backgroundColor: colors.input,
                      borderRadius: 11,
                      paddingVertical: 4,
                      paddingLeft: 6,
                      paddingRight: 8,
                    }}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mfill(k, cov, accent) }} />
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={strong ? colors.inkMuted : "#A79C8D"}>
                      {t(`muscle.name.${k}` as const)}
                    </Text>
                  </View>
                );
              })}
            </View>
            {anySoft ? (
              <Text variant="caption" style={{ fontSize: 10.5, lineHeight: 15 }} color={colors.labelMuted}>
                {t("edit.program.map.soft")}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

// ── the exercise accordion (§3.4) ────────────────────────────────────────────

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  const field = useFieldVisible();
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <FieldLabel text={label} />
      <TextInput
        ref={field.ref}
        onFocus={field.onFocus}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        accessibilityLabel={label}
        style={{
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.borderControlStrong,
          borderRadius: 14,
          paddingVertical: 11,
          paddingHorizontal: 13,
          fontFamily: fonts.extraBold,
          fontSize: 15,
          color: colors.inkHeading,
        }}
      />
    </View>
  );
}

/**
 * One exercise: a whole-width tap target that expands in place. The muscles ride
 * the CLOSED row (not just the map) because they are what explains why the body
 * changed colour when a row was dropped.
 */
export function ExerciseRow({
  e,
  open,
  onToggle,
  onField,
  onRemove,
}: {
  e: EpExercise;
  open: boolean;
  onToggle: () => void;
  onField: (patch: Partial<EpExercise>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const dom = dominant(e.mus, 3) as MuscleKey[];
  const measure =
    e.fam === "set" ? t("build.program.day.sets", { sets: e.sets, reps: e.reps }) : t("build.program.day.minutes", { min: e.min });
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.borderFaint }}>
      <PressScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={e.n}
        onPress={onToggle}
        scale={0.99}
        style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11 }}
      >
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
        <Chevron open={open} flip size={10} />
      </PressScale>
      {open ? (
        <View style={{ gap: 10, paddingTop: 2, paddingBottom: 14 }}>
          {e.fam === "set" ? (
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <NumberField label={t("edit.program.sets")} value={e.sets} onChange={(sets) => onField({ sets })} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 15, paddingBottom: 12 }} color={colors.disabled}>
                ×
              </Text>
              <NumberField label={t("edit.program.reps")} value={e.reps} onChange={(reps) => onField({ reps })} />
            </View>
          ) : (
            <NumberField label={t("edit.program.minutes")} value={e.min} onChange={(min) => onField({ min })} />
          )}
          {/* No confirm: this is a draft, and Back throws the whole thing away. */}
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t("edit.program.remove")}
            onPress={onRemove}
            style={{
              alignSelf: "flex-start",
              height: 38,
              borderRadius: 19,
              paddingHorizontal: 16,
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: REMOVE_BORDER,
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={REMOVE_INK}>
              {t("edit.program.remove")}
            </Text>
          </PressScale>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The inert half of the footer (§2.7, shared with the plan editor's shape): a
 * STATE, not a disabled button — same height, same radius, no handler, so the
 * layout cannot jump on the first keystroke.
 */
export function NothingChanged({ label }: { label: string }) {
  return (
    <View style={{ height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: INERT_BG }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color={colors.faint}>
        {label}
      </Text>
    </View>
  );
}
