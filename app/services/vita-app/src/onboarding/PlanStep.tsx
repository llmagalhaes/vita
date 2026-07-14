import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import { Button, Card, EstimateTag, Text, colors, fonts, radii, spacing } from "../ui";

/** Prototype vtPop for the parsed summary card / answered chip. */
const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(350);

/**
 * Answer state for the eating-plan and training-program steps (same shape,
 * generic over the draft the parse endpoint returns). No more mock read-back:
 * `answered` carries the real parsed draft, POSTed on onboarding finish.
 */
export type PlanAnswer<D = unknown> =
  | { kind: "unanswered" }
  | { kind: "describing"; via: "describe" | "import"; text: string }
  | { kind: "parsing" }
  | { kind: "error" }
  | { kind: "answered"; phrase: string; draft: D; confirmed: boolean }
  | { kind: "none" };

export const unanswered = { kind: "unanswered" } as const;

function OptionCard({
  mono,
  monoBg,
  monoInk,
  title,
  sub,
  onPress,
}: {
  mono: string;
  monoBg: string;
  monoInk: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: spacing.lg,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: "rgba(120,100,75,0.12)",
        backgroundColor: colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          backgroundColor: monoBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 13 }} color={monoInk}>
          {mono}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label">{title}</Text>
        <Text variant="caption">{sub}</Text>
      </View>
    </Pressable>
  );
}

