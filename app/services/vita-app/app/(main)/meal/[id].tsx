import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import type { MealDetail, MealItem, Micro } from "../../../src/api";
import { getEntry } from "../../../src/db/entries";
import {
  Bar,
  Card,
  Donut,
  EstimateTag,
  Text,
  WaveIllustration,
  colors,
  fonts,
  spacing,
} from "../../../src/ui";

const macroColors = { protein: colors.macro.protein, carbs: colors.macro.carbs, fat: colors.macro.fat };

function inputMethodKey(m: string): string {
  switch (m) {
    case "voice":
      return "mealDetail.byVoice";
    case "photo":
      return "mealDetail.byPhoto";
    case "tap":
      return "mealDetail.byTap";
    default:
      return "mealDetail.byText";
  }
}

/** Sum micros of the same name across the meal's items (prototype shows meal-level micros). */
function aggregateMicros(items: MealItem[]): Micro[] {
  const by = new Map<string, Micro>();
  for (const it of items) {
    for (const m of it.micros ?? []) {
      const prev = by.get(m.name);
      if (prev) {
        prev.amount += m.amount;
        if (m.percentDaily != null) prev.percentDaily = (prev.percentDaily ?? 0) + m.percentDaily;
      } else {
        by.set(m.name, { ...m });
      }
    }
  }
  return [...by.values()];
}

function BackButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: "rgba(120,100,75,0.16)",
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={18} height={18}>
        <Path d="M10.8 4.5 L6.3 9 L10.8 13.5" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

