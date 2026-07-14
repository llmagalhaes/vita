import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Redirect } from "expo-router";
import * as Linking from "expo-linking";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Circle, Ellipse } from "react-native-svg";
import { isMockApi } from "../src/api";
import { OidcUnavailable } from "../src/auth/oidc";
import { signInWithMagicLink, signInWithOidc } from "../src/auth/session";
import { useAuth } from "../src/auth/useAuth";
import { tokenFromPaste, useMagicLink } from "../src/auth/useMagicLink";
import { api } from "../src/api";
import { isOnboarded } from "../src/db/settings";
import { Button, Card, Text, colors, fonts, radii, spacing } from "../src/ui";

type Provider = "google" | "apple";
type Mode = "idle" | { consent: Provider } | { sent: string };

function Wordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: "#E8B48C",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.card }} />
      </View>
      <Text variant="display" style={{ fontSize: 25 }}>
        Vita
      </Text>
    </View>
  );
}

function Blob() {
  return (
    <View style={{ height: 150, borderRadius: radii.lg, overflow: "hidden", backgroundColor: "#F5D3AC" }}>
      <Svg width="100%" height="100%" viewBox="0 0 342 150" preserveAspectRatio="xMidYMid slice">
        <Circle cx={238} cy={60} r={42} fill={colors.sun} opacity={0.3} />
        <Circle cx={238} cy={60} r={28} fill={colors.sun} />
        <Ellipse cx={50} cy={152} rx={150} ry={64} fill="#AABB9B" />
        <Ellipse cx={300} cy={166} rx={175} ry={70} fill="#8CA58A" />
        <Ellipse cx={175} cy={190} rx={205} ry={64} fill="#7A9377" />
      </Svg>
    </View>
  );
}

/** Passwordless sign-in (APP-008). Google/Apple consent + email magic link. */
export default function Auth() {
  const { t } = useTranslation();
  const authed = useAuth();
  const linkStatus = useMagicLink(); // handles vita://auth?token=… (cold + warm)
  const [mode, setMode] = useState<Mode>("idle");
  const [email, setEmail] = useState("");
  const [pasteToken, setPasteToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A completed deep-link exchange (or OIDC) flips auth → leave the sign-in screen.
  if (authed) return <Redirect href={isOnboarded() ? "/home" : "/onboarding"} />;

  const providerName = (p: Provider) => t(`auth.${p}_provider`);

  async function accept(provider: Provider) {
    setBusy(true);
    setNotice(null);
    try {
      await signInWithOidc(provider); // authed → redirect above
    } catch (e) {
      setMode("idle");
      setNotice(e instanceof OidcUnavailable ? t("auth.oidcUnavailable") : t("auth.sendError"));
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.requestMagicLink(address);
      setMode({ sent: address });
    } catch {
      setNotice(t("auth.sendError"));
    } finally {
      setBusy(false);
    }
  }

  // Dev-only (APP-DEV-PASTE-TOKEN): paste a magic-link token to sign in when the
  // vita:// deep link can't route (Expo Go). Same verify→session path as the link.
  async function pasteSignIn() {
    const token = tokenFromPaste(pasteToken);
    if (!token) return;
    setBusy(true);
    setNotice(null);
    try {
      await signInWithMagicLink(token); // authed → redirect above
    } catch {
      setNotice(t("auth.invalidLink"));
    } finally {
      setBusy(false);
    }
  }

  // Demo affordance (mock only): re-enter the app through the real deep link so
  // the vita://auth handler runs, no email needed. See useMagicLink.
  function openDemoLink() {
    void Linking.openURL(Linking.createURL("auth", { queryParams: { token: "demo-ok" } }));
  }

  const exchanging = linkStatus === "exchanging" || busy;

  return (
    <View style={{ flex: 1, padding: 26, paddingTop: 74, justifyContent: "flex-start" }}>
      <Wordmark />
      <Text variant="title" style={{ fontSize: 26, marginTop: 14, fontFamily: fonts.semiBold }}>
        {t("auth.tagline")}
      </Text>
      <View style={{ marginTop: 18 }}>
        <Blob />
      </View>

      <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 20 }}>
        {exchanging ? (
          <Animated.View entering={FadeIn} style={{ alignItems: "center", paddingVertical: 24 }}>
            <Text variant="label" color={colors.muted}>
              {t("auth.signingIn")}
            </Text>
          </Animated.View>
        ) : mode === "idle" ? (
          <IdleCard
            t={t}
            email={email}
            setEmail={setEmail}
            notice={linkStatus === "error" ? t("auth.invalidLink") : notice}
            onProvider={(p) => setMode({ consent: p })}
            onSend={sendLink}
            pasteToken={pasteToken}
            setPasteToken={setPasteToken}
            onPasteSignIn={pasteSignIn}
          />
        ) : "consent" in mode ? (
          <ConsentCard
            t={t}
            provider={mode.consent}
            providerName={providerName(mode.consent)}
            onCancel={() => setMode("idle")}
            onAccept={() => accept(mode.consent)}
          />
        ) : (
          <SentCard
            t={t}
            email={mode.sent}
            showDemo={isMockApi}
            onDemo={openDemoLink}
            onBack={() => setMode("idle")}
          />
        )}
      </View>
    </View>
  );
}

type TFn = ReturnType<typeof useTranslation>["t"];

function Notice({ text }: { text: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.estimateBg,
        borderRadius: 14,
        padding: 12,
        marginBottom: spacing.sm,
      }}
    >
      <Text variant="caption" color={colors.estimateInk} style={{ lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  );
}

