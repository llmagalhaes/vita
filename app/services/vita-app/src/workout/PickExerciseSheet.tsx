/**
 * APP-126 — `bwPick`, the training builder's add sheet (handoff v4.2 §3.5).
 * Two stages in ONE sheet:
 *
 *  1. choose — the family selector is the first cut, not a form detail: it
 *     FILTERS the catalog, so someone adding football never sees a rep field
 *     (criterion 16). A query that matches no catalog name offers a free entry,
 *     which lights nothing on the map — guessing muscles for a name the app does
 *     not know would be inventing data (criterion 21).
 *  2. measure — the two fields the family actually uses, and nothing else.
 *
 * Kept mounted by the route so `SheetOverlay` can play its close slide; the
 * query clears on add, the typed numbers survive a family switch (handoff §4).
 */
import { useEffect, useState } from "react";
import { Keyboard, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import { dominant, search, type CatalogEntry, type Family } from "./exerciseCatalog";
import type { MuscleKey } from "../muscle/muscleData";
import type { BwExercise } from "../build/train/draft";
import { Button, PressScale, SheetOverlay, Text, colors, fonts, radii, useAccent, useKeyboardHeightState } from "../ui";
import { selectionTick } from "../lib/haptics";

/** A free-typed entry is a catalog row with no weights and the soft mark. */
const freeEntry = (name: string, fam: Family): CatalogEntry => ({ name, fam, mus: {}, whole: true });

function FamilyCard({ title, sub, active, onPress }: { title: string; sub: string; active: boolean; onPress: () => void }) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={title}
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 17,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: active ? colors.dark.bg : colors.card,
        borderWidth: active ? 0 : 1.5,
        borderColor: colors.borderControlStrong,
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={active ? colors.dark.ink : colors.inkMuted}>
        {title}
      </Text>
      <Text variant="caption" style={{ fontSize: 11 }} color={active ? "rgba(247,240,228,0.6)" : colors.faint}>
        {sub}
      </Text>
    </PressScale>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  // No flex here: as a direct child of the stage-2 column, flex:1 collapses the
  // field to zero height under the CTA (v4.2 drive finding A). Rows add it.
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" style={{ fontSize: 11 }} color={colors.faint}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        accessibilityLabel={label}
        style={{
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.borderControlStrong,
          borderRadius: radii.innerBlockTight,
          paddingVertical: 12,
          paddingHorizontal: 14,
          fontFamily: fonts.extraBold,
          fontSize: 16,
          color: colors.ink,
        }}
      />
    </View>
  );
}

