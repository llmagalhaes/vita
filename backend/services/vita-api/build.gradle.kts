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
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

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

tasks.withType<Test> {
    useJUnitPlatform()
}
