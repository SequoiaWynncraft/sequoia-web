FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY frontend/package.json frontend/package.json
COPY frontend/bunfig.toml frontend/bunfig.toml
RUN bun install --frozen-lockfile

FROM deps AS build
COPY frontend frontend
RUN bun run --cwd frontend build

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

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/frontend/node_modules /app/frontend/node_modules
COPY --from=build /app/frontend/build build
COPY --from=build /app/frontend/package.json package.json
COPY frontend/retirement.js retirement.js
COPY frontend/server.js server.js

EXPOSE 3000
CMD ["bun", "./server.js"]
