import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { WaterDetail } from "../../../src/api";
import { entriesForDay, getEntry, type LocalEntry } from "../../../src/db/entries";
import { formatVolume } from "../../../src/lib/units";
import { BackButton, Card, Text, WaveIllustration, colors, fonts, spacing } from "../../../src/ui";

function inputMethodKey(m: string): string {
  switch (m) {
    case "voice":
      return "waterDetail.byVoice";
    case "photo":
      return "waterDetail.byPhoto";
    case "tap":
      return "waterDetail.byTap";
    default:
      return "waterDetail.byText";
  }
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

export default function WaterDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useMemo(() => (id ? getEntry(id) : null), [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  if (!entry || entry.type !== "water") {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, gap: 15 }}>
        <BackButton onPress={back} label={t("waterDetail.back")} />
        <Text variant="body" color={colors.muted}>
          {t("waterDetail.notFound")}
        </Text>
      </ScrollView>
    );
  }

  const detail = entry.detail as WaterDetail;

  const d = new Date(entry.occurredAt);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const dayLabel = isToday ? t("waterDetail.today") : d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const subtitle = `${dayLabel} · ${timeOf(entry.occurredAt)} · ${t(inputMethodKey(entry.inputMethod))}`;

  // The rest of that calendar day's water, so the entry sits in context.
  const dayWaters = entriesForDay(d).filter((e): e is LocalEntry => e.type === "water");
  const dayTotal = dayWaters.reduce((s, e) => s + (e.detail as WaterDetail).amountMl, 0);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 15 }}
    >
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BackButton onPress={back} label={t("waterDetail.back")} />
        <SectionLabel>{t("waterDetail.eyebrow")}</SectionLabel>
      </View>

      {/* hero */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ paddingHorizontal: 18, paddingTop: 17 }}>
          <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
            {subtitle}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, paddingTop: 4 }}>
            <Text style={{ fontFamily: fonts.extraLight, fontSize: 52, letterSpacing: -1.5 }}>
              {formatVolume(detail.amountMl, t)}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: -8 }}>
          <WaveIllustration kind="water" height={80} />
        </View>
      </Card>

      {/* the day's water log */}
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4 }}>
          <SectionLabel>{t("waterDetail.dayLog")}</SectionLabel>
          <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
            {formatVolume(dayTotal, t)}
          </Text>
        </View>
        {dayWaters.map((w, i) => {
          const current = w.id === entry.id;
          return (
            <View
              key={w.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
                borderBottomWidth: i === dayWaters.length - 1 ? 0 : 1,
                borderBottomColor: "rgba(120,100,75,0.07)",
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: current ? colors.accent : colors.macro.protein,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  variant="label"
                  style={{ fontSize: 14, fontFamily: current ? fonts.bold : fonts.semiBold }}
                  color={colors.ink}
                >
                  {formatVolume((w.detail as WaterDetail).amountMl, t)}
                </Text>
                <Text variant="caption" style={{ fontSize: 11.5, marginTop: 1 }} color={colors.labelMuted}>
                  {t(inputMethodKey(w.inputMethod))}
                </Text>
              </View>
              <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                {timeOf(w.occurredAt)}
              </Text>
            </View>
          );
        })}
      </Card>

      <Text variant="caption" style={{ fontSize: 11.5, textAlign: "center" }} color={colors.labelMuted}>
        {t("waterDetail.footer")}
      </Text>
    </ScrollView>
  );
}
