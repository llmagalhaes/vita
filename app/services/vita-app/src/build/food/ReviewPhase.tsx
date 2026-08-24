/**
 * APP-122 — phase `review`: the numbers, in one pass (handoff v4.2 §2.4).
 *
 * The estimate button is deliberately quiet — it is not the CTA of this screen,
 * it is one of two ways to fill a column. And every number it produces stays
 * marked as an estimate (`~`, dashed, `#A66A3F`) all the way into the saved plan.
 */
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Text, colors, estimateBase, fonts, shadowWaterCard } from "../../ui";
import { EstimateAction, useFieldVisible } from "../parts";
import { anyK, dayTotal, mealTotal, type BuildMeal } from "./draft";

/** Estimated · typed · empty — three states, three inks (handoff §2.4 table). */
function KcalCell({
  k,
  est,
  editing,
  value,
  onChange,
  onOpen,
  onSave,
  label,
  testID,
}: {
  k: number | null;
  est: boolean;
  editing: boolean;
  value: string;
  onChange: (v: string) => void;
  onOpen: () => void;
  onSave: () => void;
  label: string;
  testID: string;
}) {
  const { t } = useTranslation();
  // APP-132: the editor opens wherever the row happens to be — `autoFocus` fires
  // this and the row scrolls out from under the keyboard.
  const field = useFieldVisible();
  if (editing) {
    return (
      <TextInput
        testID="kcal-input"
        accessibilityLabel={label}
        ref={field.ref}
        onFocus={field.onFocus}
        returnKeyType="done"
        autoFocus
        value={value}
        onChangeText={onChange}
        onBlur={onSave}
        onSubmitEditing={onSave}
        keyboardType="numeric"
        style={{
          width: 62,
          textAlign: "right",
          borderWidth: 1.5,
          borderColor: colors.accent,
          borderRadius: 12,
          paddingVertical: 4,
          paddingHorizontal: 8,
          fontFamily: fonts.bold,
          fontSize: 13,
          color: colors.inkHeading,
        }}
      />
    );
  }
  const estimated = k != null && est;
  return (
    <View style={estimated ? estimateBase : null}>
      <Text
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onOpen}
        style={{ fontFamily: fonts.bold, fontSize: 13, minWidth: 44, textAlign: "right" }}
        color={k == null ? colors.disabled : estimated ? colors.estimateInk : colors.inkHeading}
      >
        {k == null ? t("build.plan.review.none") : estimated ? t("build.plan.review.estimated", { kcal: k }) : String(k)}
      </Text>
    </View>
  );
}

export function ReviewPhase({
  meals,
  busy,
  edit,
  editValue,
  onEditOpen,
  onEditChange,
  onEditSave,
  onEstimate,
  onEditMeal,
  onFinish,
}: {
  meals: BuildMeal[];
  busy: boolean;
  edit: string | null;
  editValue: string;
  onEditOpen: (key: string, current: number | null) => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEstimate: () => void;
  onEditMeal: (index: number) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const filled = anyK(meals);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: fonts.semiBold, fontSize: 27, lineHeight: 32.4, letterSpacing: -0.2 }} color={colors.inkHeading}>
          {t(filled ? "build.plan.review.titleFilled" : "build.plan.review.titleEmpty")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19 }} color={colors.muted}>
          {t(filled ? "build.plan.review.subFilled" : "build.plan.review.subEmpty")}
        </Text>
      </View>

      {meals.map((m, mi) => {
        const total = mealTotal(m);
        return (
          <View
            key={mi}
            style={{
              backgroundColor: colors.card,
              borderRadius: 24,
              padding: 16,
              gap: 6,
              borderWidth: 1,
              borderColor: colors.borderFaint,
              ...shadowWaterCard,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 7 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16 }} color={colors.inkHeading}>
                {m.n}
              </Text>
              <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.labelMuted}>
                {m.t}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={total > 0 ? colors.estimateInk : colors.disabled}>
                {total > 0 ? String(total) : t("build.plan.review.none")}
              </Text>
              <Text
                accessibilityRole="button"
                accessibilityLabel={`${t("build.plan.review.edit")} ${m.n}`}
                onPress={() => onEditMeal(mi)}
                style={{ fontFamily: fonts.semiBold, fontSize: 11.5, textDecorationLine: "underline" }}
                color={colors.labelMuted}
              >
                {t("build.plan.review.edit")}
              </Text>
            </View>

            {m.items.map((it, ii) => {
              const key = `${mi}-${ii}`;
              return (
                <View key={ii} style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 5 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.peachSoft }} />
                  <Text style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: 13.5 }} color={colors.ink}>
                    {it.n}
                  </Text>
                  {it.q > 0 ? (
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.muted}>
                      {t("build.plan.meals.portion", { q: it.q, u: it.u })}
                    </Text>
                  ) : null}
                  <KcalCell
                    k={it.k}
                    est={it.est}
                    editing={edit === key}
                    value={editValue}
                    onChange={onEditChange}
                    onOpen={() => !busy && onEditOpen(key, it.k)}
                    onSave={onEditSave}
                    label={it.n}
                    testID={`kcal-${key}`}
                  />
                </View>
              );
            })}
          </View>
        );
      })}

      {busy || !filled ? (
        <EstimateAction
          busy={busy}
          label={t("build.plan.review.fill")}
          working={t("build.plan.review.working")}
          onPress={onEstimate}
        />
      ) : null}

      {filled ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase" }} color={colors.labelMuted}>
            {t("build.plan.review.dayEyebrow")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 19 }} color={colors.inkHeading}>
              {dayTotal(meals)}
            </Text>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.labelMuted}>
              {t("build.plan.review.kcal")}
            </Text>
          </View>
          <Text style={{ fontSize: 11, lineHeight: 16 }} color={colors.labelMuted}>
            {t("build.plan.review.legend")}
          </Text>
        </View>
      ) : null}

      <Button label={t("build.plan.review.finish")} onPress={onFinish} />
    </View>
  );
}
