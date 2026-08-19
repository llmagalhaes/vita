/**
 * "What Vita keeps" (APP-103, prototype `trackRows` lines 719–731) — the five
 * composition toggles. Off HIDES a domain everywhere; nothing is ever deleted,
 * which is what both the note and the toast say. Storage + toast live in
 * src/db/domains.ts (APP-095); this file is only the surface.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, Toggle, colors, fonts } from "../../ui";
import { DOMAIN_KEYS, toggleDomain, useDomains } from "../../db/domains";
import { CardNote, ListCard, ListRow, SectionLabel } from "../parts";

export function Keeps() {
  const { t } = useTranslation();
  const domains = useDomains();
  return (
    <>
      <SectionLabel>{t("library.keeps.title")}</SectionLabel>
      <ListCard>
        {DOMAIN_KEYS.map((k) => (
          <ListRow key={k}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading}>
                {t(`library.keeps.row.${k}`)}
              </Text>
              <Text style={{ fontSize: 11, marginTop: 1 }} color={colors.muted}>
                {t(`library.keeps.rowSub.${k}`)}
              </Text>
            </View>
            <Toggle
              on={domains[k]}
              onToggle={() => toggleDomain(k)}
              onColor={colors.green.fill}
              offColor={colors.sandLight}
              accessibilityLabel={t(`library.keeps.row.${k}`)}
            />
          </ListRow>
        ))}
        <CardNote>{t("library.keeps.note")}</CardNote>
      </ListCard>
    </>
  );
}
