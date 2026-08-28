/**
 * APP-139 — one meal in the edit-plan accordion (handoff v4.3 §2.3/§2.4).
 *
 * Closed, it lists the FOODS ("Banana · Honey"), not a count: the names are what
 * lets a person find the right meal without opening it. Open, it is the only card
 * open — the border (accent 32%) is the whole focus signal.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { Chevron, PressScale, Text, colors, fonts, mixOklab, motion, shadowCard, useAccent } from "../../ui";
import { numOf, useFieldVisible } from "../../build/parts";
import { UNITS } from "../../build/food/draft";
import { useTimePicker } from "../../habits/timeField";
import { estimateKcal } from "../../plan/estimateKcal";
import { selectionTick } from "../../lib/haptics";
import { itemKcal, mealKcal, newItem, type EditItem, type EditMeal } from "./draft";

const dashed = { borderBottomWidth: 1, borderBottomColor: colors.divider, borderStyle: "dashed" as const };

/**
 * Handoff §6 "ink destrutivo suave" — NOT `colors.danger` (#B0563F, "Delete my
 * data"): dropping a line from a draft nobody has saved yet does not carry that
 * weight. ponytail: local until the training editor needs it too — then it is one
 * token in `ui/tokens.ts`.
 */
const SOFT_DESTRUCTIVE = "#A05F4A";

const boxed = {
  backgroundColor: colors.input,
  borderWidth: 1,
  borderColor: colors.borderControlStrong,
  borderRadius: 16,
  paddingVertical: 11,
  paddingHorizontal: 14,
  fontFamily: fonts.semiBold,
  fontSize: 13.5,
  color: colors.ink,
};

function ItemRow({ item, onQty, onRemove }: { item: EditItem; onQty: (q: string) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const qty = useFieldVisible();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.borderFaint }}>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: 13.5 }} color={colors.inkHeading}>
        {item.n}
      </Text>
      {item.locked ? (
        // A chosen usual swap states its own amount; the Day's swap sheet owns it.
        <Text style={{ width: 46, textAlign: "center", fontFamily: fonts.extraBold, fontSize: 12 }} color={colors.faint}>
          {item.q}
        </Text>
      ) : (
        <TextInput
          ref={qty.ref}
          onFocus={qty.onFocus}
          accessibilityLabel={item.n}
          value={item.q}
          onChangeText={onQty}
          keyboardType="numeric"
          style={{
            width: 46,
            textAlign: "center",
            paddingVertical: 6,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: colors.borderControlStrong,
            backgroundColor: colors.input,
            fontFamily: fonts.extraBold,
            fontSize: 12,
            color: colors.inkHeading,
          }}
        />
      )}
      <Text style={{ width: 26, fontFamily: fonts.bold, fontSize: 10.5 }} color={colors.faint}>
        {item.u}
      </Text>
      <Text style={{ width: 38, textAlign: "right", fontFamily: fonts.extraBold, fontSize: 11.5 }} color={colors.muted}>
        {itemKcal(item)}
      </Text>
      <Text
        accessibilityRole="button"
        accessibilityLabel={t("edit.plan.removeFood", { name: item.n })}
        onPress={onRemove}
        style={{ width: 22, textAlign: "center", fontFamily: fonts.bold, fontSize: 14 }}
        color={colors.disabled}
      >
        ×
      </Text>
    </View>
  );
}

