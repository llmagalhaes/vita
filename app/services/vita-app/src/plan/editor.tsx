import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BackButton, Text, colors, fonts } from "../ui";

const Pill = ({ label, onPress, filled }: { label: string; onPress: () => void; filled?: boolean }) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={{
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 15,
      backgroundColor: filled ? colors.accent : colors.card,
      borderWidth: filled ? 0 : 1,
      borderColor: "rgba(120,100,75,0.16)",
    }}
  >
    <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={filled ? "#FFF9F1" : colors.muted}>
      {label}
    </Text>
  </Pressable>
);

/**
 * Shared header for the Eating Plan and Training Program screens: back, eyebrow
 * label, and the Edit ⇄ Cancel/Save toggle. Keeps the two screens visually
 * identical so APP-023 reuses instead of re-deriving.
 */
export function EditHeader({
  eyebrow,
  editing,
  back,
  onEdit,
  onCancel,
  onSave,
}: {
  eyebrow: string;
  editing: boolean;
  back: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BackButton onPress={back} label={t("common.cancel")} />
      <Text
        variant="caption"
        style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase" }}
        color={colors.labelMuted}
      >
        {eyebrow}
      </Text>
      <View style={{ marginLeft: "auto", flexDirection: "row", gap: 8 }}>
        {editing ? (
          <>
            <Pill label={t("common.cancel")} onPress={onCancel} />
            <Pill label={t("plan.save")} onPress={onSave} filled />
          </>
        ) : (
          <Pill label={t("plan.edit")} onPress={onEdit} filled />
        )}
      </View>
    </View>
  );
}
