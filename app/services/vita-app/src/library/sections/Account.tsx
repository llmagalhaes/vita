/**
 * "Account" (APP-103, prototype lines 834–844). Avatar + name + email, a neutral
 * Sign out and a danger "Delete my data".
 *
 * Delete is the real flow, not a local wipe pretending to be one: it calls
 * DELETE /account, which starts the server's 7-day grace (ADR-0004, CEO Q5 "keep
 * grace") — signing in again inside that window cancels it — and then clears this
 * device so the app returns to onboarding. The confirm offers three ways out
 * (Keep it / Export first / Delete) because the log lives here.
 *
 * The email comes from GET /me and is cached, so the row still reads right offline.
 */
import { useEffect, useState } from "react";
import { Pressable, View} from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ConfirmSheet, Text, colors, fonts, showToast, useAccent } from "../../ui";
import { api } from "../../api";
import { getDb } from "../../db/db";
import { kvGet, kvSet } from "../../db/kv";
import { getSettings } from "../../db/settings";
import { useLogVersion } from "../../db/notify";
import { signOut } from "../../auth/session";
import { ListCard, PillButton } from "../parts";

const EMAIL_KEY = "account.email";

/**
 * Everything this device holds. `kv` last: it carries the `onboarded` flag, so
 * dropping it is what sends the app back to onboarding on the next render.
 */
function wipeDevice(): void {
  const db = getDb();
  for (const table of ["entries", "outbox", "pending_parse", "day_record", "habits", "kv"]) {
    db.runSync(`DELETE FROM ${table}`);
  }
}

export function Account({ onExport }: { onExport: () => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const version = useLogVersion();
  void version;
  const name = getSettings()?.name?.trim() || t("library.account.you");
  const [email, setEmail] = useState<string>(() => kvGet<string>(EMAIL_KEY) ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // One fetch per mount, cached — the row must still read right offline.
  useEffect(() => {
    let alive = true;
    void api
      .getMe()
      .then((me) => {
        if (!alive || !me.email) return;
        kvSet(EMAIL_KEY, me.email);
        setEmail(me.email);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const doDelete = () => {
    setConfirmOpen(false);
    // Server first (best-effort): a failed call must not strand the user with
    // data they asked to be gone — the local wipe always happens.
    void api.deleteAccount().catch(() => {});
    wipeDevice();
    void signOut();
    showToast(t("library.account.deletedToast"));
  };

  return (
    <ListCard style={{ paddingVertical: 15, gap: 12 }}>
      {/* The row pushes the surviving /account screen — notification settings
          (master switch, day-close hour) live there and nowhere else. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("library.account.open")}
        onPress={() => router.push("/account")}
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <LinearGradient
          // prototype `linear-gradient(135deg,#E8B48C,var(--accent))`
          colors={[colors.peachSoft, accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 16 }} color="#FFF9F1">
            {name.slice(0, 1).toUpperCase()}
          </Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.inkHeading}>{name}</Text>
          {email ? (
            <Text style={{ fontSize: 11.5, marginTop: 1 }} numberOfLines={1} color={colors.muted}>{email}</Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 16 }} color={colors.faint}>›</Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PillButton label={t("library.account.signOut")} onPress={() => void signOut()} height={42} flex={1} />
        <PillButton label={t("library.account.delete")} onPress={() => setConfirmOpen(true)} tone="danger" height={42} flex={1} />
      </View>

      <ConfirmSheet
        visible={confirmOpen}
        title={t("library.account.deleteTitle")}
        message={t("library.account.deleteBody")}
        confirmLabel={t("library.account.deleteConfirm")}
        altLabel={t("library.account.exportFirst")}
        onAlt={() => {
          setConfirmOpen(false);
          onExport();
        }}
        cancelLabel={t("library.account.keepIt")}
        destructive
        onConfirm={doDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </ListCard>
  );
}
