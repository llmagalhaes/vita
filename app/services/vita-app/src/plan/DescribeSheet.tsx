/**
 * A minimal "type or speak it" sheet (APP-087) — the dual-input describe field
 * reused by Today's none-states (meal plan / training program). Field + mic
 * (device recognizer) + a submit button; the caller runs the actual parse. Rides
 * the app's one SheetOverlay chrome (drag-dismiss, keyboard lift).
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { getRecognizer } from "../capture/speech";
import { Button, SheetOverlay, Text, colors, fonts } from "../ui";

export function DescribeSheet({
  title,
  placeholder,
  busy,
  onSubmit,
  onClose,
}: {
  title: string;
  placeholder: string;
  busy?: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const onMic = () => {
    const rec = getRecognizer();
    rec.start({ onPartial: setText, onFinal: setText, onError: () => {} });
    setTimeout(() => rec.stop(), 400);
  };
  return (
    <SheetOverlay visible onClose={onClose} closeLabel={t("common.cancel")} lift>
      <Text variant="title" style={{ fontSize: 17 }}>
        {title}
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.labelMuted}
        multiline
        accessibilityLabel={title}
        style={{
          borderWidth: 1,
          borderColor: "rgba(120,100,75,0.16)",
          backgroundColor: colors.card,
          borderRadius: 18,
          padding: 16,
          minHeight: 96,
          fontFamily: fonts.semiBold,
          fontSize: 15,
          color: colors.ink,
          textAlignVertical: "top",
        }}
      />
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.planShared.dictate")}
          onPress={onMic}
          style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 18 }}>🎙</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          {busy ? (
            <View style={{ height: 52, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <Button label={t("onboarding.planShared.readBack")} disabled={text.trim() === ""} onPress={() => onSubmit(text.trim())} />
          )}
        </View>
      </View>
    </SheetOverlay>
  );
}
