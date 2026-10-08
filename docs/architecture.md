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
bun run api:types
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
2. Run `bun run api:types` in this repo.
3. Add a typed wrapper in `src/lib/api/`.
4. Pass SvelteKit's provided `fetch` from route/load boundaries instead of relying on `globalThis.fetch`.
5. Add unit tests around URL building, error handling, and response validation.
6. Keep visual route behavior separate from API wiring so layout changes and data changes remain reviewable.

## Discord Management

`/manage/discord` is the responsive editor behind the console's own ✦ Discord category.
The Rust Sierra module in `sequoia-backend` owns authorization, definition validation,
database persistence, Discord delivery, emoji uploads and role-button dispatch. The Svelte
component owns only the editable workspace and preview; WASM adds no useful boundary here.

The message browser (`src/lib/discord/navigation.ts`) arranges Rust's existing context and
listing metadata as Discord's server › channel › thread hierarchy: reviewed threads sit under
the parent their import source records, and drafts without a destination stay apart. It adds
no requests. On narrow workspaces the list and the open message alternate, with a shallow
history entry so the device's back gesture returns to the list instead of leaving the page.

Sierra decides who may manage Discord messages (Senior Moderators, Treants and higher,
leadership, full Community/Military/Development branch members and website admins). The
sidebar and navbar ask its `/v1/access` probe through the same-origin adapter, memoized per
viewer like the bag-shop staff flag: only grants and denials are cached, display peeks wait
at most 150 ms from the check's start, and an outage hides the category instead of slowing
navigation. The `/manage` landing and every page/API call re-authorize fresh in Rust.

The live preview parses Discord's markdown dialect with `discord-markdown-parser` into a
typed AST (`src/lib/discord/markdown.ts`) and renders it with Svelte elements, never HTML.
That module adds Discord list syntax and correct line starts for headings and subtext, which
the parser lacks, and only keeps http(s) link targets. `parser.d.ts` types the small parser
surface used because the package's bundled declarations fail this project's strict library
checks. The preview approximates Discord's dark theme with the site's text face; Discord's
own clients decide the final rendering, and unicode emoji use the device's emoji font.
Standard emoji shortcodes use Emojibase's JoyPixels preset (its Discord alias) inside the
markdown grammar, so code, escapes and link destinations are not rewritten. The pinned
dataset is bundled locally; preview rendering makes no emoji-data network requests.

Set server-only `SEQUOIA_DISCORD_MANAGEMENT_URL=http://<private-sierra-service>:8082` on
both websites after enabling Sierra's `SEQUOIA_SIERRA_MANAGEMENT_BIND` on the private
container network. Do not publish Sierra's listener or use a `PUBLIC_` URL variable.
The BFF forwards the HttpOnly `seq_session` cookie to Rust's existing session authority,
rejects cross-origin JSON writes, disables caching and does not accept browser-supplied
Bearer credentials. Missing configuration renders an unavailable gate, not a fake editor.

Definitions have distinct saved and published revisions. Saving never edits Discord;
publication is explicit and read back. Uncertain delivery requires recovery by exact message
link instead of a blind retry. Exact reviewed maintained panels can use durable image
attachments and bounded Components V2 text layouts. Import, replacement publication and
original retirement are separate gates, with source/order/reference and actual byte checks
owned by Rust. Automated application/trial messages, separately managed controls and other
people's integrations remain under their existing workflow owners. Server emoji
uploads affect the guild immediately and are shown separately from draft publication.
See the backend's `docs/sierra-discord-management.md` for admission, protected-role setup,
bootstrap, persistence and recovery operations.
