import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/useAuth";
import { isOnboarded } from "../src/db/settings";

/** Entry gate: signed out → sign in; then onboarding once, then Today. */
export default function Index() {
  const authed = useAuth();
  if (!authed) return <Redirect href="/auth" />;
  return <Redirect href={isOnboarded() ? "/home" : "/onboarding"} />;
}
