/**
 * APP-137 — the two setup steps onboarding gained after "What should Vita keep?":
 * your eating plan, then your training. Both offer the SAME routes the Library
 * already offers, so there is no second importer and no new chrome — the rows are
 * the Library's `SheetRow` (CEO Round 17 made it the canonical route row), the PDF
 * legs are the existing flows (`plan-setup?mode=parse`, `ImportProgramSheet`), and
 * the builders are `/build-plan` and `/build-program` unchanged.
 *
 * A step is DONE the moment the thing exists in the db. Nothing is tracked: the
 * rows simply collapse to one line, and onboarding reads the same two getters to
 * turn its CTA into "Continue". Coming back with nothing (cancelled) leaves the
 * choices exactly as they were.
 *
 * Skipping is first-class — see onboarding.tsx's CTA.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { getCachedPlan, getCachedProgram } from "../db/plan";
import { DownloadGlyph, GlyphText, SheetRow } from "../library/EatingPlanSheet";
import { ImportProgramSheet } from "../workout/ImportProgramSheet";
import { Text, colors, fonts, showToast } from "../ui";
import { importPdf } from "./planImport";

/** True once the step's thing exists — onboarding uses these for its CTA label. */
export const planDone = (): boolean => !!getCachedPlan();
export const programDone = (): boolean => !!getCachedProgram();

/** The collapsed done state: the green dot the confirm cards already use, one line. */
function DoneLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.greens[1] }} />
      <Text style={{ fontFamily: fonts.bold, fontSize: 14.5, flex: 1 }} color={colors.inkHeading}>
        {text}
      </Text>
    </View>
  );
}

export function EatingStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const doc = getCachedPlan();

  // The plan PDF leg, verbatim from the Library section: pick + upload here, the
  // review screen owns the parse. `ob=1` is the only addition — it tells plan-setup
  // to come BACK here instead of dropping the user into the Day mid-onboarding.
  const pdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await importPdf();
      if (out.status === "ready") {
        router.push(`/plan-setup?mode=parse&ob=1&fileRef=${encodeURIComponent(out.fileRef)}`);
      } else if (out.status !== "cancelled") {
        showToast(t("library.plan.importError"));
      }
    } finally {
      setBusy(false);
    }
  };

  if (doc) return <DoneLine text={t("onboarding.plan.done", { count: doc.meals.length })} />;

  return (
    <View style={{ gap: 10 }}>
      <SheetRow
        bg={colors.green.bg}
        glyph={<DownloadGlyph />}
        title={t("common.importPdf")}
        sub={t("onboarding.plan.pdfSub")}
        onPress={() => void pdf()}
      />
      <SheetRow
        bg={colors.amber.bg}
        glyph={<GlyphText ink={colors.amber.ink}>Aa</GlyphText>}
        title={t("build.eatingSheet.here")}
        sub={t("onboarding.plan.hereSub")}
        onPress={() => router.push("/build-plan")}
      />
    </View>
  );
}

export function TrainingStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const doc = getCachedProgram();

  if (doc) return <DoneLine text={t("onboarding.program.done", { name: doc.summary, count: doc.days.length })} />;

  return (
    <>
      <View style={{ gap: 10 }}>
        <SheetRow
          bg={colors.green.bg}
          glyph={<DownloadGlyph />}
          title={t("common.importPdf")}
          sub={t("onboarding.program.pdfSub")}
          onPress={() => setSheet(true)}
        />
        <SheetRow
          bg={colors.amber.bg}
          glyph={<GlyphText ink={colors.amber.ink}>Aa</GlyphText>}
          title={t("build.trainingSheet.here")}
          sub={t("onboarding.program.hereSub")}
          onPress={() => router.push("/build-program")}
        />
      </View>
      {/* A program has no review screen — parse + confirm + Save live in this sheet,
          so onboarding opens the SAME sheet straight on its PDF leg (`autoPdf`)
          rather than owning a second copy of the parse. */}
      {sheet ? <ImportProgramSheet autoPdf onClose={() => setSheet(false)} /> : null}
    </>
  );
}
