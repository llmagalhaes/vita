import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { signInWithMagicLink } from "./session";

export type MagicLinkStatus = "idle" | "exchanging" | "error";

/**
 * Extract a token from a pasted value (dev paste-token sign-in). Handles the
 * whole `vita://auth?token=X` link, an `exp://…?token=X` URL, or a raw `token=X`
 * log line by taking everything after the last `token=`; otherwise the value is
 * assumed to be the bare token. Trimmed either way.
 */
export function tokenFromPaste(input: string): string {
  const trimmed = input.trim();
  const i = trimmed.lastIndexOf("token=");
  return i === -1 ? trimmed : trimmed.slice(i + "token=".length).trim();
}

/** Pull the `?token=` out of a `vita://auth?token=…` deep link. */
export function tokenFromUrl(url: string): string | null {
  const { hostname, path, queryParams } = Linking.parse(url);
  if (hostname !== "auth" && path !== "auth") return null;
  const token = queryParams?.token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/**
 * Handles the magic-link deep link for both cold start (getInitialURL) and warm
 * start (url event). On a valid token it exchanges via the session and the auth
 * gate redirects away; an invalid/expired token surfaces as "error" for the
 * calm sign-in copy. Mounted on the sign-in screen (the only unauthed route).
 */
export function useMagicLink(): MagicLinkStatus {
  const [status, setStatus] = useState<MagicLinkStatus>("idle");

  useEffect(() => {
    let mounted = true;
    async function handle(url: string | null) {
      const token = url ? tokenFromUrl(url) : null;
      if (!token) return;
      setStatus("exchanging");
      try {
        await signInWithMagicLink(token);
        if (mounted) setStatus("idle");
      } catch {
        if (mounted) setStatus("error");
      }
    }
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => void handle(e.url));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return status;
}
