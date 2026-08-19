/**
 * Local Expo config plugin for Health Connect (APP-038).
 *
 * `react-native-health-connect`'s own plugin only adds the permissions-rationale
 * intent-filter. Reading data also needs, in the generated AndroidManifest:
 *   - the health READ permissions we actually use (active energy, steps, exercise, weight)
 *   - a <queries> entry so the app can see/launch the Health Connect package
 *   - the Android-14+ <activity-alias> privacy entry point (APP-107, see below)
 * and Health Connect requires minSdk 26. Because we use CNG (android/ is
 * gitignored and regenerated), these must live in a plugin, not a hand edit.
 *
 * Read-only scope on purpose (ponytail): only the record types a screen surfaces.
 * Add more permissions here when a screen actually reads more.
 */
const {
  withAndroidManifest,
  withProjectBuildGradle,
  withAppBuildGradle,
  withMainActivity,
} = require("@expo/config-plugins");

const READ_PERMISSIONS = [
  "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
  "android.permission.health.READ_STEPS",
  "android.permission.health.READ_EXERCISE",
  "android.permission.health.READ_WEIGHT", // APP-107: Library promises "weight & workouts"
];

const HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata";

/**
 * APP-107 — Android 14+ privacy-policy entry point.
 *
 * Pre-14, Health Connect launched the rationale via the legacy
 * `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent-filter on MainActivity
 * (react-native-health-connect's own plugin adds only that one). From Android 14 the
 * provider is a platform module and the framework instead looks for an
 * <activity-alias> answering VIEW_PERMISSION_USAGE + category HEALTH_PERMISSIONS.
 * Without it the system has nothing to launch — the exact symptom on the CEO's
 * Android 15 SM_S942B (no dialog, no logcat line, toggle reverts). Both filters ship;
 * the legacy one still serves Android 13 and below.
 */
const ALIAS_NAME = "ViewPermissionUsageActivity";

function addAlias(manifest) {
  const app = (manifest.application || [])[0];
  if (!app) return;
  app["activity-alias"] = app["activity-alias"] || [];
  if (app["activity-alias"].some((a) => a.$["android:name"] === ALIAS_NAME)) return;
  app["activity-alias"].push({
    $: {
      "android:name": ALIAS_NAME,
      "android:exported": "true",
      "android:targetActivity": ".MainActivity",
      "android:permission": "android.permission.START_VIEW_PERMISSION_USAGE",
    },
    "intent-filter": [
      {
        action: [{ $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } }],
        category: [{ $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } }],
      },
    ],
  });
}

function addPermissionsAndQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    addAlias(manifest);

    // <uses-permission> for each read scope (idempotent).
    manifest["uses-permission"] = manifest["uses-permission"] || [];
    for (const name of READ_PERMISSIONS) {
      const exists = manifest["uses-permission"].some((p) => p.$["android:name"] === name);
      if (!exists) manifest["uses-permission"].push({ $: { "android:name": name } });
    }

    // <queries><package android:name="com.google.android.apps.healthdata"/></queries>
    manifest.queries = manifest.queries || [];
    const hasQuery = manifest.queries.some((q) =>
      (q.package || []).some((pkg) => pkg.$["android:name"] === HEALTH_CONNECT_PACKAGE),
    );
    if (!hasQuery) manifest.queries.push({ package: [{ $: { "android:name": HEALTH_CONNECT_PACKAGE } }] });

    return cfg;
  });
}

const MIN_SDK_MARKER = "// APP-038: Health Connect requires minSdk 26";

function bumpMinSdk(config) {
  // Two layers, because Expo SDK 56 sets minSdk 24 via a version catalog and
  // react-native-gesture-handler now hard-floors minSdk 26 in its own module —
  // the app module must be >= every library's minSdk or the manifest merge fails.
  //
  // 1) Root ext override: raises minSdk for library modules that read
  //    rootProject.ext.minSdkVersion (e.g. Health Connect).
  config = withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MIN_SDK_MARKER)) {
      cfg.modResults.contents += `\n${MIN_SDK_MARKER}\next.minSdkVersion = 26\n`;
    }
    return cfg;
  });
  // 2) App module: force it directly. The app reads `rootProject.ext.minSdkVersion`
  //    but resolves it before the ext override applies, so pin it here — this is the
  //    module the merger failed on.
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /minSdkVersion\s+rootProject\.ext\.minSdkVersion/,
      "minSdkVersion 26",
    );
    return cfg;
  });
  return config;
}

const DELEGATE_IMPORT = "import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate";
const DELEGATE_CALL = "HealthConnectPermissionDelegate.setPermissionDelegate(this)";

function registerPermissionDelegate(config) {
  // react-native-health-connect requires the activity to register its
  // permission-request ActivityResultLauncher in onCreate (registerForActivityResult
  // must run before the activity resumes). The library's own Expo plugin does NOT do
  // this, so requesting permission crashes with `lateinit property requestPermission
  // has not been initialized`. Inject the one-liner the library README asks for.
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withHealthConnect expects a Kotlin MainActivity");
    }
    let src = cfg.modResults.contents;
    if (!src.includes(DELEGATE_IMPORT)) {
      src = src.replace(
        /(import expo\.modules\.ReactActivityDelegateWrapper)/,
        `$1\n\n${DELEGATE_IMPORT}`,
      );
    }
    if (!src.includes(DELEGATE_CALL)) {
      src = src.replace(/(super\.onCreate\(null\))/, `$1\n    ${DELEGATE_CALL}`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withHealthConnect(config) {
  config = addPermissionsAndQueries(config);
  config = bumpMinSdk(config);
  config = registerPermissionDelegate(config);
  return config;
};
