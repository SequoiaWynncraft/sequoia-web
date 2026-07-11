# Architecture

This repository is the public SvelteKit web app. The backend owns data ingestion, persistence, API validation, and OpenAPI contracts. The web app should not connect directly to Postgres or any other database.

## Module Boundaries

- `src/lib/site/` owns static site structure: top-level sections, child pages, breadcrumbs, tabs, homepage cards, and placeholder metadata.
- `src/lib/components/` owns reusable Svelte components without route-specific data fetching.
- `src/lib/config/` owns browser-safe public runtime configuration.
- `src/lib/api/` owns generated API types and handwritten API clients.
- `src/routes/` should compose modules instead of defining duplicate navigation, API URLs, or shared styles.

## Backend Boundary

The public website consumes `../sequoia-backend/src/main/resources/openapi/public.yaml` through:

```sh
pnpm api:types
```

Generated files live under `src/lib/api/generated/` and should not be edited by hand. Handwritten clients should wrap generated types and return explicit result objects instead of throwing into route components.

Create API clients with an explicit `fetch`. In SvelteKit `load` functions, server routes, and actions, pass SvelteKit's provided `fetch` so same-origin calls work during SSR and prerendering. Browser-only code paths such as event handlers can pass `globalThis.fetch.bind(globalThis)` explicitly.

## Coolify Deployment

Both `sequoia-web` and `sequoia-backend` can run on the same Coolify VPS. The web app supports two public API routing modes:

- `PUBLIC_SEQUOIA_API_BASE_URL=https://api.seqwawa.com` for a separate backend origin.
- `PUBLIC_SEQUOIA_API_BASE_URL=same-origin` when the proxy routes `/public/**` and `/auth/web/**` from the web origin to the backend service.

For same-origin production deploys, configure Coolify or the front proxy to forward `/public/**` **and** `/auth/web/**` to `sequoia-backend` on its application port, typically `8081`. `/auth/web/**` carries website sign-in, the session probe (`/auth/web/me` resolves the layout `viewer`, which member-gated pages like the raid leaderboard authorize against), and logout — without it, same-origin deploys render every visitor as signed out. Keep Postgres credentials on the backend service only; the web app should reach homepage stats through `/public/homepage/stats`. No current deployment uses same-origin mode; both live frontends point at `https://api.seqwawa.com`.

Player skin renders use `PUBLIC_NMSR_BASE_URL`, defaulting to the public NMSR route at `https://api.seqwawa.com/nmsr`. If the web origin also proxies `/nmsr/**`, set `PUBLIC_NMSR_BASE_URL=same-origin`; backend/container-only calls can use the internal Coolify service URL `http://nmsr:8080`.

Local development defaults to `http://localhost:8081` when no value is configured.

## Adding Pages

Add page metadata to `src/lib/site/nav.ts`, then keep route files small by consuming `pageView(...)`, `PageHeader`, `SectionTabs`, `SubpageGrid`, and `Placeholder`. If a page should be addressable but not displayed as a normal card, add it to `EXTRA_PAGES`.

## Adding Public API Features

1. Add or update the backend endpoint and `openapi/public.yaml`.
2. Run `pnpm api:types` in this repo.
3. Add a typed wrapper in `src/lib/api/`.
4. Pass SvelteKit's provided `fetch` from route/load boundaries instead of relying on `globalThis.fetch`.
5. Add unit tests around URL building, error handling, and response validation.
6. Keep visual route behavior separate from API wiring so layout changes and data changes remain reviewable.
