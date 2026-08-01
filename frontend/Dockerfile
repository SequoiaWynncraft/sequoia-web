FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json frontend/package.json
COPY frontend/bunfig.toml frontend/bunfig.toml
RUN bun install --frozen-lockfile

FROM deps AS build
COPY frontend frontend
RUN bun run --cwd frontend build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV PORT=3000
# Coolify keeps the retiring container discoverable until it exits. Bound
# adapter-node's drain so Traefik cannot route to a closed listener for 30s.
ENV SHUTDOWN_TIMEOUT=0
# The container only ever sits behind the reverse proxy, so derive the site
# origin from its forwarded headers - form actions 403 on a wrong origin.
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/frontend/node_modules /app/frontend/node_modules
COPY --from=build /app/frontend/build build
COPY --from=build /app/frontend/package.json package.json

EXPOSE 3000
CMD ["bun", "./build/index.js"]