/** The inline "add a food" form — §2.4. Stays open after each Add. */
function AddFood({ onAdd, onDone }: { onAdd: (item: EditItem) => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<string>("g");
  const [busy, setBusy] = useState(false);
  const nameF = useFieldVisible();
  const qtyF = useFieldVisible();

  const add = async () => {
    const n = name.trim();
    if (!n || busy) return; // empty name is a silent no-op (§2.4)
    const q = numOf(qty) || 1;
    setBusy(true);
    // The kcal comes from the food database (server table → cache → model), with the
    // on-device table as the offline/mock leg. Stored PER UNIT so a later portion
    // change re-prices proportionally instead of asking again (PLAN R4).
    const [kcal] = await estimateKcal([{ name: n, quantity: q, unit }]);
    setBusy(false);
    onAdd(newItem(n, q, unit, kcal ?? 0));
    setName("");
    setQty("");
    selectionTick();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(motion.vtFade.durationMs)}
      style={{ gap: 9, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, borderStyle: "dashed" }}
    >
      <TextInput
        ref={nameF.ref}
        onFocus={nameF.onFocus}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => qtyF.ref.current?.focus()}
        value={name}
        onChangeText={setName}
        placeholder={t("edit.plan.foodPlaceholder")}
        placeholderTextColor={colors.labelMuted}
        style={boxed}
      />
      <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
        <TextInput
          ref={qtyF.ref}
          onFocus={qtyF.onFocus}
          value={qty}
          onChangeText={setQty}
          keyboardType="numeric"
          placeholder={t("edit.plan.qtyPlaceholder")}
          placeholderTextColor={colors.labelMuted}
          style={{ ...boxed, width: 64, textAlign: "center", borderRadius: 14, paddingHorizontal: 12 }}
        />
        {UNITS.map((u) => {
          const on = u === unit;
          return (
            <PressScale
              key={u}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(`build.plan.meals.unit.${u}`)}
              onPress={() => setUnit(u)}
              style={{
                flex: 1,
                height: 38,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: on ? colors.dark.bg : "transparent",
                borderWidth: on ? 0 : 1,
                borderColor: colors.borderControlStrong,
              }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={on ? colors.dark.ink : colors.muted}>
                {t(`build.plan.meals.unit.${u}`)}
              </Text>
            </PressScale>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PressScale
          accessibilityRole="button"
          onPress={onDone}
          style={{ flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.borderControlStrong }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.inkMuted}>
            {t("edit.plan.doneAdding")}
          </Text>
        </PressScale>
        <PressScale
          accessibilityRole="button"
          onPress={() => void add()}
          style={{
            flex: 1.2,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: mixOklab(colors.accent, 12, colors.card),
            opacity: name.trim() && !busy ? 1 : 0.45,
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.accent}>
            {t("edit.plan.addFood")}
          </Text>
        </PressScale>
      </View>
      <Text style={{ fontSize: 10.5, lineHeight: 15 }} color={colors.faint}>
        {t("edit.plan.formNote")}
      </Text>
    </Animated.View>
  );
}

export function MealCard({
  meal,
  open,
  formOpen,
  onToggle,
  onPatch,
  onForm,
  onRemove,
}: {
  meal: EditMeal;
  open: boolean;
  formOpen: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<EditMeal>) => void;
  onForm: (open: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const name = useFieldVisible();
  const time = useTimePicker(meal.t || "20:00", (v) => onPatch({ t: v }), "meal-time-picker");

  const setItems = (items: EditItem[]) => onPatch({ items });

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 24,
        paddingVertical: 15,
        paddingHorizontal: 17,
        borderWidth: open ? 1.5 : 1,
        borderColor: open ? mixOklab(accent, 32, colors.card) : colors.borderFaint,
        ...shadowCard,
      }}
    >
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.peachSoft }} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 15.5 }} color={colors.inkHeading}>
          {meal.name}
        </Text>
        <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.faint}>
          {meal.t}
        </Text>
        {open ? (
          <View style={{ flex: 1 }} />
        ) : (
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 11 }} color={colors.faint}>
            {meal.items.length ? meal.items.map((i) => i.n).join(" · ") : t("edit.plan.emptyMeal")}
          </Text>
        )}
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 12 }} color={colors.amber.ink}>
          {mealKcal(meal)} {t("common.kcal")}
        </Text>
        <Chevron open={open} flip />
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(motion.vtFade.durationMs)} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.divider, borderStyle: "dashed" }}>
            <TextInput
              testID="edit-meal-name"
              ref={name.ref}
              onFocus={name.onFocus}
              returnKeyType="done"
              value={meal.name}
              onChangeText={(v) => onPatch({ name: v })}
              placeholder={t("edit.plan.namePlaceholder")}
              placeholderTextColor={colors.labelMuted}
              style={{ flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.inkHeading, paddingBottom: 5, ...dashed }}
            />
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t("edit.plan.timeLabel")}
              accessibilityValue={{ text: meal.t }}
              onPress={time.open}
              style={{ width: 60, paddingBottom: 5, alignItems: "flex-end", ...dashed }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.muted}>
                {meal.t}
              </Text>
            </PressScale>
          </View>
          {time.picker}

          {meal.items.map((it, i) => (
            <ItemRow
              key={i}
              item={it}
              onQty={(q) => setItems(meal.items.map((x, j) => (j === i ? { ...x, q } : x)))}
              onRemove={() => setItems(meal.items.filter((_, j) => j !== i))}
            />
          ))}

          {formOpen ? (
            <AddFood onAdd={(item) => setItems([...meal.items, item])} onDone={() => onForm(false)} />
          ) : (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 11 }}>
              <PressScale
                accessibilityRole="button"
                onPress={() => onForm(true)}
                style={{ flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.dashedBorder }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.inkMuted}>
                  {t("edit.plan.addFoodDashed")}
                </Text>
              </PressScale>
              {/* No confirm, no undo: the draft itself is the undo, and nothing is
                  written until Save (§2.3). */}
              <PressScale
                accessibilityRole="button"
                onPress={onRemove}
                style={{ height: 40, paddingHorizontal: 15, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(150,90,70,0.18)" }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={SOFT_DESTRUCTIVE}>
                  {t("edit.plan.removeMeal")}
                </Text>
              </PressScale>
            </View>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}