function ProviderButton({
  label,
  mono,
  dark,
  onPress,
}: {
  label: string;
  mono: string;
  dark?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 11,
        height: 52,
        borderRadius: radii.pill,
        borderWidth: dark ? 0 : 1.5,
        borderColor: "rgba(120,100,75,0.14)",
        backgroundColor: dark ? "#453E35" : colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: dark ? "rgba(247,240,228,0.16)" : "#F7E7D4",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text variant="label" color={dark ? "#F7F0E4" : "#A66A3F"} style={{ fontFamily: fonts.extraBold }}>
          {mono}
        </Text>
      </View>
      <Text variant="label" color={dark ? "#F7F0E4" : colors.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

function IdleCard({
  t,
  email,
  setEmail,
  notice,
  onProvider,
  onSend,
  pasteToken,
  setPasteToken,
  onPasteSignIn,
}: {
  t: TFn;
  email: string;
  setEmail: (v: string) => void;
  notice: string | null;
  onProvider: (p: Provider) => void;
  onSend: () => void;
  pasteToken: string;
  setPasteToken: (v: string) => void;
  onPasteSignIn: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={{ gap: 10 }}>
      {notice ? <Notice text={notice} /> : null}
      <ProviderButton label={t("auth.google")} mono="G" onPress={() => onProvider("google")} />
      <ProviderButton label={t("auth.apple")} mono="A" dark onPress={() => onProvider("apple")} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(120,100,75,0.16)" }} />
        <Text variant="caption" color={colors.labelMuted} style={{ fontFamily: fonts.bold, fontSize: 11.5 }}>
          {t("auth.orEmail")}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(120,100,75,0.16)" }} />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: "rgba(120,100,75,0.12)",
          borderRadius: radii.pill,
          padding: 5,
          paddingLeft: 18,
        }}
      >
        <TextInput
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={onSend}
          placeholder={t("auth.emailPlaceholder")}
          placeholderTextColor={colors.labelMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          inputMode="email"
          returnKeyType="send"
          accessibilityLabel={t("auth.emailPlaceholder")}
          style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14.5, color: colors.ink, minWidth: 0 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("auth.sendLink")}
          onPress={onSend}
          style={({ pressed }) => ({
            height: 42,
            paddingHorizontal: 18,
            borderRadius: radii.pill,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text variant="label" color="#FFF9F1" style={{ fontSize: 13.5 }}>
            {t("auth.sendLink")}
          </Text>
        </Pressable>
      </View>
      <Text variant="caption" color={colors.labelMuted} style={{ textAlign: "center", fontSize: 11.5 }}>
        {t("auth.noPasswords")}
      </Text>

      {__DEV__ ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 6,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: "rgba(120,100,75,0.12)",
            borderRadius: radii.pill,
            padding: 5,
            paddingLeft: 18,
          }}
        >
          <TextInput
            value={pasteToken}
            onChangeText={setPasteToken}
            onSubmitEditing={onPasteSignIn}
            placeholder={t("auth.pasteTokenDev")}
            placeholderTextColor={colors.labelMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            accessibilityLabel={t("auth.pasteTokenDev")}
            style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14.5, color: colors.ink, minWidth: 0 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("auth.pasteTokenDev")}
            onPress={onPasteSignIn}
            style={({ pressed }) => ({
              height: 42,
              paddingHorizontal: 18,
              borderRadius: radii.pill,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text variant="label" color="#FFF9F1" style={{ fontSize: 13.5 }}>
              →
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

function ConsentCard({
  t,
  provider,
  providerName,
  onCancel,
  onAccept,
}: {
  t: TFn;
  provider: Provider;
  providerName: string;
  onCancel: () => void;
  onAccept: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <Card style={{ gap: 13 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: "#F7E7D4",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="title" color="#A66A3F" style={{ fontFamily: fonts.extraBold }}>
              {provider === "google" ? "G" : "A"}
            </Text>
          </View>
          <Text variant="body" style={{ fontFamily: fonts.bold, flex: 1 }}>
            {t("auth.consentTitle", { provider: providerName })}
          </Text>
        </View>
        <View style={{ backgroundColor: "#F0EDE2", borderRadius: 14, padding: 12 }}>
          <Text variant="caption" color="#6E6355" style={{ lineHeight: 19, fontSize: 12.5 }}>
            {t("auth.consentBody")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label={t("common.cancel")} variant="ghost" onPress={onCancel} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button label={t("auth.accept")} onPress={onAccept} />
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

function SentCard({
  t,
  email,
  showDemo,
  onDemo,
  onBack,
}: {
  t: TFn;
  email: string;
  showDemo: boolean;
  onDemo: () => void;
  onBack: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <Card style={{ alignItems: "center", gap: 12 }}>
        <Text variant="title" style={{ textAlign: "center" }}>
          {t("auth.sentTitle")}
        </Text>
        <Text variant="caption" color={colors.muted} style={{ textAlign: "center", fontSize: 12.5 }}>
          {t("auth.sentBody")}
          {"\n"}
          <Text variant="caption" color={colors.ink} style={{ fontFamily: fonts.bold, fontSize: 12.5 }}>
            {email}
          </Text>
        </Text>
        {showDemo ? (
          <View style={{ width: "100%" }}>
            <Button label={t("auth.openDemo")} onPress={onDemo} />
          </View>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onBack}>
          <Text variant="caption" color={colors.labelMuted} style={{ fontSize: 12.5, textDecorationLine: "underline" }}>
            {t("auth.useAnother")}
          </Text>
        </Pressable>
      </Card>
    </Animated.View>
  );
}
