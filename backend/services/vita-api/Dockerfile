# syntax=docker/dockerfile:1
#
# vita-api image for AWS Graviton (linux/arm64), BE-004 / OPS-014.
# Build:  docker build --platform linux/arm64 -t vita-api .
#
# The build stage is arch-neutral: JVM bytecode is portable, so we compile on the
# host arch (BUILDPLATFORM) with no QEMU emulation, and only the runtime stage is
# pulled for linux/arm64. That keeps cross-builds fast.

# ---- build: compile the Boot fat jar ---------------------------------------
FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY . .
# Cache the Gradle home (downloaded deps + wrapper dist) across builds.
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew --no-daemon clean bootJar -x test

# ---- runtime: slim JRE on linux/arm64 --------------------------------------
FROM eclipse-temurin:21-jre AS runtime
# curl for the container HEALTHCHECK (the slim JRE image has no http client).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system vita \
    && useradd --system --gid vita --home-dir /app --shell /usr/sbin/nologin vita \
    && mkdir -p /app && chown vita:vita /app
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
USER vita
EXPOSE 8080
# JVM is container-aware by default on 21; cap the heap to a share of the cgroup limit.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0"
# Hits the existing DB-backed /health (there is no actuator dependency — ponytail).
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
