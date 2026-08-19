import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/useAuth";
import { isOnboarded } from "../src/db/settings";

/** Entry gate: signed out → sign in; then onboarding once, then the Day panel. */
export default function Index() {
  const authed = useAuth();
  if (!authed) return <Redirect href="/auth" />;
  return <Redirect href={isOnboarded() ? "/day" : "/onboarding"} />;
}
