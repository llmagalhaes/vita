/**
 * Local Expo config plugin for Health Connect (APP-038).
 *
 * `react-native-health-connect`'s own plugin only adds the permissions-rationale
 * intent-filter. Reading data also needs, in the generated AndroidManifest:
 *   - the health READ permissions we actually use (active energy, steps, exercise)
 *   - a <queries> entry so the app can see/launch the Health Connect package
 * and Health Connect requires minSdk 26. Because we use CNG (android/ is
 * gitignored and regenerated), these must live in a plugin, not a hand edit.
 *
 * Read-only scope on purpose (ponytail): only the three record types the Energy
 * card surfaces. Add more permissions here when a screen actually reads more.
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
];

const HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata";

function addPermissionsAndQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

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
