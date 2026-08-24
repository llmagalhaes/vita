/**
 * APP-121 — phase `meals`, one card per meal (handoff v4.2 §2.3).
 *
 * There is deliberately NO kcal field on this screen: asking for a calorie per
 * item while building is the friction that loses people at the third meal, and it
 * is exactly the number they do not know. The whole pass happens once, at review.
 */
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { selectionTick } from "../../lib/haptics";
import { Button, PressScale, Text, colors, fonts, shadowWaterCard } from "../../ui";
import { numOf, useFieldVisible } from "../parts";
import { UNITS, type BuildItem, type BuildMeal } from "./draft";

const dashedField = {
  borderBottomWidth: 1,
  borderBottomColor: colors.dashedBorder,
  borderStyle: "dashed" as const,
  paddingVertical: 4,
};

const boxedField = {
  backgroundColor: colors.input,
  borderWidth: 1,
  borderColor: colors.borderControlStrong,
  borderRadius: 16,
  paddingVertical: 11,
  paddingHorizontal: 13,
  fontFamily: fonts.semiBold,
  fontSize: 14,
  color: colors.ink,
};

function UnitChips({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: 6, flex: 1 }}>
      {UNITS.map((u) => {
        const on = u === value;
        return (
          <PressScale
            key={u}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(`build.plan.meals.unit.${u}`)}
            onPress={() => onChange(u)}
            style={{
              flex: 1,
              height: 40,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? colors.dark.bg : colors.card,
              borderWidth: on ? 0 : 1.5,
              borderColor: colors.borderControlStrong,
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? colors.dark.ink : colors.inkMuted}>
              {t(`build.plan.meals.unit.${u}`)}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

export function MealsPhase({
  meal,
  last,
  formOpen,
  onForm,
  onMeal,
  onAdd,
  onRemove,
  onNext,
}: {
  meal: BuildMeal;
  last: boolean;
  formOpen: boolean;
  onForm: (open: boolean) => void;
  onMeal: (patch: Partial<BuildMeal>) => void;
  onAdd: (item: BuildItem) => void;
  onRemove: (index: number) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<string>("g");
  // APP-132: every field here can end up under the keyboard — the card grows with
  // the meal, and the form sits at its bottom.
  const mealName = useFieldVisible();
  const mealTime = useFieldVisible();
  const foodName = useFieldVisible();
  const foodQty = useFieldVisible();

  const add = () => {
    if (!name.trim()) return;
    onAdd({ n: name.trim(), q: numOf(qty) || 0, u: unit, k: null, est: false });
    // Stack and clear, form stays open — the next food is the likeliest next act.
    setName("");
    setQty("");
    selectionTick();
  };

  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 26,
          padding: 18,
          gap: 12,
          borderWidth: 1,
          borderColor: colors.borderFaint,
          ...shadowWaterCard,
        }}
      >
        {/* name + time, no boxes — the card IS the field */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
          <TextInput
            testID="meal-name"
            ref={mealName.ref}
            onFocus={mealName.onFocus}
            returnKeyType="done"
            value={meal.n}
            onChangeText={(v) => onMeal({ n: v })}
            style={{ flex: 1, fontFamily: fonts.bold, fontSize: 20, color: colors.inkHeading, ...dashedField }}
          />
          <TextInput
            testID="meal-time"
            ref={mealTime.ref}
            onFocus={mealTime.onFocus}
            value={meal.t}
            onChangeText={(v) => onMeal({ t: v })}
            style={{ width: 66, textAlign: "right", fontFamily: fonts.bold, fontSize: 13, color: colors.muted, ...dashedField }}
          />
        </View>

        {meal.items.length === 0 ? (
          <Text style={{ fontSize: 12.5, lineHeight: 18 }} color={colors.muted}>
            {t("build.plan.meals.empty")}
          </Text>
        ) : (
          <View>
            {meal.items.map((it, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 9 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.peachSoft }} />
                <Text style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: 14 }} color={colors.ink}>
                  {it.n}
                </Text>
                {it.q > 0 ? (
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.muted}>
                    {t("build.plan.meals.portion", { q: it.q, u: it.u })}
                  </Text>
                ) : null}
                <Text
                  accessibilityRole="button"
                  accessibilityLabel={t("build.plan.meals.removeFood", { name: it.n })}
                  onPress={() => onRemove(i)}
                  style={{ width: 24, textAlign: "center", fontFamily: fonts.bold, fontSize: 16 }}
                  color={colors.disabled}
                >
                  ×
                </Text>
              </View>
            ))}
          </View>
        )}

        {formOpen ? (
          <View style={{ gap: 9 }}>
            <TextInput
              ref={foodName.ref}
              onFocus={foodName.onFocus}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => foodQty.ref.current?.focus()}
              value={name}
              onChangeText={setName}
              placeholder={t("build.plan.meals.namePlaceholder")}
              placeholderTextColor={colors.labelMuted}
              style={boxedField}
            />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                ref={foodQty.ref}
                onFocus={foodQty.onFocus}
                value={qty}
                onChangeText={setQty}
                keyboardType="numeric"
                placeholder={t("build.plan.meals.qtyPlaceholder")}
                placeholderTextColor={colors.labelMuted}
                style={{ ...boxedField, width: 72, textAlign: "center" }}
              />
              <UnitChips value={unit} onChange={setUnit} />
            </View>
            <View style={{ flexDirection: "row", gap: 9 }}>
              <PressScale
                accessibilityRole="button"
                onPress={() => onForm(false)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 23,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.card,
                  borderWidth: 1.5,
                  borderColor: "rgba(120,100,75,0.18)",
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color={colors.inkMuted}>
                  {t("build.plan.meals.doneAdding")}
                </Text>
              </PressScale>
              <PressScale
                accessibilityRole="button"
                onPress={add}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 23,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.accent,
                  opacity: name.trim() ? 1 : 0.45,
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color={colors.card}>
                  {t("build.plan.meals.addFood")}
                </Text>
              </PressScale>
            </View>
          </View>
        ) : (
          <PressScale
            accessibilityRole="button"
            onPress={() => onForm(true)}
            style={{
              height: 46,
              borderRadius: 23,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: colors.dashedBorder,
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color={colors.inkMuted}>
              {t("build.plan.meals.addFoodDashed")}
            </Text>
          </PressScale>
        )}

        <Text style={{ fontSize: 11, lineHeight: 16 }} color={colors.labelMuted}>
          {t("build.plan.meals.footer")}
        </Text>
      </View>

      <Button label={last ? t("build.plan.meals.toReview") : t("build.plan.meals.next")} onPress={onNext} />
    </View>
  );
}
