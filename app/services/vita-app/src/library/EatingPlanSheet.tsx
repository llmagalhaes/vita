/**
 * APP-129 — "Import or build your plan" (handoff v4.2 §1.1, `mpSheet`).
 *
 * The Meals card used to hand you three loose buttons. It now hands you one,
 * which opens this: the same three routes, in the same shape as the training
 * sheet, ordered document → hand-built → one meal on top. Nothing was removed —
 * the PDF route is the existing import flow, untouched (criterion 2).
 *
 * Presentational: the section owns the actions, this owns the geometry.
 */
import { type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { SheetOverlay, Text, colors, fonts, useAccent } from "../ui";
import { IconWell, tinted } from "./parts";

/** Arrow into a tray — "this comes from a document you already have". */
export const DownloadGlyph = () => (
  <Svg width={17} height={17}>
    <Path
      d="M8.5 2.6 v7.2 M5.2 6.8 L8.5 10.1 L11.8 6.8 M3.4 12.9 h10.2"
      fill="none"
      stroke={colors.green.ink}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/** A pencil at rest — "change what is already there" (APP-138). Same hairline
 *  language as the download arrow, so the rows read as one family. */
export const PencilGlyph = () => (
  <Svg width={17} height={17}>
    <Path
      d="M4.1 12.9 L3.6 14.4 L5.1 13.9 L13.3 5.7 L11.4 3.8 Z M10.6 4.6 L12.5 6.5"
      fill="none"
      stroke={colors.inkMuted}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/** A glyph that is just two characters ("Aa", "+") — no icon file for a letterform. */
export const GlyphText = ({ ink, children }: { ink: string; children: string }) => (
  <Text style={{ fontFamily: fonts.extraBold, fontSize: 15 }} color={ink}>
    {children}
  </Text>
);

/** One route: 38×38 well, title, subtitle. Padding 15, radius 20, hairline border.
 * Shared with the training sheet (CEO Round 17: both sheets carry the same chrome). */
export function SheetRow({
  bg,
  glyph,
  title,
  sub,
  onPress,
}: {
  bg: string;
  glyph: ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={sub}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        padding: 15,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: "rgba(120,100,75,0.12)",
        backgroundColor: colors.card,
      }}
    >
      <IconWell bg={bg}>{glyph}</IconWell>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color={colors.inkHeading}>
          {title}
        </Text>
        <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.labelMuted}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

export function EatingPlanSheet({
  visible,
  onClose,
  onPdf,
  onBuild,
  onAddMeal,
  onEdit,
  editLossy = false,
}: {
  visible: boolean;
  onClose: () => void;
  onPdf: () => void;
  onBuild: () => void;
  onAddMeal: () => void;
  /** APP-138 — absent when there is no plan to edit; the row simply isn't there. */
  onEdit?: () => void;
  /** The plan carries options/swaps: editing it by hand rebuilds it without them. */
  editLossy?: boolean;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  return (
    <SheetOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <Text variant="title" style={{ fontSize: 17 }}>
        {t("build.eatingSheet.title")}
      </Text>
      <SheetRow
        bg={colors.green.bg}
        glyph={<DownloadGlyph />}
        title={t("build.eatingSheet.pdf")}
        sub={t("build.eatingSheet.pdfSub")}
        onPress={onPdf}
      />
      <SheetRow
        bg={colors.amber.bg}
        glyph={<GlyphText ink={colors.amber.ink}>Aa</GlyphText>}
        title={t("build.eatingSheet.here")}
        sub={t("build.eatingSheet.hereSub")}
        onPress={onBuild}
      />
      <SheetRow
        bg={tinted(accent)}
        glyph={<GlyphText ink={accent}>+</GlyphText>}
        title={t("build.eatingSheet.one")}
        sub={t("build.eatingSheet.oneSub")}
        onPress={onAddMeal}
      />
      {onEdit ? (
        <SheetRow
          bg={colors.well}
          glyph={<PencilGlyph />}
          title={t("build.eatingSheet.edit")}
          sub={t(editLossy ? "build.eatingSheet.editSubLossy" : "build.eatingSheet.editSub")}
          onPress={onEdit}
        />
      ) : null}
    </SheetOverlay>
  );
}