export default function MealDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useMemo(() => (id ? getEntry(id) : null), [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  if (!entry || entry.type !== "meal") {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, gap: 15 }}>
        <BackButton onPress={back} label={t("mealDetail.back")} />
        <Text variant="body" color={colors.muted}>
          {t("mealDetail.notFound")}
        </Text>
      </ScrollView>
    );
  }

  const detail = entry.detail as MealDetail;
  const items = detail.items ?? [];
  const totals = detail.totals ?? {
    kcal: items.reduce((s, it) => s + (it.kcal ?? 0), 0),
    proteinG: items.reduce((s, it) => s + (it.proteinG ?? 0), 0),
    carbsG: items.reduce((s, it) => s + (it.carbsG ?? 0), 0),
    fatG: items.reduce((s, it) => s + (it.fatG ?? 0), 0),
  };
  const kcal = Math.round(totals.kcal ?? 0);

  // Macro shares by calorie contribution (protein/carbs 4 kcal/g, fat 9).
  const macroKcal = {
    protein: (totals.proteinG ?? 0) * 4,
    carbs: (totals.carbsG ?? 0) * 4,
    fat: (totals.fatG ?? 0) * 9,
  };
  const macroKcalTotal = macroKcal.protein + macroKcal.carbs + macroKcal.fat || 1;
  const legend = (["protein", "carbs", "fat"] as const).map((key) => ({
    key,
    color: macroColors[key],
    grams: Math.round(totals[`${key === "protein" ? "proteinG" : key === "carbs" ? "carbsG" : "fatG"}`] ?? 0),
    share: Math.round((macroKcal[key] / macroKcalTotal) * 100),
  }));
  const segments = legend.map((l) => ({ value: macroKcal[l.key], color: l.color }));

  const micros = aggregateMicros(items);

  const d = new Date(entry.occurredAt);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const dayLabel = isToday ? t("mealDetail.today") : d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const subtitle = `${dayLabel} · ${time} · ${t(inputMethodKey(entry.inputMethod))}`;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 15 }}
    >
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BackButton onPress={back} label={t("mealDetail.back")} />
        <SectionLabel>{t("mealDetail.eyebrow")}</SectionLabel>
      </View>

      {/* hero */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingHorizontal: 18, paddingTop: 17 }}>
          <View style={{ flexShrink: 1 }}>
            <Text variant="title" style={{ fontSize: 22 }}>
              {detail.title ?? t("mealDetail.eyebrow")}
            </Text>
            <Text variant="caption" style={{ fontSize: 12.5, marginTop: 2 }} color={colors.muted}>
              {subtitle}
            </Text>
          </View>
          <View style={{ marginTop: 5 }}>
            <EstimateTag label={t("common.estimate")} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, paddingHorizontal: 18, paddingTop: 4 }}>
          <Text style={{ fontFamily: fonts.extraLight, fontSize: 52, letterSpacing: -1.5 }}>{kcal}</Text>
          <Text variant="body" color={colors.muted}>
            {t("common.kcal")}
          </Text>
        </View>
        <View style={{ marginTop: -8 }}>
          <WaveIllustration kind="meal" height={80} />
        </View>
      </Card>

      {/* source phrase */}
      {entry.sourcePhrase ? (
        <Animated.View entering={FadeIn.duration(450).delay(60)}>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
              backgroundColor: "#FFF7EA",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(196,112,78,0.35)",
              borderRadius: 18,
              padding: 14,
            }}
          >
            <Text style={{ fontStyle: "italic", fontSize: 13, lineHeight: 20, flex: 1 }} color={colors.muted}>
              “{entry.sourcePhrase}”
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/* item breakdown */}
      {items.length > 0 && (
        <Card style={{ paddingVertical: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4 }}>
            <SectionLabel>{t("mealDetail.inThisMeal")}</SectionLabel>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
              {t("mealDetail.howBuilt")}
            </Text>
          </View>
          {items.map((it, i) => (
            <Animated.View
              key={`${it.name}-${i}`}
              entering={FadeIn.duration(400).delay(i * 55)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
                borderBottomWidth: i === items.length - 1 ? 0 : 1,
                borderBottomColor: "rgba(120,100,75,0.07)",
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.macro.fat }} />
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ fontSize: 14 }} color={colors.ink}>
                  {it.name}
                </Text>
                {it.quantity != null && (
                  <Text variant="caption" style={{ fontSize: 11.5, marginTop: 1 }} color={colors.labelMuted}>
                    {it.quantity}
                    {it.unit ? ` ${it.unit}` : ""}
                  </Text>
                )}
              </View>
              <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                {Math.round(it.kcal)} {t("common.kcal")}
              </Text>
            </Animated.View>
          ))}
        </Card>
      )}

      {/* macro donut */}
      <Card style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <Donut segments={segments}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 19 }}>{kcal}</Text>
          <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.muted}>
            {t("common.kcal")} · {t("common.estimate")}
          </Text>
        </Donut>
        <View style={{ flex: 1, gap: 12 }}>
          {legend.map((l) => (
            <View key={l.key} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <View style={{ width: 10, height: 10, borderRadius: 4, backgroundColor: l.color }} />
              <Text variant="label" style={{ fontSize: 13.5, flex: 1 }} color="#6E6355">
                {t(`home.${l.key}`)}
              </Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }}>{l.grams} g</Text>
                <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
                  {l.share}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      {/* micronutrients */}
      {micros.length > 0 && (
        <Card style={{ gap: 13 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <SectionLabel>{t("mealDetail.micronutrients")}</SectionLabel>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
              {t("mealDetail.percentDaily")}
            </Text>
          </View>
          {micros.map((m, i) => (
            <Animated.View key={m.name} entering={FadeIn.duration(400).delay(i * 60)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="label" style={{ fontSize: 13 }} color="#6E6355">
                    {m.name}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                    {m.amount} {m.unit}
                  </Text>
                </View>
                <View style={{ marginTop: 5 }}>
                  {/* vtGrowX — bars grow from the left, row-staggered */}
                  <Bar pct={Math.min(m.percentDaily ?? 0, 100)} color={colors.macro.protein} height={5} delay={150 + i * 60} />
                </View>
              </View>
              <Text style={{ width: 36, textAlign: "right", fontFamily: fonts.bold, fontSize: 12 }} color={colors.muted}>
                {m.percentDaily != null ? `${Math.round(m.percentDaily)}%` : "—"}
              </Text>
            </Animated.View>
          ))}
        </Card>
      )}

      <Text variant="caption" style={{ fontSize: 11.5, textAlign: "center" }} color={colors.labelMuted}>
        {t("mealDetail.footer")}
      </Text>
    </ScrollView>
  );
}
