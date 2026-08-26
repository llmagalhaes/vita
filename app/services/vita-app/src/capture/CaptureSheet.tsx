import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import type { MealDetail, MealItem, NewEntry, WaterDetail, WorkoutDetail } from "../api";
import {
  Button,
  Card,
  Chip,
  EstimateTag,
  KeyboardLift,
  MorphBlob,
  PressScale,
  SheetBackdrop,
  Text,
  colors,
  fonts,
  letterSpacing,
  motion,
  shadowCta,
  shadowRow,
  spacing,
  useAccent,
  useSheetTransition,
  useSheetPresence,
} from "../ui";
import { useCapture } from "./CaptureContext";
import type { PlanDelta } from "./delta";
import { mealTotals, stepItem } from "./quantity";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Prototype vtPop — the parsed result card pops in when parsing resolves. */
const resultPop = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(350);

function MacroBox({ label, grams }: { label: string; grams?: number | null }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 14,
        paddingVertical: 9,
        alignItems: "center",
      }}
    >
      <Text variant="label" style={{ fontSize: 15 }}>
        {grams == null ? "—" : `${Math.round(grams)} g`}
      </Text>
      <Text
        style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" }}
        color={colors.muted}
      >
        {label}
      </Text>
    </View>
  );
}

/** +/- quantity control for a photo-parsed meal item. */
function Stepper({
  quantity,
  unit,
  kcal,
  onStep,
}: {
  quantity: number;
  unit?: string;
  kcal: number;
  onStep: (delta: number) => void;
}) {
  const { t } = useTranslation();
  const btn = (delta: number, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onStep(delta)}
      hitSlop={8}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: "#F0EDE2",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 17, lineHeight: 20 }} color="#6E6355">
        {delta > 0 ? "+" : "–"}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text variant="caption" style={{ fontSize: 12.5, minWidth: 44, textAlign: "right" }} color={colors.muted}>
        {Math.round(kcal)} {t("common.kcal")}
      </Text>
      {btn(-1, t("capture.photo.decrease"))}
      <Text style={{ fontFamily: fonts.bold, fontSize: 14, minWidth: 46, textAlign: "center" }}>
        {quantity}
        {unit ? ` ${unit}` : ""}
      </Text>
      {btn(1, t("capture.photo.increase"))}
    </View>
  );
}

