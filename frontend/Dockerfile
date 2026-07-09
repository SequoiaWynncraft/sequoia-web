FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY frontend frontend
RUN pnpm --dir frontend build

FROM node:22-alpine AS runtime
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/frontend/node_modules /app/frontend/node_modules
COPY --from=build /app/frontend/build build
COPY --from=build /app/frontend/package.json package.json

EXPOSE 3000
CMD ["node", "build"]
