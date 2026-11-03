# Architecture

## Ownership

- `frontend/` is the SvelteKit website. Its server owns website data in libSQL (`src/lib/server/db.ts`): events, posts, presets, the audit log and API caches. It reads guild and player data from the Wynncraft API and from `sequoia-backend`, a separate repository.
- `backend/` is the Rust raid tracker. It owns its own Postgres database; see [raid-tracking.md](raid-tracking.md).
- Discord management is owned by Sierra, a module of `sequoia-backend`. The website only proxies to it.

Inside `frontend/src`:

- `lib/site/` owns site structure: sections, pages, breadcrumbs, tabs, homepage cards and the brand (`brand.ts`).
- `lib/components/` and `lib/design-system/` own reusable components without route-specific data fetching.
- `lib/config/` owns browser-safe public configuration.
- `lib/api/` owns generated API types and handwritten API clients.
- `lib/server/` owns server-only data access and authorization.
- `routes/` composes these modules instead of repeating navigation, API URLs or shared styles.

## API contract

`src/lib/api/generated/public-api.ts` is generated from `sequoia-backend`'s `openapi/public.yaml` and checked in, so install, check, test and build don't need that repository. To regenerate it, check `sequoia-backend` out next to this repository and run `bun run api:types`. Don't edit the generated file by hand.

Handwritten clients wrap the generated types and return explicit result objects instead of throwing into route components. Create them with an explicit `fetch`: in `load` functions, server routes and actions, pass SvelteKit's `fetch` so same-origin calls work during SSR. Browser-only code such as event handlers can pass `globalThis.fetch.bind(globalThis)`.

## Deployment

The website supports two API routing modes:

- `PUBLIC_SEQUOIA_API_BASE_URL=https://api.seqwawa.com` for a separate backend origin.
- `PUBLIC_SEQUOIA_API_BASE_URL=same-origin` when the proxy routes `/public/**` and `/auth/web/**` from the web origin to `sequoia-backend`.

In same-origin mode the proxy must forward both prefixes. `/auth/web/**` carries sign-in, the session probe that resolves the layout's viewer, and logout; without it every visitor renders as signed out.

Player skin renders use `PUBLIC_NMSR_BASE_URL`, defaulting to `https://api.seqwawa.com/nmsr`. Set it to `same-origin` if the web origin proxies `/nmsr/**`. Local development defaults the API to `http://localhost:8081`.

### Container runtime user

Both images run as the fixed unprivileged user `10001:10001`. Application files are owned by root and read-only to that user.

- **Frontend:** the only writable path is `/app/frontend/.data`, where the default `SEQUOIA_WEB_DB_URL` keeps its SQLite file. Deployments that use Turso/libSQL (`TURSO_DATABASE_URL`) need no writable path. The health check calls `/healthz`, which turns unhealthy once the SIGUSR2 drain starts.
- **Backend:** nothing in the image is writable. The health check calls `/ready`, so the container reports unhealthy, and stops receiving traffic, while Postgres is unreachable, polling is unconfigured or the last successful poll is stale. The probe uses the default port 8080; a custom `BIND_ADDR` port needs a matching health check.

Docker gives a new, empty named volume the image's ownership of `.data`. An existing volume keeps its current owner, and the image never changes it. Before switching an existing frontend deployment to this image, check the volume's owner without changing anything:

```sh
docker run --rm -v <volume>:/data:ro alpine:3 stat -c '%u:%g %n' /data /data/sequoia-web.db
```

If the owner is not `10001:10001`, pick one before rollout:

- grant the existing volume to `10001:10001` once, as an explicit operator step
- start on a new volume; the API cache rebuilds on its own, but events, presets and audit history do not move over, so copy the old file first if that data must survive
- use Turso and no local volume

Do not roll out until that is resolved: the new image cannot write a root-owned database file.

### HTTP security headers

The app sets its own browser security policy. Nothing depends on the reverse proxy adding it.

