import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { api } from "../src/api";
import { DOMAIN_KEYS } from "../src/db/domains";
import { useLogVersion } from "../src/db/notify";
import { saveSettings, setOnboarded, type Domains } from "../src/db/settings";
import { EatingStep, TrainingStep, planDone, programDone } from "../src/onboarding/SetupSteps";
import {
  BackButton,
  Button,
  KeyboardAvoider,
  PressScale,
  Text,
  ToastHost,
  colors,
  fonts,
  mixOklab,
  motion,
  radii,
  spacing,
  useAccent,
} from "../src/ui";

/**
 * Onboarding — name → what Vita keeps (APP-105; README §4 screen 1, prototype
 * lines 63–92), then APP-137's two setup steps: your eating plan, your training.
 * Nothing here is a fake step — every tap either writes a flag or opens the real
 * flow the Library opens, and every one of them can be skipped.
 *
 * The setup steps only appear for what you kept: turn "meals" off and there is no
 * eating step to skip. So the step list is derived, never a constant.
 */
type Step = "name" | "keep" | "plan" | "program";

/** Every flag default ON, matching `getDomains()`'s absent-field fallback. */
const ALL_ON: Domains = { meals: true, water: true, move: true, habits: true, weight: true };

export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [domains, setDomains] = useState<Domains>(ALL_ON);
  // A plan/program saved by a pushed flow lands in the db while this screen sits
  // underneath it; the write bumps this version, so the step re-reads on return.
  void useLogVersion();

  const steps: Step[] = ["name", "keep", ...(domains.meals ? (["plan"] as const) : []), ...(domains.move ? (["program"] as const) : [])];
  // Going back and turning a domain off can shorten the list under our feet — the
  // clamp, not `step`, is what the screen renders and advances from.
  const idx = Math.min(step, steps.length - 1);
  const kind = steps[idx];
  const setupDone = kind === "plan" ? planDone() : kind === "program" ? programDone() : false;

  function finish() {
    const trimmed = name.trim();
    // ponytail: one write — `setDomains()` would need settings to already exist
    // (its `patch` no-ops on a fresh install), so the whole profile lands at once.
    saveSettings({ name: trimmed, domains });
    setOnboarded();
    // Offline-tolerant: profile sync is fire-and-forget; kv is the local truth.
    void api.patchMe({ name: trimmed }).catch(() => {});
    router.replace("/day");
  }

  const last = idx === steps.length - 1;
  const skipping = !last && (kind === "plan" || kind === "program") && !setupDone;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: 70, paddingBottom: 30 }}>
      {/* progress: done green · current accent · upcoming faint */}
      <View style={{ flexDirection: "row", gap: 5, paddingHorizontal: 26 }}>
        {Array.from({ length: steps.length }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < idx ? colors.green.fill : i === idx ? accent : colors.progressUpcoming,
            }}
          />
        ))}
      </View>

      <KeyboardAvoider>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 24, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* vtIn — each step rises 16px while fading in */}
          <Animated.View key={idx} entering={FadeInUp.duration(motion.vtIn.longMs)}>
            {kind === "name" ? (
              <View style={{ gap: spacing.lg }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={accent}>
                  {t("onboarding.welcome.eyebrow")}
                </Text>
                <Title style={{ marginTop: -8 }}>{t("onboarding.welcome.title")}</Title>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t("onboarding.welcome.nameLabel")}
                  placeholderTextColor={colors.faint}
                  accessibilityLabel={t("onboarding.welcome.nameLabel")}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.borderControlStrong,
                    backgroundColor: colors.card,
                    borderRadius: 18,
                    paddingVertical: 16,
                    paddingHorizontal: 18,
                    fontFamily: fonts.semiBold,
                    fontSize: 17,
                    color: colors.ink,
                  }}
                />
                <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.faint}>
                  {t("onboarding.welcome.note")}
                </Text>
              </View>
            ) : kind === "keep" ? (
              <View style={{ gap: spacing.md }}>
                <Title>{t("onboarding.keep.title")}</Title>
                <Text style={{ fontSize: 14, marginTop: -4 }} color={colors.muted}>
                  {t("onboarding.keep.subtitle")}
                </Text>
                {DOMAIN_KEYS.map((k, i) => (
                  <Animated.View key={k} entering={FadeIn.duration(motion.vtFade.longMs).delay(i * motion.vtFade.staggerMs)}>
                    <DomainRow
                      name={t(`library.keeps.row.${k}`)}
                      desc={t(`onboarding.keep.desc.${k}`)}
                      on={domains[k]}
                      accent={accent}
                      onPress={() => setDomains((d) => ({ ...d, [k]: !d[k] }))}
                    />
                  </Animated.View>
                ))}
                <Text variant="caption" style={{ fontSize: 11.5, lineHeight: 17 }} color={colors.faint}>
                  {t("onboarding.keep.note")}
                </Text>
              </View>
            ) : (
              /* APP-137 — the same shape for both setup steps: the Library's routes,
                 or nothing at all. `setupDone` collapses the rows to one line. */
              <View style={{ gap: spacing.md }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={accent}>
                  {t(`onboarding.${kind}.eyebrow`)}
                </Text>
                <Title style={{ marginTop: -8 }}>{t(`onboarding.${kind}.title`)}</Title>
                <Text style={{ fontSize: 14, marginTop: -4 }} color={colors.muted}>
                  {t(`onboarding.${kind}.subtitle`)}
                </Text>
                {kind === "plan" ? <EatingStep /> : <TrainingStep />}
                {setupDone ? null : (
                  <Text variant="caption" style={{ fontSize: 11.5, lineHeight: 17 }} color={colors.faint}>
                    {t("onboarding.setup.skipNote")}
                  </Text>
                )}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoider>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 26, paddingTop: 14 }}>
        {idx > 0 && <BackButton label={t("onboarding.back")} onPress={() => setStep(idx - 1)} />}
        <View style={{ flex: 1 }}>
          {/* Skipping is not a lesser path, so it is the same button: quiet while
              there is nothing to continue from, solid the moment there is. The last
              step keeps "Open Vita →" either way — that IS its skip. */}
          <Button
            label={last ? t("onboarding.openVita") : skipping ? t("onboarding.setup.skip") : t("onboarding.continue")}
            variant={skipping ? "ghost" : "primary"}
            disabled={kind === "name" && name.trim() === ""}
            onPress={() => (last ? finish() : setStep(idx + 1))}
          />
        </View>
      </View>
      {/* The (main) shell's host is not mounted here — without this, an import error
          on a setup step would fail silently (the APP-061 class of bug). */}
      <ToastHost />
    </View>
  );
}

/** Both step headings: 27/600, line-height 1.22, letter-spacing −.2. */
const Title = ({ children, style }: { children: string; style?: { marginTop: number } }) => (
  <Text
    style={[{ fontFamily: fonts.semiBold, fontSize: 27, lineHeight: 33, letterSpacing: -0.2 }, style]}
    color={colors.inkHeading}
  >
    {children}
  </Text>
);

function DomainRow({
  name,
  desc,
  on,
  accent,
  onPress,
}: {
  name: string;
  desc: string;
  on: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={name}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingVertical: 13,
        paddingHorizontal: 15,
        borderRadius: radii.innerBlock,
        borderWidth: 1.5,
        borderColor: on ? mixOklab(accent, 45) : colors.borderControl,
        backgroundColor: colors.card,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: on ? accent : "rgba(120,100,75,0.3)",
          backgroundColor: on ? accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {on && (
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path
              d="M2.5 6.2 l2.6 2.6 L9.5 3.4"
              fill="none"
              stroke={colors.card}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.inkHeading}>
          {name}
        </Text>
        <Text variant="caption" style={{ fontSize: 11.5, lineHeight: 16, marginTop: 1 }} color={colors.muted}>
          {desc}
        </Text>
      </View>
    </PressScale>
  );
}
