import { Redirect } from "expo-router";
import { isOnboarded } from "../src/db/settings";

/** Entry gate: first launch goes through onboarding, after that straight to Today. */
export default function Index() {
  return <Redirect href={isOnboarded() ? "/home" : "/onboarding"} />;
}
