plugins {
    // Auto-provisions the JDK 21 toolchain when the running JVM differs (CI, fresh machines).
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "vita-api"