export function PlanStep<D extends { summary: string }>({
  ns,
  value,
  onChange,
  parse,
  bullets,
}: {
  /** i18n namespace: "onboarding.plan" or "onboarding.program" */
  ns: string;
  value: PlanAnswer<D>;
  onChange: (next: PlanAnswer<D>) => void;
  /** REAL parse endpoint (api.parseEatingPlan / api.parseTrainingProgram). */
  parse: (text: string) => Promise<D>;
  /** Read-back bullets from the parsed draft (meal names / day names). */
  bullets: (draft: D) => string[];
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  async function readBack(phrase: string) {
    onChange({ kind: "parsing" });
    setDraft("");
    try {
      const parsed = await parse(phrase);
      onChange({ kind: "answered", phrase, draft: parsed, confirmed: false });
    } catch {
      onChange({ kind: "error" });
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant="display">{t(`${ns}.title`)}</Text>
      <Text variant="body" color={colors.muted}>
        {t(`${ns}.subtitle`)}
      </Text>

      {value.kind === "unanswered" && (
        <View style={{ gap: spacing.sm + 2 }}>
          <Animated.View entering={FadeIn.duration(400)}>
          <OptionCard
            mono="Aa"
            monoBg="#F7E7D4"
            monoInk="#A66A3F"
            title={t(`${ns}.describe`)}
            sub={t(`${ns}.describeSub`)}
            onPress={() => onChange({ kind: "describing", via: "describe", text: "" })}
          />
          </Animated.View>
          <Animated.View entering={FadeIn.duration(400).delay(70)}>
          <OptionCard
            mono="↓"
            monoBg="#E7EDE1"
            monoInk="#5F7A61"
            title={t(`${ns}.import`)}
            sub={t(`${ns}.importSub`)}
            onPress={() => onChange({ kind: "describing", via: "import", text: "" })}
          />
          </Animated.View>
          <Animated.View entering={FadeIn.duration(400).delay(140)}>
          <OptionCard
            mono="—"
            monoBg="#F0EDE2"
            monoInk={colors.muted}
            title={t(`${ns}.none`)}
            sub={t(`${ns}.noneSub`)}
            onPress={() => onChange({ kind: "none" })}
          />
          </Animated.View>
        </View>
      )}

      {value.kind === "describing" && (
        <View style={{ gap: spacing.md }}>
          {value.via === "import" && (
            <Text variant="caption" color={colors.estimateInk}>
              {t(`${ns}.importNote`)}
            </Text>
          )}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t(`${ns}.inputPlaceholder`)}
            placeholderTextColor={colors.labelMuted}
            multiline
            accessibilityLabel={t(`${ns}.title`)}
            style={{
              borderWidth: 1,
              borderColor: "rgba(120,100,75,0.16)",
              backgroundColor: colors.card,
              borderRadius: 18,
              padding: spacing.lg,
              minHeight: 96,
              fontFamily: fonts.semiBold,
              fontSize: 15,
              color: colors.ink,
              textAlignVertical: "top",
            }}
          />
          <Button
            label={t("onboarding.planShared.readBack")}
            disabled={draft.trim() === ""}
            onPress={() => readBack(draft.trim())}
          />
        </View>
      )}

      {value.kind === "parsing" && (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="label" color={colors.muted}>
            {t("onboarding.planShared.reading")}
          </Text>
        </Card>
      )}

      {value.kind === "error" && (
        <View style={{ gap: spacing.md }}>
          <Card style={{ gap: spacing.sm }}>
            <Text variant="label">{t("onboarding.planShared.readError")}</Text>
            <Text variant="caption" color={colors.muted}>
              {t("onboarding.planShared.readErrorSub")}
            </Text>
          </Card>
          <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={t("common.tryAgain")}
                variant="ghost"
                onPress={() => onChange({ kind: "describing", via: "describe", text: "" })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t(`${ns}.none`)}
                onPress={() => onChange({ kind: "none" })}
              />
            </View>
          </View>
        </View>
      )}

      {value.kind === "answered" && (
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              backgroundColor: "#FFF7EA",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(196,112,78,0.4)",
              borderRadius: 18,
              padding: spacing.md + 2,
            }}
          >
            <Text variant="caption" style={{ fontStyle: "italic" }} color={colors.muted}>
              “{value.phrase}”
            </Text>
          </View>
          <Animated.View entering={popIn}>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text
                variant="caption"
                style={{ fontFamily: fonts.extraBold, letterSpacing: 1.2, textTransform: "uppercase" }}
                color={colors.labelMuted}
              >
                {t(`${ns}.summaryLabel`)}
              </Text>
              <EstimateTag label={t("common.estimate")} />
            </View>
            <Text variant="title">{value.draft.summary}</Text>
            <View style={{ gap: spacing.sm }}>
              {bullets(value.draft).map((b) => (
                <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.macro.protein }} />
                  <Text variant="label" color="#6E6355" style={{ flex: 1 }}>
                    {b}
                  </Text>
                </View>
              ))}
            </View>
            {value.confirmed ? (
              <View
                style={{
                  backgroundColor: "#E7EDE1",
                  borderRadius: radii.md,
                  paddingVertical: spacing.sm + 2,
                  paddingHorizontal: spacing.md + 2,
                }}
              >
                <Text variant="label" color="#5F7A61">
                  {t("onboarding.planShared.saved")}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={t("common.adjust")}
                    variant="ghost"
                    onPress={() => onChange({ kind: "describing", via: "describe", text: value.phrase })}
                  />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Button
                    label={t("onboarding.planShared.looksRight")}
                    onPress={() => onChange({ ...value, confirmed: true })}
                  />
                </View>
              </View>
            )}
          </Card>
          </Animated.View>
          <Pressable accessibilityRole="button" onPress={() => onChange({ kind: "unanswered" })}>
            <Text variant="caption" color={colors.labelMuted} style={{ textDecorationLine: "underline", alignSelf: "center" }}>
              {t("onboarding.planShared.clear")}
            </Text>
          </Pressable>
        </View>
      )}

      {value.kind === "none" && (
        <View style={{ gap: spacing.md, alignItems: "flex-start" }}>
          <Animated.View
            entering={popIn}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              backgroundColor: "#F0EDE2",
              borderRadius: radii.md,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
            }}
          >
            <Text variant="label" color="#6E6355">
              {t(`${ns}.noneNoted`)}
            </Text>
            <Text
              style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.7, textTransform: "uppercase" }}
              color={colors.labelMuted}
            >
              {t("onboarding.planShared.answeredByTap")}
            </Text>
          </Animated.View>
          <Pressable accessibilityRole="button" onPress={() => onChange({ kind: "unanswered" })}>
            <Text variant="caption" color={colors.labelMuted} style={{ textDecorationLine: "underline" }}>
              {t("onboarding.planShared.changeAnswer")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
