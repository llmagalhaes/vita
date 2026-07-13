import { isMockApi } from "../api";

/** Google/Apple sign-in couldn't produce an id token in this build. */
export class OidcUnavailable extends Error {
  constructor(readonly provider: "google" | "apple") {
    super(`native ${provider} sign-in needs a dev build`);
    this.name = "OidcUnavailable";
  }
}

/**
 * Native OIDC → provider id token, passed to POST /auth/oidc.
 *
 * ponytail: real native sign-in (@react-native-google-signin, expo-apple-
 * authentication) needs a dev build — it is NOT in Expo Go under SDK 56
 * (APP-007, blocked on the CEO's store accounts). Until then this stub returns
 * a fake id token in mock mode so the consent → session demo flows in Expo Go,
 * and throws OidcUnavailable against a real API so the UI shows the calm
 * "use email for now" note. Swap this one function at APP-007; the button,
 * consent card and /auth/oidc exchange are already wired.
 */
export async function getOidcIdToken(
  provider: "google" | "apple",
): Promise<{ idToken: string; nonce?: string; name?: string }> {
  if (isMockApi) return { idToken: `mock-${provider}-idtoken`, name: "Ana" };
  throw new OidcUnavailable(provider);
}
