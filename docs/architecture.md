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

### Personalized welcomes

`/manage/discord/welcome` lives under the same Discord category and admission rule.
Its server load asks Rust for fresh welcome configuration before reading channel choices;
it never authorizes from the console layout's cached capabilities. The existing private
adapter permits only GET/PUT `welcome` and POST `welcome/preview`, including private,
uncached PNG/GIF bytes from the renderer. No preview sends a Discord message.

The Svelte workspace holds one editable settings object and the last saved response.
Version conflicts retain edits until staff explicitly reload, and navigation protects
unsaved changes with a reachable focused status. Odds are relative integer weights.
Clean drafts show Rust's saved percentages; dirty drafts show display-only proposed shares
over enabled weights, labeled "after save". Asset readiness is a separate enable guard,
not another odds filter. Staff can edit up to five welcome link labels and HTTPS URLs
through the same settings draft. Rust validates their content. The recurring winter window includes
both dates in UTC, with explicit normal/winter overrides. Rust validates destinations,
known variants, dates, readiness and positive eligible weights.
The website's display-only enable guard evaluates the complete proposed eligibility and
destination, so disabling or zeroing a pending motif and enabling ready motifs needs only
one save. Destination problems are shown separately from pending normal/winter artwork.

Sky effects form an independent percentage category, separate from welcome variant weights.
The sky-category total is at most 100; unused percentage means no effect. Aurora defaults
to 35% with 65% no effect once both seasonal bundles are ready. Pending effect artwork
falls back to no effect without blocking emergency disable. The editor shows Rust's saved
effective chances or readiness-aware proposed chances for the draft.

Previews use the authenticated member's real avatar and an optional sample display name.
Their explicit-fetch binary client lives in `src/lib/api/welcome.ts`; cancellation serials,
object URLs and playback remain in the Svelte workspace.
They call the same Rust renderer as member joins, never a browser compositor or WASM.
The explicit sky-effect preview choice is independent of saved odds and defaults to no effect.
It participates in the exact PNG/GIF cache identity. Effect selection changes retain the
correctly labeled previous still, like other non-message preview changes.
One selected PNG still loads at a time. Previous/next controls compare motifs without
returning to the odds list. Replacement requests retain the correctly labeled previous
image until actual new bytes arrive when changing motif, season or sample name.
Headline, subtitle or font edits clear the old image immediately so outdated copy is not shown.
Play animation explicitly requests a GIF and returns
to its one cached exact-identity PNG after the authored 16-second loop, without another
render. Reduced-motion changes stop ongoing or pending animation playback.

### Achievement ceremonies

`/manage/discord/ceremonies` follows the welcome page: same Discord category and admission
rule, a fresh Rust load before channel choices, and a private adapter that permits only
GET/PUT `ceremonies` and POST `ceremonies/preview` (private, uncached PNG/GIF bytes).
The workspace edits one settings draft: the enable switch, destination channel and
relative integer story weights for the stories in Sierra's catalog. Clean drafts show Rust's
saved chances; dirty drafts show display-only shares labeled "after save". Saves send the
version, keep edits on a 409 until staff reload, and navigation protects unsaved changes.
Enabling stays unavailable until the bundle is installed. Season and night follow the welcome
schedule, so the page only shows the scene in effect.

Previews render the viewer's own head and in-game name with sample tier, raid and count
values through `src/lib/api/ceremony.ts`. They carry a DEMO stamp and are never posted.
As scheduled pins the scene from the last loaded response, so stills, playback and retries
match. One exact-identity PNG is cached; Play animation requests a GIF and returns to it after
the 32-second loop. Saves are audited as `ceremony.settings.save` and the audit log summarizes
enabled, destination and changed story rows.
Missing artwork remains a visible pending state, not a substitute image or fake success.
Saving configuration changes future joins, not previously delivered messages. Automatic
delivery remains disabled until the deployment owner verifies the separate Java cutover.

### Achievement catalog

`/manage/discord/achievements` edits achievement milestones, names, styles and enabled
categories. It uses the same Discord category and a fresh Rust load, and the private adapter
permits only GET/PUT `achievements/catalog`. Rust owns validation, milestone ids, defaults and
award claims; the page only mirrors limits as hints and sends new milestones without an id.
Saves send the version and keep edits on a 409 until staff reload. Saved milestones preview
through POST `ceremonies/preview` with `{milestone: {key, id}}`. Saves are audited as
`achievements.catalog.save`, summarized per changed category.
