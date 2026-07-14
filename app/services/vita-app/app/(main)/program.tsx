import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TrainingProgramDraft } from "../../src/api";
import { getCachedProgram, updateProgram } from "../../src/db/plan";
import { logChanged, useLogVersion } from "../../src/db/notify";
import { EditHeader } from "../../src/plan/editor";
import { Button, Card, EditableText, KeyboardAvoider, Text, colors, fonts } from "../../src/ui";

const clone = (p: TrainingProgramDraft): TrainingProgramDraft => JSON.parse(JSON.stringify(p));

/** sets×reps @load — compact exercise line in view mode. */
function exerciseLabel(sets?: number, reps?: number, loadKg?: number): string {
  const sr = sets != null && reps != null ? `${sets} × ${reps}` : sets != null ? `${sets}` : reps != null ? `${reps}` : "";
  return loadKg != null ? `${sr}${sr ? " · " : ""}${loadKg} kg` : sr;
}

export default function TrainingProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  const saved = useMemo(() => getCachedProgram(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<TrainingProgramDraft | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));
  const view = editing && working ? working : saved;

  const mutate = (fn: (d: TrainingProgramDraft) => void) =>
    setWorking((w) => {
      if (!w) return w;
      const c = clone(w);
      fn(c);
      return c;
    });

  const startEdit = () => {
    if (!saved) return;
    setWorking(clone(saved));
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setWorking(null);
  };
  const save = () => {
    if (working) void updateProgram(working).then(logChanged); // whole-doc PUT
    setEditing(false);
    setWorking(null);
  };

  if (!view) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, gap: 15 }}>
        <EditHeader eyebrow={t("program.eyebrow")} editing={false} back={back} onEdit={() => {}} onCancel={cancel} onSave={save} />
        <Text variant="body" color={colors.muted}>
          {t("program.empty")}
        </Text>
      </ScrollView>
    );
  }

  const NumField = ({ value, onChange, label }: { value?: number; onChange: (n: number | undefined) => void; label: string }) => (
    <EditableText
      value={value != null ? String(value) : ""}
      editing
      numeric
      placeholder="—"
      onChangeText={(text) => {
        const n = parseFloat(text);
        onChange(text.trim() === "" ? undefined : Number.isFinite(n) ? n : undefined);
      }}
      textStyle={{ fontSize: 13, minWidth: 40, textAlign: "center" }}
      accessibilityLabel={label}
    />
  );

  return (
    <KeyboardAvoider>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 13 }}
      keyboardShouldPersistTaps="handled"
    >
      <EditHeader eyebrow={t("program.eyebrow")} editing={editing} back={back} onEdit={startEdit} onCancel={cancel} onSave={save} />

      {/* title + split */}
      <View style={{ gap: 4 }}>
        <EditableText
          value={view.summary}
          editing={editing}
          onChangeText={(text) => mutate((d) => (d.summary = text))}
          placeholder={t("program.titlePlaceholder")}
          textStyle={{ fontSize: 22, fontFamily: fonts.bold, color: colors.ink }}
          multiline
        />
        <EditableText
          value={view.splitDescription ?? ""}
          editing={editing}
          onChangeText={(text) => mutate((d) => (d.splitDescription = text || undefined))}
          placeholder={t("program.splitPlaceholder")}
          textStyle={{ fontSize: 13, color: colors.muted }}
        />
      </View>

      {/* days */}
      {view.days.map((day, di) => (
        <Card key={di} style={{ gap: 6, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <EditableText
                value={day.name}
                editing={editing}
                onChangeText={(text) => mutate((d) => (d.days[di]!.name = text))}
                placeholder={t("program.dayNamePlaceholder")}
                textStyle={{ fontSize: 15, fontFamily: fonts.bold }}
              />
            </View>
            {editing && (
              <Pressable accessibilityRole="button" onPress={() => mutate((d) => d.days.splice(di, 1))}>
                <Text variant="caption" color={colors.labelMuted}>
                  {t("program.removeDay")}
                </Text>
              </Pressable>
            )}
          </View>

          {day.exercises.map((ex, ei) => (
            <View
              key={ei}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 8,
                borderBottomWidth: ei === day.exercises.length - 1 ? 0 : 1,
                borderBottomColor: "rgba(120,100,75,0.07)",
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#9BB39A" }} />
              <View style={{ flex: 1 }}>
                <EditableText
                  value={ex.name}
                  editing={editing}
                  onChangeText={(text) => mutate((d) => (d.days[di]!.exercises[ei]!.name = text))}
                  placeholder={t("program.exercisePlaceholder")}
                  textStyle={{ fontSize: 14 }}
                />
              </View>
              {editing ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <NumField value={ex.sets} label={t("program.sets")} onChange={(n) => mutate((d) => (d.days[di]!.exercises[ei]!.sets = n))} />
                  <Text variant="caption" color={colors.labelMuted}>
                    ×
                  </Text>
                  <NumField value={ex.reps} label={t("program.reps")} onChange={(n) => mutate((d) => (d.days[di]!.exercises[ei]!.reps = n))} />
                  <NumField value={ex.loadKg} label={t("program.load")} onChange={(n) => mutate((d) => (d.days[di]!.exercises[ei]!.loadKg = n))} />
                  <Text variant="caption" color={colors.labelMuted}>
                    kg
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("program.removeExercise")}
                    onPress={() => mutate((d) => d.days[di]!.exercises.splice(ei, 1))}
                    hitSlop={8}
                  >
                    <Text style={{ fontFamily: fonts.bold, fontSize: 16 }} color={colors.labelMuted}>
                      ×
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Text variant="caption" style={{ fontFamily: fonts.semiBold }} color={colors.muted}>
                  {exerciseLabel(ex.sets, ex.reps, ex.loadKg)}
                </Text>
              )}
            </View>
          ))}

          {editing && (
            <Pressable
              accessibilityRole="button"
              style={{ paddingTop: 6 }}
              onPress={() => mutate((d) => d.days[di]!.exercises.push({ name: "" }))}
            >
              <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.accent}>
                + {t("program.addExercise")}
              </Text>
            </Pressable>
          )}
        </Card>
      ))}

      {editing ? (
        <Button label={t("program.addDay")} variant="ghost" onPress={() => mutate((d) => d.days.push({ name: "", exercises: [] }))} />
      ) : (
        <Text variant="caption" color={colors.labelMuted} style={{ textAlign: "center", paddingHorizontal: 16 }}>
          {t("program.tapHint")}
        </Text>
      )}
    </ScrollView>
    </KeyboardAvoider>
  );
}
