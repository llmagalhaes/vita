import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, SlideInDown } from "react-native-reanimated";
import type { MealDetail, NewEntry, WaterDetail, WorkoutDetail } from "../api";
import { Button, Card, Chip, EstimateTag, Text, colors, fonts, motion, spacing, useSheetDrag } from "../ui";
import { useCapture } from "./CaptureContext";
import { mealTotals, stepItem } from "./quantity";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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
      return { title: t("home.waterEntry"), big: `${d.amountMl}`, unit: t("common.ml") };
    }
    if (draft.type === "workout") {
      const d = draft.detail as WorkoutDetail;
      return { title: d.title, big: `${d.kcal ?? 0}`, unit: t("common.kcal") };
    }
    const d = draft.detail as MealDetail;
    return { title: d.title ?? t("home.meal"), big: `${Math.round(d.totals?.kcal ?? 0)}`, unit: t("common.kcal") };
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
          <MacroBox label={t("home.protein")} grams={meal.totals.proteinG} />
          <MacroBox label={t("home.carbs")} grams={meal.totals.carbsG} />
          <MacroBox label={t("home.fat")} grams={meal.totals.fatG} />
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
              <Chip key={m} label={t(`muscles.${m}`)} />
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

export function CaptureSheet() {
  const { t } = useTranslation();
  const capture = useCapture();

  // Drag-down-to-dismiss (hook keeps the decision on the UI thread). Hooks stay
  // above the idle early-return (Rules of Hooks).
  const { dragGesture, sheetStyle } = useSheetDrag(capture.close);

  if (capture.status === "idle") return null;

  const multiple = capture.drafts.length > 1;

  // Photo-parsed meals get quantity steppers; each step re-scales item + totals.
  const current = capture.drafts[capture.index];
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
      <Animated.View entering={FadeIn.duration(motion.fade.durationMs)} style={{ position: "absolute", inset: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={capture.close}
          style={{ flex: 1, backgroundColor: "rgba(60,50,38,0.32)" }}
        />
      </Animated.View>
      <GestureDetector gesture={dragGesture}>
      <Animated.View
        entering={SlideInDown.duration(motion.pop.durationMs).easing(Easing.bezier(...motion.pop.bezier).factory())}
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

        {capture.status === "parsing" && (
          <View style={{ alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xl }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 24,
                borderTopLeftRadius: 36,
                borderBottomRightRadius: 36,
                backgroundColor: colors.accent,
                opacity: 0.85,
              }}
            />
            <Text variant="label" color={colors.muted}>
              {t("capture.makingSense")}
            </Text>
            <Text
              variant="caption"
              style={{ fontStyle: "italic", textAlign: "center", maxWidth: 280, lineHeight: 18 }}
              color={colors.labelMuted}
            >
              “{capture.phrase}”
            </Text>
          </View>
        )}

        {capture.status === "review" && capture.drafts[capture.index] && (
          <View style={{ gap: spacing.md }}>
            {capture.phrase.length > 0 && (
              <Text
                variant="caption"
                style={{ fontStyle: "italic", textAlign: "center", paddingHorizontal: spacing.xl }}
                color={colors.labelMuted}
              >
                “{capture.phrase}”
              </Text>
            )}
            {multiple && (
              <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>
                {t("capture.draftCount", { current: capture.index + 1, total: capture.drafts.length })}
              </Text>
            )}
            <DraftCard draft={capture.drafts[capture.index]!} onStep={stepHandler} />
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

        {capture.status === "error" && (
          <View style={{ alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xl }}>
            <Text variant="body" style={{ textAlign: "center", maxWidth: 280 }} color={colors.muted}>
              {t(capture.errorKey)}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
              <Button label={t("common.cancel")} variant="ghost" onPress={capture.close} />
              {capture.canRetry ? (
                <Button label={t("common.tryAgain")} onPress={() => capture.submit(capture.phrase)} />
              ) : (
                <Button label={t("capture.photo.typeInstead")} onPress={capture.requestTextEntry} />
              )}
            </View>
          </View>
        )}
      </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Small dark toast above the pill ("Added to your log"). */
export function CaptureToast() {
  const capture = useCapture();
  if (!capture.toast) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 122, alignItems: "center" }}
    >
      <Animated.View
        entering={FadeIn.duration(motion.fade.durationMs)}
        style={{ backgroundColor: "#453E35", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 18 }}
      >
        <Text variant="label" style={{ fontFamily: fonts.semiBold, fontSize: 13 }} color="#F7F0E4">
          {capture.toast}
        </Text>
      </Animated.View>
    </View>
  );
}
