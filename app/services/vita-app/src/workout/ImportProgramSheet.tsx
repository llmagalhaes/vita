/**
 * Minimal training-program import (APP-087 §6.3 none-state) — NO 6-step review
 * for programs. Pick a PDF or describe it → parse → confirm card (summary + day
 * list) → Save. Rides SheetOverlay. Shared by Today's workout none-state and the
 * Workout hub's empty state.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { TrainingProgramDraft } from "../api/client";
import { importPdf } from "../onboarding/planImport";
import { saveProgram } from "../db/plan";
import { logChanged } from "../db/notify";
import { getRecognizer } from "../capture/speech";
import { Button, SheetOverlay, Text, colors, fonts } from "../ui";
import { showToast } from "../ui/toast";

type Phase = "choose" | "describing" | "parsing" | "confirm";

export function ImportProgramSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("choose");
  const [draft, setDraft] = useState<TrainingProgramDraft | null>(null);
  const [text, setText] = useState("");

  const onMic = () => {
    const rec = getRecognizer();
    rec.start({ onPartial: setText, onFinal: setText, onError: () => {} });
    setTimeout(() => rec.stop(), 400);
  };

  const parsed = (d: TrainingProgramDraft) => {
    setDraft(d);
    setPhase("confirm");
  };
  // A parse/upload failure used to drop silently back to the chooser — tell the user.
  const fail = () => {
    setPhase("choose");
    showToast(t("library.programs.parseError"));
  };

  const runPdf = async () => {
    setPhase("parsing");
    const out = await importPdf();
    if (out.status === "cancelled") return setPhase("choose");
    if (out.status !== "ready") return fail();
    try {
      parsed(await api.parseTrainingProgram({ fileRef: out.fileRef }));
    } catch {
      fail();
    }
  };
  const runText = async (phrase: string) => {
    setPhase("parsing");
    try {
      parsed(await api.parseTrainingProgram({ text: phrase }));
    } catch {
      fail();
    }
  };

  const save = () => {
    if (!draft) return;
    void saveProgram(draft).then(() => logChanged());
    onClose();
    showToast(t("library.programs.importedToast", { n: draft.days.length }));
  };

  return (
    <SheetOverlay visible onClose={onClose} closeLabel={t("common.cancel")} lift>
      {phase === "choose" ? (
        <View style={{ gap: 10 }}>
          <Text variant="title" style={{ fontSize: 17 }}>
            {t("library.programs.importTitle")}
          </Text>
          <Button label={t("common.importPdf")} onPress={runPdf} />
          <Button label={t("common.typeOrSpeak")} variant="ghost" onPress={() => setPhase("describing")} />
        </View>
      ) : null}

      {phase === "describing" ? (
        <View style={{ gap: 12 }}>
          <Text variant="title" style={{ fontSize: 17 }}>
            {t("common.typeOrSpeak")}
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t("library.programs.inputPlaceholder")}
            placeholderTextColor={colors.labelMuted}
            multiline
            accessibilityLabel={t("common.typeOrSpeak")}
            style={{ borderWidth: 1, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.card, borderRadius: 18, padding: 16, minHeight: 96, fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink, textAlignVertical: "top" }}
          />
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.dictate")}
              onPress={onMic}
              style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 18 }}>🎙</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Button label={t("common.readBack")} disabled={text.trim() === ""} onPress={() => runText(text.trim())} />
            </View>
          </View>
        </View>
      ) : null}

      {phase === "parsing" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="label" color={colors.muted}>
            {t("common.reading")}
          </Text>
        </View>
      ) : null}

      {phase === "confirm" && draft ? (
        <View style={{ gap: 12 }}>
          <Text variant="title" style={{ fontSize: 17 }}>
            {draft.summary}
          </Text>
          <View style={{ gap: 6 }}>
            {draft.days.map((d) => (
              <View key={d.name} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.greens[1] }} />
                <Text variant="label" style={{ flex: 1 }} color="#6E6355">
                  {d.name} · {d.exercises.length} {t("library.programs.exercisesWord")}
                </Text>
              </View>
            ))}
          </View>
          <Button label={t("library.programs.save")} onPress={save} />
          <Button label={t("common.adjust")} variant="ghost" onPress={() => setPhase("describing")} />
        </View>
      ) : null}
    </SheetOverlay>
  );
}
