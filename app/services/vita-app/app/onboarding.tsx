import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import Svg, { Circle, Ellipse } from "react-native-svg";
import { api, type EatingPlanDraft, type TrainingProgramDraft } from "../src/api";
import { savePlan, saveProgram } from "../src/db/plan";
import { saveSettings, setOnboarded, type Settings } from "../src/db/settings";
import { PlanStep, unanswered, type ImportResult, type PlanAnswer } from "../src/onboarding/PlanStep";
import { importPdf } from "../src/onboarding/planImport";
import { Button, Card, Chip, KeyboardAvoider, MorphContainer, Text, colors, fonts, radii, spacing } from "../src/ui";

const TOTAL_STEPS = 5;

function BlobIllustration({ height = 150 }: { height?: number }) {
  // Container silhouette morphs organically like the prototype hero (vtBlob 9s).
  return (
    <MorphContainer style={{ height, backgroundColor: "#F5D3AC" }}>
      <Svg width="100%" height="100%" viewBox="0 0 342 150" preserveAspectRatio="xMidYMid slice">
        <Circle cx={238} cy={60} r={42} fill={colors.sun} opacity={0.3} />
        <Circle cx={238} cy={60} r={28} fill={colors.sun} />
        <Ellipse cx={50} cy={152} rx={150} ry={64} fill="#AABB9B" />
        <Ellipse cx={300} cy={166} rx={175} ry={70} fill="#8CA58A" />
        <Ellipse cx={175} cy={190} rx={205} ry={64} fill="#7A9377" />
        <Circle cx={86} cy={110} r={7} fill="#5F7A61" />
        <Circle cx={106} cy={117} r={5} fill="#5F7A61" />
      </Svg>
    </MorphContainer>
  );
}

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.bold, fontSize: 12.5 }}
    color={colors.muted}
  >
    {children}
  </Text>
);

type KeepTrackKey = keyof Settings["keepTrack"];
const KEEP_TRACK_KEYS: KeepTrackKey[] = ["meals", "water", "workouts", "habits", "cycle"];


