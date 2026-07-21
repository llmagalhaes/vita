/**
 * Account & settings (APP-029). Profile (name, applied everywhere via
 * PATCH /me), "Your setup" deep links, the master notification switch (drives the
 * APP-026 Notifier), vacation card, on-device export, and sign out.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { BackButton, Card, Chevron, ConfirmSheet, KeyboardAvoider, PressScale, Text, Toggle, colors, fonts, shadowCta, showToast, spacing } from "../../src/ui";
import { getSettings, notificationsEnabled, setName, setNotificationsEnabled } from "../../src/db/settings";
import { useLogVersion } from "../../src/db/notify";
import { getVacation, isVacationActive, endVacation } from "../../src/db/vacation";
import { refreshNotifications } from "../../src/habits/notifier";
import { getCachedPlan, getCachedProgram } from "../../src/db/plan";
import { listHabits } from "../../src/db/habits";
import { VacationSheet } from "../../src/vacation/VacationSheet";
import { ExportSheet } from "../../src/export/ExportSheet";
import { signOut } from "../../src/auth/session";

const Label = ({ children }: { children: string }) => (
  <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase", paddingHorizontal: 4, paddingTop: 6 }} color={colors.labelMuted}>
    {children}
  </Text>
);

function SetupRow({ glyph, bg, ink, title, sub, onPress, delay = 0 }: { glyph: string; bg: string; ink: string; title: string; sub: string; onPress: () => void; delay?: number }) {
  return (
    <Animated.View entering={FadeIn.duration(400).delay(delay)}>
    <PressScale accessibilityRole="button" onPress={onPress} scale={0.98}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
        <View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 15 }} color={ink}>{glyph}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ fontSize: 14.5 }}>{title}</Text>
          <Text variant="caption" numberOfLines={1} style={{ fontSize: 12, marginTop: 1 }} color={colors.muted}>{sub}</Text>
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 18 }} color={colors.labelMuted}>›</Text>
      </Card>
    </PressScale>
    </Animated.View>
  );
}

export default function Account() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  const settings = useMemo(() => getSettings(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const vac = useMemo(() => getVacation(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const onVacation = useMemo(() => isVacationActive(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const [profileOpen, setProfileOpen] = useState(false);
  const [vacOpen, setVacOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  const plan = getCachedPlan();
  const program = getCachedProgram();
  const habitCount = listHabits().length;

  const notifOn = notificationsEnabled();
  const toggleNotif = () => {
    setNotificationsEnabled(!notifOn);
    void refreshNotifications();
  };

  const vacSub = onVacation
    ? `${vac.ranges[0]?.start ?? ""} – ${vac.ranges[0]?.end ?? ""}`
    : t("account.vacationOffSub");

  return (
    <KeyboardAvoider>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BackButton onPress={() => router.replace("/home")} label={t("account.back")} />
        <Label>{t("account.title")}</Label>
      </View>

      {/* profile — expands to edit name + units */}
      <Pressable accessibilityRole="button" onPress={() => setProfileOpen((o) => !o)}>
        <Card style={{ gap: 13 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
            <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.accent }} />
            <View style={{ flex: 1 }}>
              <Text variant="title" style={{ fontSize: 18 }}>{settings?.name || t("account.you")}</Text>
            </View>
            <Chevron open={profileOpen} size={12} />
          </View>
          {profileOpen && (
            <Animated.View entering={FadeIn.duration(250)} style={{ borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed", paddingTop: 13, gap: 12 }}>
              <View style={{ gap: 7 }}>
                <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.muted}>{t("onboarding.welcome.nameLabel")}</Text>
                <TextInput
                  defaultValue={settings?.name}
                  onChangeText={setName}
                  placeholder={t("account.you")}
                  placeholderTextColor={colors.labelMuted}
                  accessibilityLabel={t("onboarding.welcome.nameLabel")}
                  style={{ borderWidth: 1, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.sheet, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink }}
                />
              </View>
              <Text variant="caption" color={colors.labelMuted}>{t("account.applyEverywhere")}</Text>
            </Animated.View>
          )}
        </Card>
      </Pressable>

      {/* your setup — deep links */}
      <Label>{t("account.yourSetup")}</Label>
      <SetupRow glyph="❧" bg="#E7EDE1" ink="#5F7A61" title={t("home.eatingPlan")} sub={plan ? (plan.summary ?? t("account.setupPlanSet")) : t("account.setupNone")} onPress={() => router.push("/plan")} delay={50} />
      <SetupRow glyph="⟐" bg={colors.estimateBg} ink={colors.accent} title={t("home.trainingProgram")} sub={program ? (program.splitDescription ?? t("account.setupProgramSet")) : t("account.setupNone")} onPress={() => router.push("/program")} delay={100} />
      <SetupRow glyph="≋" bg="#F0EDE2" ink="#6E6355" title={t("account.integrations")} sub={t("account.integrationsSub")} onPress={() => router.push("/integrations")} delay={150} />
      <SetupRow glyph="✓" bg={colors.estimateBg} ink={colors.accent} title={t("habits.title")} sub={t("account.habitsSub", { count: habitCount })} onPress={() => router.push("/habits")} delay={200} />

      {/* notifications */}
      <Label>{t("account.notifications")}</Label>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ fontSize: 14 }}>{t("account.checkinReminders")}</Text>
          <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>{t("account.checkinRemindersSub")}</Text>
        </View>
        <Toggle on={notifOn} onToggle={toggleNotif} accessibilityLabel={t("account.checkinReminders")} />
      </Card>

      {/* away / vacation */}
      <Label>{t("account.away")}</Label>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 14 }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: "#E3EEF0", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16 }} color={colors.vacationAccent}>☀</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ fontSize: 14.5 }}>{t("account.vacationMode")}</Text>
          <Text variant="caption" numberOfLines={1} style={{ marginTop: 1 }} color={colors.muted}>{vacSub}</Text>
        </View>
        {onVacation ? (
          <Pressable accessibilityRole="button" onPress={() => setEndConfirmOpen(true)} style={{ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 17, borderWidth: 1.5, borderColor: "rgba(120,100,75,0.16)" }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.muted}>{t("account.end")}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setVacOpen(true)} style={{ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 17, backgroundColor: "#E3EEF0" }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.vacationAccent}>{t("account.setUp")}</Text>
          </Pressable>
        )}
      </Card>

      {/* your data — export */}
      <Label>{t("account.yourData")}</Label>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.estimateBg, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 17 }} color={colors.accent}>↑</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 15 }}>{t("account.shareLog")}</Text>
            <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>{t("account.shareLogSub")}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setExportOpen(true)} style={{ height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", ...shadowCta(colors.accent) }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color="#FFF9F1">{t("account.exportTo")}</Text>
        </Pressable>
      </Card>
      <Text variant="caption" style={{ textAlign: "center", paddingHorizontal: 20 }} color={colors.labelMuted}>{t("account.dataNote")}</Text>

      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={{ alignSelf: "center", paddingVertical: spacing.sm }}>
        <Text variant="caption" style={{ fontFamily: fonts.semiBold, textDecorationLine: "underline" }} color={colors.labelMuted}>{t("account.signOut")}</Text>
      </Pressable>

    </ScrollView>
    {/* sheets absolute-fill the screen — outside the ScrollView so they don't scroll with content */}
    <VacationSheet visible={vacOpen} onClose={() => setVacOpen(false)} />
    <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
    <ConfirmSheet
      visible={endConfirmOpen}
      title={t("account.endVacationConfirmTitle")}
      message={t("account.endVacationConfirmBody")}
      confirmLabel={t("account.end")}
      cancelLabel={t("common.cancel")}
      onConfirm={() => {
        endVacation();
        setEndConfirmOpen(false);
        showToast(t("toast.vacationEnded"));
      }}
      onClose={() => setEndConfirmOpen(false)}
    />
    </KeyboardAvoider>
  );
}
