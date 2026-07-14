plugins {
    kotlin("jvm") version "2.2.21"
    kotlin("plugin.spring") version "2.2.21"
    id("org.springframework.boot") version "4.0.7"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
}

group = "com.llmagal.vita"
version = "0.1.0-SNAPSHOT"

kotlin {
    jvmToolchain(21)
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    implementation("org.springframework.boot:spring-boot-starter-data-jdbc")
    implementation("tools.jackson.module:jackson-module-kotlin") // Jackson 3 — Boot 4 MVC uses tools.jackson
    // ponytail: BE-013 ClaudeClient has a private Jackson 2 ObjectMapper for Anthropic payloads
    // (isolated from MVC's Jackson 3). Converge to tools.jackson later — tracked in BE-013 Progress.
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("io.micrometer:micrometer-core") // BE-014: parse token/cost counters (no actuator; version from Boot BOM)
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // BE-026/BE-027: real S3 presigner + KMS envelope, active only under the `aws` profile
    // (LocalStack in local tests, real AWS in prod). Beans are @Profile("aws") so the default
    // context — and ./gradlew check — never touch AWS; these jars just sit on the classpath.
    implementation(platform("software.amazon.awssdk:bom:2.30.0"))
    implementation("software.amazon.awssdk:s3") // includes the S3 presigner
    implementation("software.amazon.awssdk:kms")
    implementation("software.amazon.awssdk:url-connection-client") // one sync HTTP impl (SDK auto-discovers it)

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:postgresql:1.21.4")
    testImplementation("org.testcontainers:junit-jupiter:1.21.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("io.mockk:mockk:1.14.11")
    testImplementation("org.wiremock:wiremock-standalone:3.9.1") // BE-013: golden Claude responses (shaded, no Jackson clash)
}

detekt {
    buildUponDefaultConfig = true // ponytail: default rules, no custom config file until a rule actually gets in the way
}

// Official detekt workaround: detekt 1.23.x is compiled against Kotlin 2.0.21 and
// fails when the project's Kotlin 2.2.21 leaks onto its classpath.
configurations.matching { it.name == "detekt" }.all {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin") {
            useVersion("2.0.21")
        }
    }
}

// Scope the exclusion to the default `test` task only — the opt-in tasks below set their own
// include filter, and a global excludeTags here would also exclude the very tag they include.
tasks.named<Test>("test") {
    // Excluded from the default build:
    //  - live: hits api.anthropic.com and spends budget (BE-014).
    //  - localstack: needs LocalStack up (BE-026/BE-027) — keeps `check` AWS-free & docker-free (D9).
    useJUnitPlatform { excludeTags("live", "localstack") }
}

// On-demand live Claude eval: ./gradlew liveEval (needs ANTHROPIC_API_KEY in the env).
tasks.register<Test>("liveEval") {
    description = "Runs the live Claude API parse eval (@Tag(\"live\"))."
    group = "verification"
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    useJUnitPlatform { includeTags("live") }
}

// On-demand LocalStack adapter tests (BE-026/BE-027): the real S3/KMS adapters against :4566.
// Start LocalStack first: cd backend/services/vita-api && docker compose --profile localstack up -d
// Then: ./gradlew localstackTest
tasks.register<Test>("localstackTest") {
    description = "Runs the S3/KMS adapter tests against LocalStack (@Tag(\"localstack\"))."
    group = "verification"
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    useJUnitPlatform { includeTags("localstack") }
}
