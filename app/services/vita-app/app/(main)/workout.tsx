// v3 route, kept alive only so existing `router.replace` call sites still land
// somewhere real while v4 lands: everything this screen showed now lives in the Day
// panel. APP-108 deletes this file and its call sites.
import { Redirect } from "expo-router";

export default function WorkoutRoute() {
  return <Redirect href="/day" />;
}
