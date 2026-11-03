FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json frontend/package.json
COPY frontend/bunfig.toml frontend/bunfig.toml
RUN bun install --frozen-lockfile

FROM deps AS build
COPY frontend frontend
RUN bun run --cwd frontend build

# adapter-node bundles devDependencies into the build, so the runtime needs
# only production packages. Pruning keeps the lockfile's exact versions.
FROM deps AS production-deps
RUN bun prune --production

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS runtime
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV PORT=3000
# Match Sierra's 14 MiB JSON limit, including base64 for a supported 10 MiB image.
ENV BODY_SIZE_LIMIT=14M
# The app keeps its listener open while active requests finish, then exits in
# one step so the retiring container is never a dead Traefik endpoint.
STOPSIGNAL SIGUSR2
# The container only ever sits behind the reverse proxy, so derive the site
# origin from its forwarded headers - form actions 403 on a wrong origin.
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host

# A fixed unprivileged identity. Application files stay root-owned and
# read-only; only the SQLite directory is writable. Docker seeds a new named
# volume mounted there with this ownership, but an existing volume keeps its
# own.
RUN addgroup -S -g 10001 sequoia \
    && adduser -S -D -H -h /nonexistent -s /sbin/nologin -u 10001 -G sequoia sequoia \
    && mkdir .data \
    && chown 10001:10001 .data

COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=production-deps /app/frontend/node_modules /app/frontend/node_modules
COPY --from=build /app/frontend/build build
COPY --from=build /app/frontend/package.json package.json
COPY frontend/retirement.js retirement.js
COPY frontend/server.js server.js

USER 10001:10001
EXPOSE 3000
# /healthz turns 503 once SIGUSR2 starts the drain, so a retiring container
# also reports unhealthy. Busybox wget ships in the base image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["bun", "./server.js"]
