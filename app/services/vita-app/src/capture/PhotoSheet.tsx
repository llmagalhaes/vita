/**
 * "Add from a photo" sheet (CEO #6, prototype image 2). Tapping the pill's camera
 * button opens this instead of jumping straight into the library — two source
 * options, camera vs library, styled like the prototype's picker cards. Each
 * source runs the same pick → downscale → parse path (photo.ts); the parent routes
 * the outcome (picked / denied / error) back into the capture flow.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { PressScale, SheetOverlay, Text, colors, spacing } from "../ui";
import { pickPhoto, type PhotoSource, type PickedPhoto } from "./photo";

function OptionCard({
  label,
  sub,
  tint,
  icon,
  onPress,
  a11y,
}: {
  label: string;
  sub: string;
  tint: [string, string];
  icon: "camera" | "library";
  onPress: () => void;
  a11y: string;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{
        flex: 1,
        gap: 9,
        padding: 10,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: "rgba(120,100,75,0.12)",
        backgroundColor: colors.card,
      }}
    >
      <View style={{ height: 84, borderRadius: 14, backgroundColor: tint[0], alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Svg width={40} height={40} viewBox="0 0 40 40">
          {icon === "camera" ? (
            <>
              <Rect x={5} y={12} width={30} height={20} rx={4} fill="none" stroke={tint[1]} strokeWidth={2.2} />
              <Path d="M14 12 L16.5 8 h7 L26 12" fill="none" stroke={tint[1]} strokeWidth={2.2} strokeLinejoin="round" />
              <Circle cx={20} cy={22} r={5.5} fill="none" stroke={tint[1]} strokeWidth={2.2} />
            </>
          ) : (
            <>
              <Rect x={7} y={9} width={26} height={22} rx={4} fill="none" stroke={tint[1]} strokeWidth={2.2} />
              <Path d="M11 27 L18 18 L23 24 L27 20 L31 25" fill="none" stroke={tint[1]} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={15} cy={15} r={2.4} fill={tint[1]} />
            </>
          )}
        </Svg>
      </View>
      <View>
        <Text variant="label" style={{ fontSize: 13.5 }} color={colors.ink}>
          {label}
        </Text>
        <Text variant="caption" style={{ fontSize: 10.5, marginTop: 1 }} color={colors.labelMuted}>
          {sub}
        </Text>
      </View>
    </PressScale>
  );
}

export function PhotoSheet({
  visible,
  onClose,
  onPicked,
  onDenied,
  onError,
}: {
  visible: boolean;
  onClose: () => void;
  onPicked: (photo: PickedPhoto) => void;
  onDenied: () => void;
  onError: () => void;
}) {
  const { t } = useTranslation();

  const run = async (source: PhotoSource) => {
    const r = await pickPhoto(source);
    if (r.status === "picked") onPicked(r.photo);
    else if (r.status === "denied") onDenied();
    else if (r.status === "error") onError();
    else onClose(); // cancelled — close calmly, no notice
  };

  return (
    <SheetOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ gap: spacing.md + 1 }}>
        <View>
          <Text variant="title" style={{ fontSize: 19 }}>
            {t("capture.photo.sheetTitle")}
          </Text>
          <Text variant="caption" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 17 }} color={colors.muted}>
            {t("capture.photo.sheetSubtitle")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <OptionCard
            label={t("capture.photo.takePhoto")}
            sub={t("capture.photo.takePhotoSub")}
            tint={["#F6E3C4", colors.estimateInk]}
            icon="camera"
            a11y={t("capture.photo.takePhoto")}
            onPress={() => void run("camera")}
          />
          <OptionCard
            label={t("capture.photo.fromLibrary")}
            sub={t("capture.photo.fromLibrarySub")}
            tint={["#E7EDE1", "#5F7A61"]}
            icon="library"
            a11y={t("capture.photo.fromLibrary")}
            onPress={() => void run("library")}
          />
        </View>
        <Text variant="caption" style={{ fontSize: 11, textAlign: "center", lineHeight: 15 }} color={colors.labelMuted}>
          {t("capture.photo.sheetNote")}
        </Text>
      </View>
    </SheetOverlay>
  );
}