- **Content Security Policy** is enforced on every page: SvelteKit's `csp` option in `vite.config.ts`, built by `src/lib/config/csp.ts`. Kit adds a nonce to each script it renders, so no inline or eval script is allowed.
  - Markup `style` attributes are allowed through `style-src-attr`; they cannot run script.
  - Images may come from the site itself, NMSR skin renders, `assets.seqwawa.com`, Discord emoji and the event raid icons on `api.seqwawa.com` (`RAID_ICON_BASE` in `src/lib/events/raidIcons.ts`).
  - Forms may submit to the site and to the API origin, because saving linked accounts redirects through the API's session refresh.
  - Browser code connects only to the site's own origin.
  - Frames, plugins and embedding are all denied.
- **Staff exception:** the Discord editors under `/manage/discord` also allow any HTTPS image, because they preview embed images from wherever a message points.
  - A document keeps the policy it was loaded with, so client-side navigation into or out of `/manage/discord` reloads as a new document (`onNavigate` in `src/routes/+layout.svelte`). Links, `goto` and back/forward keep their history entries. Navigation within either side stays client-side.
- **The API and NMSR origins** come from the same build-time `PUBLIC_*` values the app uses. Whether the policy defaults to a local API follows the Vite lifecycle (dev server versus build), not the mode name.
- **Every app response, endpoints included,** gets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a `Permissions-Policy` that turns off camera, microphone, geolocation, payment and USB (`src/lib/server/securityHeaders.ts`).
- **HSTS** (`max-age=31536000`, this host only) is sent only when the request arrived over HTTPS, which behind the proxy comes from `PROTOCOL_HEADER`.
  - `includeSubDomains` and `preload` are left off: they would commit every `*.seqwawa.com` service to HTTPS, which is an owner decision.
- **Static files** that adapter-node serves before the app's handler (`/_app/*`, `/assets/*`) do not pass through these hooks. Add `nosniff` and HSTS for them at the proxy if wanted.

After deploying, read the headers back from the live origin with `curl -sI`. Check that the proxy neither drops them nor adds a second CSP, then watch the browser console on member and manager pages for `Content-Security-Policy` violations.

## Adding Pages

Add page metadata to `src/lib/site/nav.ts`, then keep route files small by consuming `pageView(...)`, `PageHeader`, `SectionTabs`, `SubpageGrid`, and `Placeholder`. If a page should be addressable but not displayed as a normal card, add it to `EXTRA_PAGES`.

## Adding Public API Features

1. Add or update the backend endpoint and `openapi/public.yaml` in `sequoia-backend`.
2. Run `bun run api:types`.
3. Add a typed wrapper in `src/lib/api/` and pass SvelteKit's `fetch` from route and load boundaries.
4. Test URL building, error handling and response validation.

## Discord management

`/manage/discord` edits Discord messages, welcome messages, achievement ceremonies and the achievement catalog. Sierra owns authorization, validation, persistence, Discord delivery, emoji uploads and previews; the Svelte pages own only the editable workspace.

- **Configuration:** set server-only `SEQUOIA_DISCORD_MANAGEMENT_URL` to Sierra's private management listener. Don't publish that listener or use a `PUBLIC_` variable. Without it the pages show an unavailable gate.
- **Proxy:** the same-origin adapter under `/manage/discord/api` forwards the HttpOnly `seq_session` cookie, rejects cross-origin writes, disables caching, ignores browser-supplied bearer credentials and forwards only an allowlist of management paths, with fixed methods for the welcome, ceremony and catalog settings.
- **Authorization:** the navbar and sidebar ask Sierra's `/v1/access` probe and cache only grants and denials; an outage hides the category. Every page load and API call re-authorizes in Sierra.
- **Saves** send the version they edited. A 409 keeps the edits until staff reload. Saving a message definition never edits Discord; publishing is a separate, read-back step, and uncertain delivery is recovered by message link rather than retried.
- **Previews** are rendered by Sierra from the same code as real messages, use the viewer's own identity and are never posted.

The preview markdown is parsed by `discord-markdown-parser` into a typed AST (`src/lib/discord/markdown.ts`) and rendered with Svelte elements, never HTML. Only http(s) link targets are kept. Emoji shortcode data is bundled, so previews make no emoji network requests.

See `sequoia-backend`'s `docs/sierra-discord-management.md` for admission rules, setup and recovery.