export function DraftCard({ draft, onStep }: { draft: NewEntry; onStep?: (itemIndex: number, delta: number) => void }) {
  const { t } = useTranslation();

  const headline = (() => {
    if (draft.type === "water") {
      const d = draft.detail as WaterDetail;
      return { title: t("capture.card.water"), big: `${d.amountMl}`, unit: t("common.ml") };
    }
    if (draft.type === "workout") {
      const d = draft.detail as WorkoutDetail;
      return { title: d.title, big: `${d.kcal ?? 0}`, unit: t("common.kcal") };
    }
    const d = draft.detail as MealDetail;
    return { title: d.title ?? t("capture.card.meal"), big: `${Math.round(d.totals?.kcal ?? 0)}`, unit: t("common.kcal") };
  })();

  const meal = draft.type === "meal" ? (draft.detail as MealDetail) : null;
  const workout = draft.type === "workout" ? (draft.detail as WorkoutDetail) : null;
  const micros = meal?.items.flatMap((i) => i.micros ?? []).slice(0, 4) ?? [];

  return (
    <Card style={{ gap: spacing.md + 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
        <View style={{ flexShrink: 1 }}>
          <Text variant="title" style={{ fontSize: 18 }}>
            {headline.title}
          </Text>
          <Text variant="caption" color={colors.muted}>
            {timeOf(draft.occurredAt)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <Text style={{ fontFamily: fonts.light, fontSize: 26, letterSpacing: -0.5 }}>
            {headline.big}{" "}
            <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 13 }} color={colors.muted}>
              {headline.unit}
            </Text>
          </Text>
          {draft.isEstimate && <EstimateTag label={t("common.estimate")} />}
        </View>
      </View>

      {meal?.totals && (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MacroBox label={t("common.protein")} grams={meal.totals.proteinG} />
          <MacroBox label={t("common.carbs")} grams={meal.totals.carbsG} />
          <MacroBox label={t("common.fat")} grams={meal.totals.fatG} />
        </View>
      )}

      {meal && onStep && (
        <View style={{ gap: spacing.sm }}>
          {meal.items.map((item, i) => (
            <View
              key={`${item.name}-${i}`}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              <Text variant="label" style={{ fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
                {item.name}
              </Text>
              <Stepper
                quantity={item.quantity ?? 1}
                unit={item.unit}
                kcal={item.kcal}
                onStep={(delta) => onStep(i, delta)}
              />
            </View>
          ))}
        </View>
      )}

      {micros.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {micros.map((m) => (
            <View
              key={m.name}
              style={{ backgroundColor: "#F0EDE2", borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}
            >
              <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 11.5 }} color="#6E6355">
                {m.name} {m.amount} {m.unit}
              </Text>
            </View>
          ))}
        </View>
      )}

      {workout && (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {workout.durationMin != null && (
              <View style={{ backgroundColor: "#F0EDE2", borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
                <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 11.5 }} color="#6E6355">
                  {workout.durationMin} {t("common.min")}
                </Text>
              </View>
            )}
            {(workout.muscles ?? []).map((m) => (
              <Chip key={m} label={t(`muscle.contract.${m}`)} />
            ))}
          </View>
          {(workout.exercises ?? []).length > 0 && (
            <View style={{ gap: 4 }}>
              {workout.exercises!.map((ex, i) => (
                <View key={`${ex.name}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 12.5, flex: 1 }} color="#6E6355">
                    {ex.name}
                  </Text>
                  {ex.sets != null && ex.reps != null && (
                    <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
                      {ex.sets} × {ex.reps}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/** Uppercase micro-label above a card (`11/800 ls 1.2`, prototype lines 1000/1012). */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: letterSpacing.micro, textTransform: "uppercase" }}
      color={colors.faint}
    >
      {children}
    </Text>
  );
}

/** The `adjusted` / `done` / `skipped` pill next to the meal name. */
function StateTag({ state }: { state: PlanDelta["state"] }) {
  const { t } = useTranslation();
  const tone =
    state === "done"
      ? { bg: colors.green.bg, ink: colors.green.ink }
      : state === "adjusted"
        ? { bg: colors.amber.bg, ink: colors.amber.ink }
        : { bg: colors.sandChip, ink: colors.inkMuted };
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 6 }}>
      <Text
        style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.7, textTransform: "uppercase" }}
        color={tone.ink}
      >
        {t(`capture.delta.state.${state}`)}
      </Text>
    </View>
  );
}

const itemLabel = (i: MealItem) => `${i.name}${i.quantity != null ? ` · ${i.quantity}${i.unit ? ` ${i.unit}` : ""}` : ""}`;

/** `~~old~~ → new` + the signed kcal badge (green when fewer, amber when more). */
function DeltaRow({ line }: { line: { from?: MealItem; to?: MealItem } }) {
  const diff = Math.round((line.to?.kcal ?? 0) - (line.from?.kcal ?? 0));
  const tone = diff < 0 ? colors.green : diff > 0 ? colors.amber : { bg: colors.sandChip, ink: colors.inkMuted };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {line.from && (
        <Text
          style={{ fontFamily: fonts.semiBold, fontSize: 13, textDecorationLine: "line-through", flexShrink: 1 }}
          color={colors.faint}
          numberOfLines={1}
        >
          {itemLabel(line.from)}
        </Text>
      )}
      {line.from && line.to && (
        <Text style={{ fontSize: 13 }} color={colors.faint}>
          →
        </Text>
      )}
      {line.to && (
        <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, flexShrink: 1 }} color={colors.inkMuted} numberOfLines={1}>
          {itemLabel(line.to)}
        </Text>
      )}
      <View
        style={{ marginLeft: "auto", backgroundColor: tone.bg, borderRadius: 9, paddingVertical: 3, paddingHorizontal: 7 }}
      >
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 11 }} color={tone.ink}>
          {diff > 0 ? "+" : diff < 0 ? "−" : "±"}
          {Math.abs(diff)} kcal
        </Text>
      </View>
    </View>
  );
}

/**
 * The plan-delta card (prototype `capParsedOn`, lines 998–1010). The parse gave the
 * meal's full resulting composition; `delta.lines` are only what actually changed,
 * and the closing line says the rest is unchanged — an estimate, labelled as one.
 */
export function PlanDeltaCard({ delta }: { delta: PlanDelta }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel>{t("capture.delta.matched")}</SectionLabel>
      <View
        style={[
          {
            backgroundColor: colors.card,
            borderRadius: 20,
            paddingVertical: 15,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: colors.borderFaint,
            gap: 9,
          },
          shadowRow,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15.5 }} color={colors.inkHeading}>
            {delta.title}
          </Text>
          <StateTag state={delta.state} />
          <Text style={{ marginLeft: "auto", fontFamily: fonts.bold, fontSize: 12 }} color={colors.muted}>
            ~{Math.round(delta.totals.kcal)} {t("common.kcal")}
          </Text>
        </View>
        {delta.lines.map((line, i) => (
          <DeltaRow key={`${line.from?.name ?? ""}-${line.to?.name ?? ""}-${i}`} line={line} />
        ))}
        <Text style={{ fontSize: 11 }} color={colors.faint}>
          {t("capture.delta.rest")}
        </Text>
      </View>
    </View>
  );
}

/**
 * The photo path is a CONFIRMATION, never a delta (README §3): Vita says which plan
 * meal it thinks the plate is, and the user confirms. `done`, not `adjusted`.
 */
function PhotoConfirmCard({ delta }: { delta: PlanDelta }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel>{t("capture.photo.fromPhoto")}</SectionLabel>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderWidth: 1,
          borderColor: colors.borderFaint,
        }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color={colors.inkHeading}>
          {t("capture.photo.looksLike", { meal: delta.title })}
        </Text>
        <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
          {t("capture.photo.confirmSub", { kcal: Math.round(delta.totals.kcal) })}
        </Text>
      </View>
    </View>
  );
}

/** Discard | Record it — prototype h46 r23, ghost ink `#6E6355`, accent CTA shadow. */
function DeltaActions({ confirmLabel, onDiscard, onConfirm }: { confirmLabel: string; onDiscard: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
      <PressScale
        accessibilityRole="button"
        scale={0.98}
        onPress={onDiscard}
        style={{
          flex: 1,
          height: 46,
          borderRadius: 23,
          borderWidth: 1.5,
          borderColor: colors.borderControlStrong,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkMuted}>
          {t("common.discard")}
        </Text>
      </PressScale>
      <PressScale
        accessibilityRole="button"
        scale={0.98}
        onPress={onConfirm}
        style={[
          {
            flex: 1.3,
            height: 46,
            borderRadius: 23,
            backgroundColor: accent,
            alignItems: "center",
            justifyContent: "center",
          },
          shadowCta(accent),
        ]}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color="#FFF9F1">
          {confirmLabel}
        </Text>
      </PressScale>
    </View>
  );
}

/** `Tell Vita what happened` — the prototype's text capture lives in the sheet. */
function TextCapture({ prefill, onSend }: { prefill: string; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [text, setText] = useState(prefill);
  useEffect(() => setText(prefill), [prefill]);
  const send = () => {
    if (text.trim()) onSend(text);
  };
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 15.5 }} color={colors.inkHeading}>
        {t("capture.textTitle")}
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        returnKeyType="send"
        autoFocus
        placeholder={t("capture.placeholder")}
        placeholderTextColor={colors.faint}
        accessibilityLabel={t("capture.placeholder")}
        style={{
          borderWidth: 1,
          borderColor: colors.borderControlStrong,
          backgroundColor: colors.card,
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 16,
          fontFamily: fonts.semiBold,
          fontSize: 14.5,
          color: colors.ink,
        }}
      />
      <PressScale
        accessibilityRole="button"
        scale={0.98}
        onPress={send}
        style={[
          { height: 48, borderRadius: 24, backgroundColor: accent, alignItems: "center", justifyContent: "center" },
          shadowCta(accent),
        ]}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color="#FFF9F1">
          {t("capture.matchIt")}
        </Text>
      </PressScale>
    </View>
  );
}

export function CaptureSheet() {
  const { t } = useTranslation();
  const capture = useCapture();

  // One shared driver springs the sheet in, follows the drag, and slides it back
  // down + fades the backdrop on a programmatic close (confirm/cancel) instead of
  // snapping shut (APP-042). Hooks stay above the early return (Rules of Hooks).
  const live = capture.status !== "idle";
  const { rendered, sheetStyle, backdropStyle, dragGesture, onSheetLayout } = useSheetTransition(live, capture.close);
  useSheetPresence(live); // hide the tab bar under the sheet (CEO #1)

  // ponytail: cache the last live state so the confirmed card slides out WITH its
  // content, instead of an empty sheet (capture.status is already idle mid-exit).
  const lastLive = useRef(capture);
  if (live) lastLive.current = capture;

  if (!rendered) return null;

  const view = live ? capture : lastLive.current; // reads during exit come from the snapshot
  const multiple = view.drafts.length > 1;

  // Photo-parsed meals get quantity steppers; each step re-scales item + totals.
  const current = view.drafts[view.index];
  const stepHandler =
    current?.type === "meal" && current.inputMethod === "photo"
      ? (itemIndex: number, delta: number) => {
          const d = capture.drafts[capture.index]!;
          const detail = d.detail as MealDetail;
          const items = detail.items.map((it, i) => (i === itemIndex ? stepItem(it, delta) : it));
          capture.updateDraft({ ...d, detail: { ...detail, items, totals: mealTotals(items) } });
        }
      : undefined;

  return (
    <View style={{ position: "absolute", inset: 0, justifyContent: "flex-end" }}>
      <SheetBackdrop onClose={capture.close} closeLabel={t("common.cancel")} scrim="capture" style={backdropStyle} inline />
      {/* Only the text state opens a keyboard; the lift is off for every other state. */}
      <KeyboardLift enabled={view.status === "text"}>
      <GestureDetector gesture={dragGesture}>
      <Animated.View
        onLayout={onSheetLayout}
        style={[
          {
            backgroundColor: colors.sheet,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            margin: 6,
            borderRadius: 30,
            padding: spacing.xl - 4,
            paddingBottom: spacing.xl,
            gap: spacing.md + 2,
            minHeight: 270,
          },
          sheetStyle,
        ]}
      >
        <View
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: "rgba(120,100,75,0.18)",
            alignSelf: "center",
          }}
        />

        {view.status === "parsing" && (
          <View style={{ alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xl }}>
            <MorphBlob />
            <Text variant="label" color={colors.muted}>
              {t("capture.makingSense")}
            </Text>
            <Text
              variant="caption"
              style={{ fontStyle: "italic", textAlign: "center", maxWidth: 280, lineHeight: 18 }}
              color={colors.labelMuted}
            >
              “{view.phrase}”
            </Text>
          </View>
        )}

        {view.status === "text" && <TextCapture prefill={view.prefill} onSend={capture.submit} />}

        {/* Plan-matched: the delta card (voice/text) or the photo confirmation. */}
        {view.status === "review" && view.delta && (
          <Animated.View key={`delta-${view.index}`} entering={resultPop} style={{ gap: spacing.md }}>
            {current?.inputMethod === "photo" ? (
              <PhotoConfirmCard delta={view.delta} />
            ) : (
              <PlanDeltaCard delta={view.delta} />
            )}
            <DeltaActions
              confirmLabel={t(current?.inputMethod === "photo" ? "capture.photo.recordIt" : "capture.delta.recordIt")}
              onDiscard={capture.discard}
              onConfirm={capture.confirm}
            />
          </Animated.View>
        )}

        {/* No match in the plan → the v3 loose card; an off-plan meal is still recordable. */}
        {view.status === "review" && !view.delta && view.drafts[view.index] && (
          <View style={{ gap: spacing.md }}>
            {view.phrase.length > 0 && (
              <Text
                variant="caption"
                style={{ fontStyle: "italic", textAlign: "center", paddingHorizontal: spacing.xl }}
                color={colors.labelMuted}
              >
                “{view.phrase}”
              </Text>
            )}
            {multiple && (
              <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>
                {t("capture.draftCount", { current: view.index + 1, total: view.drafts.length })}
              </Text>
            )}
            <Animated.View key={`${view.index}-${view.drafts.length}`} entering={resultPop}>
              <DraftCard draft={view.drafts[view.index]!} onStep={stepHandler} />
            </Animated.View>
            <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
              <View style={{ flex: 1 }}>
                <Button label={t("common.adjust")} variant="ghost" onPress={capture.adjust} />
              </View>
              <View style={{ flex: 1.3 }}>
                <Button label={t("common.confirm")} onPress={capture.confirm} />
              </View>
            </View>
            {multiple && (
              <Pressable accessibilityRole="button" onPress={capture.discard} style={{ alignSelf: "center" }}>
                <Text variant="caption" color={colors.labelMuted} style={{ textDecorationLine: "underline" }}>
                  {t("common.discard")}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {view.status === "error" && (
          <View style={{ alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xl }}>
            <Text variant="body" style={{ textAlign: "center", maxWidth: 280 }} color={colors.muted}>
              {t(view.errorKey)}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
              <Button label={t("common.cancel")} variant="ghost" onPress={capture.close} />
              {view.canRetry ? (
                <Button label={t("common.tryAgain")} onPress={() => capture.submit(view.phrase)} />
              ) : (
                <Button label={t("capture.photo.typeInstead")} onPress={() => capture.requestTextEntry()} />
              )}
            </View>
          </View>
        )}
      </Animated.View>
      </GestureDetector>
      </KeyboardLift>
    </View>
  );
}