export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [keepTrack, setKeepTrack] = useState<Settings["keepTrack"]>({
    meals: true,
    water: false,
    workouts: false,
    habits: false,
    cycle: false,
  });
  const [plan, setPlan] = useState<PlanAnswer<EatingPlanDraft>>(unanswered);
  const [program, setProgram] = useState<PlanAnswer<TrainingProgramDraft>>(unanswered);

  const confirmedDraft = <D,>(a: PlanAnswer<D>): D | null =>
    a.kind === "answered" && a.confirmed ? a.draft : null;

  // Compose the PDF import (pick → upload) with the fileRef parse; the filename is
  // the read-back "phrase". Same answered draft as the describe path → same confirm card.
  const runPdfImport = async <D,>(
    parse: (b: { fileRef: string }) => Promise<D>,
  ): Promise<ImportResult<D>> => {
    const out = await importPdf();
    if (out.status === "cancelled") return { status: "cancelled" };
    if (out.status !== "ready") return { status: "error" };
    try {
      return { status: "answered", draft: await parse({ fileRef: out.fileRef }), label: out.name };
    } catch {
      return { status: "error" };
    }
  };

  function finish() {
    saveSettings({ name: name.trim(), keepTrack });
    setOnboarded();
    // Offline-tolerant: profile sync is fire-and-forget; kv is the local truth.
    void api.patchMe({ name: name.trim() }).catch(() => {});
    // Persist the confirmed plan/program (POST → new version; cache is local truth).
    const planDoc = confirmedDraft(plan);
    if (planDoc) void savePlan(planDoc, plan.kind === "answered" ? (plan.source ?? "manual") : "manual");
    const programDoc = confirmedDraft(program);
    if (programDoc) void saveProgram(programDoc);
    router.replace("/home");
  }

  const nextDisabled = step === 0 && name.trim() === "";

  const recapRows: Array<[string, string]> = [
    [t("onboarding.allSet.recapName"), name.trim()],
    [
      t("onboarding.allSet.recapKeepTrack"),
      KEEP_TRACK_KEYS.filter((k) => keepTrack[k])
        .map((k) => t(`onboarding.keepTrack.${k}`))
        .join(" · "),
    ],
    [t("onboarding.allSet.recapPlan"), confirmedDraft(plan) ? t("onboarding.allSet.planYes") : t("onboarding.allSet.planNo")],
    [t("onboarding.allSet.recapProgram"), confirmedDraft(program) ? t("onboarding.allSet.planYes") : t("onboarding.allSet.planNo")],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* progress */}
      <View style={{ flexDirection: "row", gap: 5, paddingTop: 58, paddingHorizontal: spacing.xl }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= step ? colors.accent : "rgba(120,100,75,0.15)",
            }}
          />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm + 2,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md + 2,
          minHeight: 48,
        }}
      >
        {step > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={() => setStep((s) => s - 1)}
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
            <Text variant="label">←</Text>
          </Pressable>
        )}
        <Text
          variant="caption"
          style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase" }}
          color={colors.labelMuted}
        >
          {t("onboarding.stepLabel", { current: step + 1, total: TOTAL_STEPS })}
        </Text>
      </View>

      <KeyboardAvoider>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* vtIn — each step rises 16px while fading in */}
        <Animated.View key={step} entering={FadeInUp.duration(350)}>
          {step === 0 && (
            <View style={{ gap: spacing.lg }}>
              <Text variant="label" color={colors.accent}>
                {t("onboarding.welcome.eyebrow")}
              </Text>
              <Text variant="display">{t("onboarding.welcome.title")}</Text>
              <BlobIllustration />
              <View style={{ gap: spacing.sm }}>
                <SectionLabel>{t("onboarding.welcome.nameLabel")}</SectionLabel>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  accessibilityLabel={t("onboarding.welcome.nameLabel")}
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(120,100,75,0.16)",
                    backgroundColor: colors.card,
                    borderRadius: 18,
                    paddingVertical: 15,
                    paddingHorizontal: 18,
                    fontFamily: fonts.semiBold,
                    fontSize: 16,
                    color: colors.ink,
                  }}
                />
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={{ gap: spacing.lg }}>
              <Text variant="display">{t("onboarding.keepTrack.title")}</Text>
              <Text variant="body" color={colors.muted}>
                {t("onboarding.keepTrack.subtitle")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm + 2 }}>
                {KEEP_TRACK_KEYS.map((k, i) => (
                  <Animated.View key={k} entering={FadeIn.duration(450).delay(i * 70)}>
                    <Chip
                      label={t(`onboarding.keepTrack.${k}`)}
                      selected={keepTrack[k]}
                      onPress={() => setKeepTrack((v) => ({ ...v, [k]: !v[k] }))}
                    />
                  </Animated.View>
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <PlanStep
              ns="onboarding.plan"
              value={plan}
              onChange={setPlan}
              parse={(text) => api.parseEatingPlan({ text })}
              importPdf={() => runPdfImport((b) => api.parseEatingPlan(b))}
              bullets={(d) => d.meals.map((m) => (m.time ? `${m.name} · ${m.time}` : m.name))}
            />
          )}
          {step === 3 && (
            <PlanStep
              ns="onboarding.program"
              value={program}
              onChange={setProgram}
              parse={(text) => api.parseTrainingProgram({ text })}
              importPdf={() => runPdfImport((b) => api.parseTrainingProgram(b))}
              bullets={(d) => d.days.map((day) => day.name)}
            />
          )}

          {step === 4 && (
            <View style={{ gap: spacing.lg }}>
              <Text variant="display">{t("onboarding.allSet.title", { name: name.trim() })}</Text>
              <BlobIllustration height={140} />
              <Card style={{ paddingVertical: spacing.xs }}>
                {recapRows.map(([k, v], i) => (
                  <View
                    key={k}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 14,
                      paddingVertical: 11,
                      borderBottomWidth: i === recapRows.length - 1 ? 0 : 1,
                      borderBottomColor: "rgba(120,100,75,0.07)",
                    }}
                  >
                    <Text variant="label" color={colors.muted}>
                      {k}
                    </Text>
                    <Text variant="label" style={{ flexShrink: 1, textAlign: "right" }}>
                      {v}
                    </Text>
                  </View>
                ))}
              </Card>
              <View style={{ backgroundColor: "#F0EDE2", borderRadius: radii.md, padding: spacing.md + 2 }}>
                <Text variant="caption" style={{ fontSize: 13, lineHeight: 20 }} color={colors.muted}>
                  {t("onboarding.allSet.philosophy")}
                </Text>
              </View>
              <Text variant="label" color={colors.accent}>
                {t("onboarding.allSet.tryIt")}
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
      </KeyboardAvoider>

      <View style={{ position: "absolute", left: spacing.xl, right: spacing.xl, bottom: 40 }}>
        <Button
          label={step === TOTAL_STEPS - 1 ? t("common.start") : t("common.next")}
          disabled={nextDisabled}
          onPress={() => (step === TOTAL_STEPS - 1 ? finish() : setStep((s) => s + 1))}
        />
      </View>
    </View>
  );
}
