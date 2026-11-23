# syntax=docker/dockerfile:1
# The Kennwort server as an image (K-703, docs/installation.md): the compiled server and the signed
# web build (K-408), which the server serves itself with its security headers (KENNWORT_WEB_ROOT,
# docs/sicherheitsdesign.md P-16). The path docker/Dockerfile follows firsttris/workflows
# (docker-release.yml). Built from the repository root:
#
#   docker build -f docker/Dockerfile --build-arg SOURCE_DATE_EPOCH=<sequence> .
#
# SOURCE_DATE_EPOCH sets the release's sequence number (P-16); the release workflow passes the
# number the commit history gives, so the web build in the image is byte for byte the published one
# (it compares release.json). Without it the build takes its own time, fine for a local image.

# The Bun version of package.json (packageManager): the compiled server differs between versions
ARG BUN_VERSION=1.4.5

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /src
ARG SOURCE_DATE_EPOCH=""
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
COPY . .
# The postinstall step compiles the Paraglide texts the web app needs
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/web build && bun run --cwd apps/server build
# /data belongs to the unprivileged user the server runs as (distroless "nonroot", 65532)
RUN mkdir -p /out/data && cp apps/server/dist/kennwort-server /out/ && cp -R apps/web/dist /out/web

# Only the web build, for the release workflow to compare with the published release.json
FROM scratch AS web
COPY --from=build /out/web /

# glibc for the compiled Bun runtime, no shell, no package manager
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /out/kennwort-server /app/kennwort-server
COPY --from=build /out/web /app/web
COPY --from=build --chown=65532:65532 /out/data /data
# Settings of apps/server/src/config.ts only; the rest comes from the environment at run time
ENV KENNWORT_PORT=8100 \
    KENNWORT_DATABASE=/data/kennwort.db \
    KENNWORT_WEB_ROOT=/app/web
USER 65532:65532
EXPOSE 8100
VOLUME ["/data"]
# The image has no curl: the server binary asks its own /health (apps/server/src/operations)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/app/kennwort-server", "health"]
ENTRYPOINT ["/app/kennwort-server"]