export function PickExerciseSheet({
  visible,
  dayName,
  onAdd,
  onClose,
}: {
  visible: boolean;
  dayName: string;
  onAdd: (e: BwExercise) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [fam, setFam] = useState<Family>("set");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<CatalogEntry | null>(null);
  const [focused, setFocused] = useState(false);
  // All three survive a family switch — nothing typed is thrown away (handoff §4).
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [min, setMin] = useState("30");

  /**
   * R18-B — the sheet takes ownership of the keyboard when it opens.
   *
   * The "+ Add exercise" row lives in a ScrollView with
   * `keyboardShouldPersistTaps="handled"`, so pressing it does NOT dismiss the
   * keyboard: the day-name (or kcal) field behind keeps Android focus while the
   * sheet slides over it. Everything typed then lands in a field nobody can see —
   * the CEO's "eu digitava e não aparecia nada" — and `useFieldVisible`'s delayed
   * scroll drags that card up behind the sheet ("um card do nada").
   */
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  // APP-132: `lift` slides the WHOLE sheet above the keyboard, so a tall list
  // pushes the search field off the top of the screen. The list gets whatever is
  // left of the 78% budget after the keyboard and the sheet's fixed rows (~260px:
  // handle, title, family cards, search, padding). Only while the sheet is open —
  // a closed-but-mounted sheet must not re-render on the builder's own keyboard.
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardHeightState(visible);
  const listMax = Math.max(120, Math.min(300, height * 0.78 - keyboard - 260));

  const ql = q.trim().toLowerCase();
  const rows = search(q, fam);
  const freeOn = ql !== "" && !rows.some((e) => e.name.toLowerCase() === ql);

  const close = () => {
    Keyboard.dismiss(); // never leave a keyboard up over the builder we just left
    setStage(null);
    onClose();
  };

  /**
   * Stage 1 → 2. The search field unmounts here, which on its own drops the
   * keyboard as a side effect a few frames later ("o teclado abaixa sozinho");
   * dismissing first makes it one deliberate move, and stage 2's number fields
   * then raise the number pad on their own tap.
   */
  const pick = (e: CatalogEntry) => {
    Keyboard.dismiss();
    setStage(e);
  };

  const add = () => {
    if (!stage) return;
    Keyboard.dismiss();
    onAdd({ n: stage.name, fam, mus: stage.mus, soft: stage.whole, sets, reps, min });
    setStage(null);
    setQ("");
    selectionTick();
    onClose();
  };

  const hint = (e: CatalogEntry): string => {
    const dom = dominant(e.mus, 3) as MuscleKey[];
    if (dom.length === 0) return t("build.program.pick.hintFree");
    if (e.whole) return t("build.program.pick.hintWhole");
    return dom.map((k) => t(`muscle.name.${k}` as const)).join(" · ");
  };

  return (
    <SheetOverlay visible={visible} onClose={close} closeLabel={t("common.cancel")} lift>
      {stage === null ? (
        <View style={{ gap: 12 }}>
          <Text variant="title" style={{ fontSize: 17 }}>
            {t("build.program.pick.title", { day: dayName })}
          </Text>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <FamilyCard
              title={t("build.program.pick.bySet")}
              sub={t("build.program.pick.bySetSub")}
              active={fam === "set"}
              onPress={() => setFam("set")}
            />
            <FamilyCard
              title={t("build.program.pick.byTime")}
              sub={t("build.program.pick.byTimeSub")}
              active={fam === "time"}
              onPress={() => setFam("time")}
            />
          </View>
          {/* The field wears the accent while it owns the keyboard: "am I typing
              into this?" was exactly the CEO's doubt, and it cost nothing to answer. */}
          <TextInput
            value={q}
            onChangeText={setQ}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="search"
            // The list already filters live, so the search key has nothing to submit —
            // and the default blur-on-submit read as the keyboard closing by itself.
            submitBehavior="submit"
            autoCorrect={false}
            placeholder={t("build.program.pick.search")}
            placeholderTextColor={colors.faint}
            accessibilityLabel={t("build.program.pick.search")}
            style={{
              backgroundColor: colors.input,
              borderWidth: 1,
              borderColor: focused ? accent : colors.borderControlStrong,
              borderRadius: radii.innerBlockTight,
              paddingVertical: 12,
              paddingHorizontal: 14,
              fontFamily: fonts.semiBold,
              fontSize: 14,
              color: colors.ink,
            }}
          />
          {/* "always", not "handled": with "handled" a tap on the list's own padding
              (the gaps between rows, the strip under a short result set) counts as
              unhandled and RN dismisses the keyboard under the person's finger. */}
          <ScrollView style={{ maxHeight: listMax }} keyboardShouldPersistTaps="always">
            <View style={{ gap: 2 }}>
              {rows.map((e) => (
                <PressScale
                  key={e.name}
                  accessibilityRole="button"
                  accessibilityLabel={e.name}
                  onPress={() => pick(e)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: fonts.semiBold, fontSize: 13.5 }} color={colors.ink}>
                      {e.name}
                    </Text>
                    <Text style={{ fontFamily: fonts.semiBold, fontSize: 10.5 }} color={colors.faint}>
                      {(dominant(e.mus, 3) as MuscleKey[]).map((k) => t(`muscle.name.${k}` as const)).join(" · ")}
                    </Text>
                  </View>
                  {e.whole ? (
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.6 }} color={colors.faint}>
                      {t("build.program.pick.wholeBody")}
                    </Text>
                  ) : null}
                </PressScale>
              ))}
              {/* LAST, under a hairline. It appears and disappears as you type, and at
                  the TOP that shifted every catalog row ~40px mid-keystroke — the row
                  under your finger was not the row you tapped. At the bottom it can
                  only ever move itself, and it reads as attached to the list. */}
              {freeOn ? (
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={t("build.program.pick.free", { query: q.trim() })}
                  onPress={() => pick(freeEntry(q.trim(), fam))}
                  style={{
                    paddingVertical: 11,
                    gap: 2,
                    borderTopWidth: rows.length ? 1 : 0,
                    borderTopColor: colors.borderControl,
                    marginTop: rows.length ? 4 : 0,
                    paddingTop: rows.length ? 13 : 11,
                  }}
                >
                  <Text style={{ fontFamily: fonts.semiBold, fontSize: 13.5 }} color={colors.ink}>
                    {t("build.program.pick.free", { query: q.trim() })}
                  </Text>
                  <Text style={{ fontFamily: fonts.semiBold, fontSize: 10.5 }} color={colors.faint}>
                    {t("build.program.pick.freeSub")}
                  </Text>
                </PressScale>
              ) : null}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 19 }} color={colors.inkHeading}>
              {stage.name}
            </Text>
            <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.faint}>
              {hint(stage)}
            </Text>
          </View>
          {fam === "set" ? (
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <NumberField label={t("build.program.pick.sets")} value={sets} onChange={setSets} />
              </View>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, paddingBottom: 12 }} color={colors.disabled}>
                ×
              </Text>
              <View style={{ flex: 1 }}>
                <NumberField label={t("build.program.pick.reps")} value={reps} onChange={setReps} />
              </View>
            </View>
          ) : (
            <NumberField label={t("build.program.pick.minutes")} value={min} onChange={setMin} />
          )}
          <Button label={t("build.program.pick.add")} onPress={add} />
          <Button label={t("build.program.pick.back")} variant="ghost" onPress={() => setStage(null)} />
        </View>
      )}
    </SheetOverlay>
  );
}
