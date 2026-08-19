/**
 * The two things the Day must volunteer, re-homed here after the v3 Home was deleted:
 *
 *  1. **Offline captures awaiting review** (CEO Round-12 #2, binding). A capture parked
 *     offline is parsed on reconnect and auto-added WITHOUT passing the confirm sheet.
 *     It must stay reviewable — this is the only thing that opens `ReviewSheet`.
 *  2. **"Your meal plan is in"** (session-19 §7.3). The PDF parse runs ~3 min server-side;
 *     a user who backgrounded the app has a plan in `review` and no way to know.
 *
 * Counters, not alarms: a count, a line of what it is, and a way in. Nothing is red.
 */
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { countNeedsReview } from "../db/entries";
import { logChanged, useLogVersion } from "../db/notify";
import { getCachedPlan, hideSetupPrompt, isSetupPromptHidden, mealPlanStatus } from "../db/plan";
import { openReview } from "../review/ReviewSheet";
import { Text, colors, fonts, useAccent } from "../ui";
import { cardSurface } from "./overview/parts";

function Banner({
  count,
  title,
  sub,
  onPress,
  onDismiss,
}: {
  count?: number;
  title: string;
  sub: string;
  onPress: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  return (
    <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(220)}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
        <View style={{ ...cardSurface, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
          {count != null ? (
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: colors.amber.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 14 }} color={colors.amber.ink}>
                {count}
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading}>
              {title}
            </Text>
            <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
              {sub}
            </Text>
          </View>
          {onDismiss ? (
            <Pressable accessibilityRole="button" onPress={onDismiss} hitSlop={8} style={{ paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 11 }} color={colors.faint}>
                {t("day.banner.dismiss")}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ fontFamily: fonts.bold, fontSize: 17 }} color={accent}>
              ›
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function DayBanners() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  void version; // plain reads — re-evaluated on every log change

  const reviewCount = countNeedsReview();
  const plan = getCachedPlan();
  const showPlan = mealPlanStatus() === "review" && plan != null && !isSetupPromptHidden();

  const dismissPlan = useCallback(() => {
    hideSetupPrompt();
    logChanged();
  }, []);

  if (reviewCount === 0 && !showPlan) return null;
  return (
    <View style={{ gap: 10 }}>
      {reviewCount > 0 && (
        <Banner
          count={reviewCount}
          title={reviewCount === 1 ? t("day.banner.reviewOne") : t("day.banner.reviewMany", { count: reviewCount })}
          sub={t("day.banner.reviewSub")}
          onPress={openReview}
        />
      )}
      {showPlan && (
        <Banner
          title={t("day.banner.planTitle")}
          sub={t("day.banner.planSub", { n: plan!.meals.length })}
          onPress={() => router.push("/plan-setup")}
          onDismiss={dismissPlan}
        />
      )}
    </View>
  );
}
