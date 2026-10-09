<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import { requestDiscord } from "$lib/api/discordManagement";
  import { requestWelcomePreview } from "$lib/api/welcome";
  import Button from "$lib/design-system/components/Button.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormStatus from "$lib/design-system/components/forms/FormStatus.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import NumberInput from "$lib/design-system/components/forms/NumberInput.svelte";
  import Select from "$lib/design-system/components/forms/Select.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";
  import ConfirmDialog from "$lib/design-system/components/forms/ConfirmDialog.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import { welcomeChance, welcomeInputIssue, welcomeReadinessIssue, type WelcomeSeason, type WelcomeState } from "./welcome";
  import type { DiscordContext } from "./types";

  let { initial, channels }: { initial: WelcomeState; channels: DiscordContext["channels"] } = $props();
  // The saved response seeds one local draft; Rust owns persistence and normalization.
  // svelte-ignore state_referenced_locally
  let saved = $state(structuredClone(initial));
  // svelte-ignore state_referenced_locally
  let draft = $state(structuredClone(initial.settings));
  // svelte-ignore state_referenced_locally
  let selectedId = $state(initial.catalog[0]?.id ?? "");
  // svelte-ignore state_referenced_locally
  let season = $state<WelcomeSeason>(initial.effective_season);
  // svelte-ignore state_referenced_locally
  let sampleName = $state(initial.viewer.display_name);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let conflict = $state(false);
  let reloadDialog = $state<ConfirmDialog>();
  let discardDialog = $state<ConfirmDialog>();
  let previewUrl = $state("");
  let previewIdentity = $state<{ key: string; description: string } | null>(null);
  let previewError = $state<string | null>(null);
  let previewBusy = $state(false);
  let animated = $state(false);
  let navigationBlocked = $state(false);
  let saveStatus = $state<HTMLDivElement>();
  let pngCache: { url: string; key: string; description: string } | undefined;
  let pendingFormat: "png" | "gif" | null = null;
  let controller: AbortController | undefined;
  let playbackTimer: ReturnType<typeof setTimeout> | undefined;
  let serial = 0;

  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved.settings));
  const issue = $derived(welcomeInputIssue(draft));
  const readinessIssue = $derived(welcomeReadinessIssue(draft, saved.catalog));
  const draftReady = $derived(readinessIssue === null);
  const selected = $derived(saved.catalog.find((item) => item.id === selectedId));
  const previewReady = $derived(selected?.[season === "winter" ? "winter_ready" : "normal_ready"] === true);
  const chanceById = $derived(new Map(saved.effective_chances.map((item) => [item.id, item.percent])));
  // Display-only normalization matches Rust Settings::chances. Asset readiness is a separate enable guard.
  const proposedChances = $derived.by(() => {
    if (draft.variants.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 1000)) return null;
    const total = draft.variants.reduce((sum, item) => sum + (item.enabled ? item.weight : 0), 0);
    if (total === 0) return null;
    return new Map(draft.variants.map((item) => [item.id, item.enabled ? item.weight * 100 / total : 0]));
  });
  const displayedChances = $derived(dirty ? proposedChances : chanceById);
  const catalogById = $derived(new Map(saved.catalog.map((item) => [item.id, item])));
  const destinationChannels = $derived(channels.filter((channel) => channel.archived === undefined));
  const knownChannel = $derived(destinationChannels.some((item) => item.id === draft.channel_id));
  const previewRequest = $derived({
    key: JSON.stringify([selectedId, season, sampleName || saved.viewer.display_name]),
    id: selectedId, season, name: sampleName || saved.viewer.display_name,
    description: `${selected?.label ?? "Welcome"}, ${season} version for ${sampleName || saved.viewer.display_name}`,
  });
  const selectedIndex = $derived(draft.variants.findIndex((item) => item.id === selectedId));
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  beforeNavigate(({ cancel }) => {
    if (dirty) {
      cancel(); navigationBlocked = true; error = "Save your changes before leaving, or discard them.";
      void tick().then(() => { saveStatus?.scrollIntoView({ block: "center", behavior: "instant" }); saveStatus?.focus({ preventScroll: true }); });
    }
  });

  function cancelPreview() {
    controller?.abort();
    clearTimeout(playbackTimer);
    serial += 1;
    previewBusy = false;
    pendingFormat = null;
  }

  function showCachedStill() {
    cancelPreview();
    if (!pngCache) return;
    if (previewUrl && previewUrl !== pngCache.url) URL.revokeObjectURL(previewUrl);
    previewUrl = pngCache.url;
    previewIdentity = { key: pngCache.key, description: pngCache.description };
    animated = false;
  }

  function clearPreview() {
    cancelPreview();
    if (previewUrl && previewUrl !== pngCache?.url) URL.revokeObjectURL(previewUrl);
    if (pngCache) URL.revokeObjectURL(pngCache.url);
    pngCache = undefined; previewUrl = ""; previewIdentity = null; animated = false;
  }

  async function renderPreview(input: typeof previewRequest, format: "png" | "gif") {
    cancelPreview();
    previewError = null;
    if (format === "png" && pngCache?.key === input.key) { showCachedStill(); return; }
    // Animation always has an exact-identity still to return to without another render.
    if (format === "gif" && pngCache?.key !== input.key) return;
    previewBusy = true;
    pendingFormat = format;
    const requestSerial = serial;
    controller = new AbortController();
    try {
      const result = await requestWelcomePreview(globalThis.fetch.bind(globalThis), {
        variant_id: input.id, season: input.season, display_name: input.name, format,
      }, controller.signal);
      if (requestSerial !== serial) return;
      if (!result.ok) { previewError = result.error.message; return; }
      const nextUrl = URL.createObjectURL(result.data);
      if (previewUrl && previewUrl !== pngCache?.url) URL.revokeObjectURL(previewUrl);
      if (format === "png") {
        if (pngCache) URL.revokeObjectURL(pngCache.url);
        pngCache = { url: nextUrl, key: input.key, description: input.description };
      }
      previewUrl = nextUrl;
      previewIdentity = { key: input.key, description: input.description };
      animated = format === "gif";
      // Authored loops are 16 seconds. Return to a still after one requested playback.
      if (animated) playbackTimer = setTimeout(showCachedStill, 16_000);
    } catch (cause) {
      if (requestSerial === serial && !(cause instanceof DOMException && cause.name === "AbortError")) {
        previewError = cause instanceof Error ? cause.message : "Could not reach the welcome renderer.";
      }
    } finally {
      if (requestSerial === serial) { previewBusy = false; pendingFormat = null; }
    }
  }

  $effect(() => {
    const input = previewRequest;
    const ready = previewReady;
    untrack(() => { cancelPreview(); if (animated) showCachedStill(); });
    previewError = null;
    if (!ready) { untrack(clearPreview); return; }
    if (untrack(() => pngCache?.key === input.key)) { untrack(showCachedStill); return; }
    previewBusy = true;
    const timer = setTimeout(() => void renderPreview(input, "png"), 350);
    return () => { clearTimeout(timer); cancelPreview(); };
  });

  onMount(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    function motionChanged() {
      if (query.matches && (animated || pendingFormat === "gif")) showCachedStill();
    }
    query.addEventListener("change", motionChanged);
    return () => { query.removeEventListener("change", motionChanged); clearPreview(); };
  });

  function received(next: WelcomeState) {
    saved = next;
    draft = structuredClone(next.settings);
    conflict = false;
    error = null;
    navigationBlocked = false;
  }

  async function save() {
    if (busy || !dirty || issue || conflict || (draft.enabled && !draftReady)) return;
    busy = true; error = null; notice = null; navigationBlocked = false;
    // Freeze the sent draft. Controls stay disabled until normalization returns.
    const result = await requestDiscord<WelcomeState>(globalThis.fetch.bind(globalThis), "welcome", "PUT", $state.snapshot(draft));
    busy = false;
    if (!result.ok) {
      conflict = result.error.status === 409;
      error = conflict ? "Someone saved newer settings. Your changes are still here. Reload the saved settings before editing again." : result.error.message;
      return;
    }
    received(result.data);
    notice = "Changes saved. Future joins use these settings.";
  }

  async function reloadSaved() {
    busy = true; error = null; notice = null; navigationBlocked = false;
    const result = await requestDiscord<WelcomeState>(globalThis.fetch.bind(globalThis), "welcome");
    busy = false;
    if (!result.ok) { error = result.error.message; return; }
    received(result.data);
    notice = "Saved settings loaded.";
  }

  function discard() {
    draft = structuredClone($state.snapshot(saved.settings));
    error = conflict ? "Reload the saved settings to resolve the version conflict." : null;
    notice = null;
    navigationBlocked = false;
  }

  function selectVariant(id: string) {
    selectedId = id;
    const preview = document.getElementById("welcome-preview");
    const bounds = preview?.getBoundingClientRect();
    if (window.matchMedia("(max-width: 1180px)").matches && bounds && (bounds.top < 80 || bounds.top >= window.innerHeight)) preview?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function nextVariant(direction: number) {
    if (!draft.variants.length) return;
    selectedId = draft.variants[(selectedIndex + direction + draft.variants.length) % draft.variants.length].id;
  }
</script>

<ManageHeader area="Discord" title="Welcome messages" lead={`Automatic welcomes are ${saved.settings.enabled ? "on" : "off"}. ${saved.effective_season === "winter" ? "Winter" : "Normal"} season is active.`} />

<div class="welcome-workspace">
  <section class="settings" aria-label="Welcome settings">
    <fieldset disabled={busy}>
      <div class="section-head">
        <h2>Member welcomes</h2>
        <span class="saved-state">Saved version {saved.settings.version}</span>
      </div>
      <Toggle bind:checked={draft.enabled} label="Welcome new members" disabled={!draftReady && !draft.enabled} />
      {#if readinessIssue}
        <p class="readiness" role="status">{readinessIssue}</p>
      {/if}
      <Field label="Destination channel">
        {#if destinationChannels.length > 0}
          <Select bind:value={draft.channel_id}>
            {#if !knownChannel}<option value={draft.channel_id}>{draft.channel_id || "Choose a channel"}</option>{/if}
            {#each destinationChannels as channel (channel.id)}
              <option value={channel.id}>#{channel.name}</option>
            {/each}
          </Select>
        {:else}
          <TextInput bind:value={draft.channel_id} inputmode="numeric" />
        {/if}
      </Field>

      <div class="section-head season-head"><h2>Season</h2><span class="season-state">{saved.effective_season === "winter" ? "Winter" : "Normal"} active</span></div>
      <Field label="Season mode">
        <Select bind:value={draft.season_mode}>
          <option value="automatic">Automatic</option>
          <option value="normal">Always normal</option>
          <option value="winter">Always winter</option>
        </Select>
      </Field>
      <div class="winter-window" class:overridden={draft.season_mode !== "automatic"}>
        <div class="date-boundary"><span>Starts</span>
          <Select value={String(draft.winter_start.month)} onchange={(event) => { draft.winter_start.month = Number(event.currentTarget.value); }} aria-label="Winter start month">{#each months as month, index}<option value={String(index + 1)}>{month}</option>{/each}</Select>
          <NumberInput bind:value={draft.winter_start.day} min={1} max={31} step={1} required aria-label="Winter start day" />
        </div>
        <div class="date-boundary"><span>Ends</span>
          <Select value={String(draft.winter_end.month)} onchange={(event) => { draft.winter_end.month = Number(event.currentTarget.value); }} aria-label="Winter end month">{#each months as month, index}<option value={String(index + 1)}>{month}</option>{/each}</Select>
          <NumberInput bind:value={draft.winter_end.day} min={1} max={31} step={1} required aria-label="Winter end day" />
        </div>
      </div>
      <p class="hint">Repeats each year in UTC, including both dates. The window applies in Automatic mode.</p>

      <div class="section-head variants-head"><h2>Welcome odds</h2><span class="hint">Higher weight means more often</span></div>
      <div class="variant-columns" aria-hidden="true"><span>Welcome</span><span>Weight</span><span>{dirty ? "After save" : "Chance"}</span></div>
      <div class="variants">
        {#each draft.variants as variant (variant.id)}
          {@const item = catalogById.get(variant.id)}
          <div class="variant" class:selected={selectedId === variant.id} class:off={!variant.enabled || variant.weight === 0}>
            <div class="variant-identity">
              <Toggle bind:checked={variant.enabled} label={`Enable ${item?.label ?? variant.id}`} />
              <button type="button" class="variant-select" aria-pressed={selectedId === variant.id} onclick={() => selectVariant(variant.id)}>{item?.label ?? variant.id}</button>
              {#if item && (!item.normal_ready || !item.winter_ready)}<span class="asset-state">{!item.normal_ready && !item.winter_ready ? "Assets pending" : !item.winter_ready ? "Winter pending" : "Normal pending"}</span>{/if}
            </div>
            <NumberInput bind:value={variant.weight} min={0} max={1000} step={1} required aria-label={`${item?.label ?? variant.id} weight`} />
            <span class="chance" aria-label={`${item?.label ?? variant.id} ${dirty ? "chance after save" : "saved chance"}: ${displayedChances?.has(variant.id) ? welcomeChance(displayedChances.get(variant.id)) : "Not available"}`}>{welcomeChance(displayedChances?.get(variant.id))}</span>
          </div>
        {/each}
      </div>
      <p class="hint">Zero weight never wins. {dirty ? "Proposed chances apply after saving." : "Chances reflect the saved settings."}</p>

      <div class="section-head links-head"><h2>Welcome links</h2><span class="hint">Up to five</span></div>
      <div class="link-editor">
        {#each draft.links as link, index (index)}
          <div class="link-row">
            <Field label={`Link ${index + 1} label`}><TextInput bind:value={link.label} maxlength={80} /></Field>
            <Field label="URL"><TextInput bind:value={link.url} maxlength={512} placeholder="https://" /></Field>
            <Button variant="ghost" size="sm" aria-label={`Remove link ${index + 1}`} onclick={() => { draft.links = draft.links.filter((_, at) => at !== index); }}>Remove</Button>
          </div>
        {/each}
        <Button variant="secondary" size="sm" disabled={draft.links.length >= 5} onclick={() => { draft.links = [...draft.links, { label: "", url: "" }]; }}>Add link</Button>
      </div>
    </fieldset>

    <footer class="save-bar">
      <div bind:this={saveStatus} class="save-status" tabindex="-1"><FormStatus {error} warning={dirty && issue ? issue : null} saved={!!notice && !dirty} savedText={notice ?? ""} live={!navigationBlocked} compact /></div>
      <div class="save-actions">
        {#if dirty}<span class="dirty-state">Unsaved changes</span>{/if}
        <Button disabled={busy || !dirty || !!issue || conflict || (draft.enabled && !draftReady)} onclick={() => void save()}>{busy ? "Saving…" : "Save changes"}</Button>
        {#if conflict}<Button variant="secondary" disabled={busy} onclick={() => dirty ? reloadDialog?.open() : void reloadSaved()}>Reload saved settings</Button>
        {:else}<Button variant="ghost" disabled={busy || !dirty} onclick={() => discardDialog?.open()}>Discard changes</Button>{/if}
      </div>
    </footer>
  </section>

  <aside class="preview" id="welcome-preview" aria-label="Welcome preview">
    <div class="section-head"><h2>Preview</h2><span class="hint">Your member avatar</span></div>
    <div class="preview-heading"><h3 class="preview-title">{selected?.label ?? "Choose a welcome"}</h3>
      <div class="variant-navigation"><Button variant="ghost" size="sm" disabled={draft.variants.length < 2} aria-label="Previous welcome" onclick={() => nextVariant(-1)}>Previous</Button><Button variant="ghost" size="sm" disabled={draft.variants.length < 2} aria-label="Next welcome" onclick={() => nextVariant(1)}>Next</Button></div>
    </div>
    {#if selected?.description}<p class="preview-description">{selected.description}</p>{/if}
    <div class="preview-season" role="group" aria-label="Preview season">
      <button type="button" aria-pressed={season === "normal"} onclick={() => { season = "normal"; }}>Normal</button>
      <button type="button" aria-pressed={season === "winter"} onclick={() => { season = "winter"; }}>Winter</button>
    </div>
    <Field label="Sample name" hint="Real joins use the member's display name automatically.">
      <TextInput bind:value={sampleName} placeholder={saved.viewer.display_name} />
    </Field>
    {#if previewIdentity && previewIdentity.key !== previewRequest.key}<p class="hint">Showing previous preview: {previewIdentity.description}.</p>{/if}
    <div class="preview-image" aria-busy={previewBusy}>
      {#if previewUrl}
        <img src={previewUrl} alt={previewIdentity?.description ?? "Welcome preview"} width="768" height="432" />
      {:else if previewBusy}<p role="status">Rendering your welcome…</p>
      {:else if !previewReady}<p>This {season} preview is not ready. Its artwork is still being prepared.</p>
      {:else if !previewError}<p>Preparing preview…</p>{/if}
    </div>
    {#if previewBusy && previewUrl}<p class="hint" role="status">Rendering the selected welcome…</p>{/if}
    <FormStatus error={previewError} compact />
    <div class="preview-actions">
      <Button variant="secondary" disabled={!previewReady || previewBusy || !previewUrl || previewIdentity?.key !== previewRequest.key} onclick={() => animated ? showCachedStill() : void renderPreview(previewRequest, "gif")}>{animated ? "Stop animation" : "Play animation"}</Button>
      {#if previewError}<Button variant="ghost" disabled={!previewReady || previewBusy} onclick={() => void renderPreview(previewRequest, "png")}>Retry preview</Button>{/if}
    </div>
    {#if draft.links.length > 0}
      <div class="welcome-links" role="group" aria-label="Message buttons">
        <span class="hint">Message buttons{dirty ? " after save" : ""}</span>
        {#each draft.links as link, index (index)}
          {#if /^https?:\/\//.test(link.url)}<a href={link.url} target="_blank" rel="noreferrer">{link.label}</a>{:else}<span>{link.label}</span>{/if}
        {/each}
      </div>
    {/if}
  </aside>
</div>

<ConfirmDialog bind:this={reloadDialog} title="Reload saved settings?" body="Your unsaved changes will be discarded. The newest settings will be loaded." confirmLabel="Reload settings" onconfirm={() => void reloadSaved()} />
<ConfirmDialog bind:this={discardDialog} title="Discard unsaved changes?" body="The saved settings and existing welcome messages will remain unchanged." confirmLabel="Discard changes" onconfirm={discard} />

<style>
  .welcome-workspace { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(300px, 1fr); gap: 32px; align-items: start; }
  .settings, .preview { min-width: 0; }
  fieldset { display: grid; gap: 14px; padding: 0; margin: 0; border: 0; min-width: 0; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; }
  h2, h3 { margin: 0; color: var(--text-heading); font-weight: var(--weight-regular); }
  h2 { font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  h3 { font-size: var(--text-sm); }
  .hint, .saved-state, .season-state { margin: 0; color: var(--text-body); font-size: var(--text-xs); line-height: 1.5; }
  .hint { overflow-wrap: anywhere; }
  .season-state { color: var(--color-gold); }
  .readiness { margin: 0; padding: 10px 12px; border-left: 2px solid var(--color-gold); color: var(--text-body); background: var(--color-surface); font-size: var(--text-sm); line-height: 1.5; }
  .season-head, .variants-head, .links-head { padding-top: 16px; margin-top: 4px; border-top: 1px solid var(--border-default); }
  .winter-window { display: grid; gap: 10px; }
  .winter-window.overridden { opacity: 0.65; }
  .date-boundary { display: grid; grid-template-columns: 44px minmax(0, 1fr) 80px; gap: 10px; align-items: center; }
  .date-boundary > span { font-size: var(--text-sm); color: var(--text-body); }
  .variant-columns, .variant { display: grid; grid-template-columns: minmax(0, 1fr) 80px 88px; align-items: center; gap: 12px; }
  .variant-columns { padding: 0 10px; font-size: var(--text-xs); color: var(--text-body); }
  .variant-columns span:last-child { text-align: right; }
  .variants { display: grid; }
  .variant { padding: 10px; border-top: 1px solid var(--border-default); border-left: 2px solid transparent; }
  .variant.selected { border-left-color: var(--color-gold); background: color-mix(in srgb, var(--color-gold) 5%, transparent); }
  .variant-identity { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 2px 4px; }
  .variant-identity :global(.check span) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .variant-identity :global(.check) { min-width: 44px; min-height: 44px; justify-content: center; align-items: center; }
  .variant-select { border: 0; padding: 0; min-height: 44px; background: none; color: var(--text-heading); text-align: left; font: inherit; font-size: var(--text-sm); cursor: pointer; overflow-wrap: anywhere; }
  .variant-select[aria-pressed="true"] { color: var(--color-gold); }
  .variant.off .variant-select, .variant.off .chance { color: var(--text-muted); }
  .asset-state { grid-column: 2; font-size: var(--text-xs); color: var(--text-body); }
  .chance { text-align: right; color: var(--text-body); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
  .save-bar { position: sticky; bottom: 0; display: grid; gap: 10px; margin-top: 20px; padding: 12px 0 max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border-default); background: var(--bg-page); z-index: 2; }
  .save-actions, .preview-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .dirty-state { flex-basis: 100%; color: var(--color-gold); font-size: var(--text-xs); }
  .save-status:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 4px; }
  .link-editor { display: grid; gap: 14px; justify-items: start; }
  .link-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; width: 100%; padding-bottom: 12px; border-bottom: 1px solid var(--border-default); }
  .link-row :global(.seq-button) { justify-self: start; }
  .link-editor :global(.seq-button), .variant-navigation :global(.seq-button) { min-height: 44px; }
  .preview { position: sticky; top: 5rem; display: grid; gap: 14px; scroll-margin-top: 5rem; max-height: calc(100vh - 5.5rem); overflow-y: auto; }
  .preview-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .variant-navigation { display: flex; gap: 4px; }
  .preview-title { font-family: var(--font-display); color: var(--color-gold); font-size: var(--text-base); overflow-wrap: anywhere; }
  .preview-description { margin: 0; color: var(--text-body); font-size: var(--text-sm); line-height: 1.5; }
  .preview-season { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border-default); }
  .preview-season button { min-height: 44px; border: 0; background: none; color: var(--text-body); font: inherit; font-size: var(--text-sm); cursor: pointer; }
  .preview-season button[aria-pressed="true"] { color: var(--color-gold); background: color-mix(in srgb, var(--color-gold) 10%, transparent); }
  .preview-image { display: grid; place-items: center; aspect-ratio: 16 / 9; border: 1px solid var(--border-default); background: var(--color-deep); overflow: hidden; }
  .preview-image img { display: block; width: 100%; height: auto; image-rendering: pixelated; }
  .preview-image[aria-busy="true"] img { opacity: 0.6; }
  .preview-image p { max-width: 32ch; padding: 16px; margin: 0; text-align: center; color: var(--text-body); font-size: var(--text-sm); line-height: 1.5; }
  .welcome-links { display: flex; flex-wrap: wrap; gap: 8px 16px; padding-top: 12px; border-top: 1px solid var(--border-default); font-size: var(--text-xs); }
  .welcome-links a { color: var(--color-gold); }
  button:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 2px; }
  .preview-season button:focus-visible { outline-offset: -2px; }
  button:disabled { opacity: 0.5; cursor: default; }
  @media (max-width: 1180px) {
    .welcome-workspace { grid-template-columns: 1fr; gap: 26px; }
    .preview { position: static; max-width: 768px; max-height: none; overflow-y: visible; order: -1; }
  }
  @media (max-width: 520px) {
    .winter-window { gap: 12px; }
    .variant-columns, .variant { grid-template-columns: minmax(0, 1fr) 64px 70px; gap: 8px; padding-inline: 4px; }
    .variant-columns { font-size: var(--text-2xs); }
    .variant-identity { gap: 2px 0; }
    .save-actions :global(.seq-button) { flex: 1; min-height: 44px; padding-inline: 8px; }
  }
</style>
