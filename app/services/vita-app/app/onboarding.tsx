import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { api } from "../src/api";
import { DOMAIN_KEYS, DOMAIN_NAMES } from "../src/db/domains";
import { saveSettings, setOnboarded, type Domains } from "../src/db/settings";
import {
  BackButton,
  Button,
  KeyboardAvoider,
  PressScale,
  Text,
  colors,
  fonts,
  mixOklab,
  motion,
  radii,
  spacing,
  useAccent,
} from "../src/ui";

/**
 * Onboarding — two steps, name → what Vita keeps (APP-105; README §4 screen 1,
 * prototype lines 63–92). Plan and program imports moved to the Library / empty
 * states, so nothing here is a fake step: both taps write something real.
 */
const TOTAL_STEPS = 2;

/** Every flag default ON, matching `getDomains()`'s absent-field fallback. */
const ALL_ON: Domains = { meals: true, water: true, move: true, habits: true, weight: true };

export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [domains, setDomains] = useState<Domains>(ALL_ON);

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

  const last = step === TOTAL_STEPS - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: 70, paddingBottom: 30 }}>
      {/* 2-segment progress: done green · current accent · upcoming faint */}
      <View style={{ flexDirection: "row", gap: 5, paddingHorizontal: 26 }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i < step ? colors.green.fill : i === step ? accent : colors.progressUpcoming,
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
          <Animated.View key={step} entering={FadeInUp.duration(motion.vtIn.longMs)}>
            {step === 0 ? (
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
            ) : (
              <View style={{ gap: spacing.md }}>
                <Title>{t("onboarding.keep.title")}</Title>
                <Text style={{ fontSize: 14, marginTop: -4 }} color={colors.muted}>
                  {t("onboarding.keep.subtitle")}
                </Text>
                {DOMAIN_KEYS.map((k, i) => (
                  <Animated.View key={k} entering={FadeIn.duration(motion.vtFade.longMs).delay(i * motion.vtFade.staggerMs)}>
                    <DomainRow
                      name={DOMAIN_NAMES[k]}
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
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoider>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 26, paddingTop: 14 }}>
        {last && <BackButton label={t("onboarding.back")} onPress={() => setStep(0)} />}
        <View style={{ flex: 1 }}>
          <Button
            label={last ? t("onboarding.openVita") : t("onboarding.continue")}
            disabled={!last && name.trim() === ""}
            onPress={() => (last ? finish() : setStep(1))}
          />
        </View>
      </View>
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
