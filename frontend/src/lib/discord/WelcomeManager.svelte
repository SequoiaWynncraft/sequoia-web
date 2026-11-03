<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import { requestDiscord } from "#lib/api/discordManagement.js";
  import { requestWelcomePreview } from "#lib/api/welcome.js";
  import Button from "#lib/design-system/components/Button.svelte";
  import Field from "#lib/design-system/components/forms/Field.svelte";
  import FormStatus from "#lib/design-system/components/forms/FormStatus.svelte";
  import TextInput from "#lib/design-system/components/forms/TextInput.svelte";
  import NumberInput from "#lib/design-system/components/forms/NumberInput.svelte";
  import Select from "#lib/design-system/components/forms/Select.svelte";
  import Toggle from "#lib/design-system/components/forms/Toggle.svelte";
  import ConfirmDialog from "#lib/design-system/components/forms/ConfirmDialog.svelte";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";
  import { welcomeChance, welcomeInputIssue, welcomeMessageIssue, welcomeNightIssue, welcomeNightReadinessIssue, welcomeNightSummary, welcomePreviewKey, welcomePreviewMessageChanged, welcomePreviewScene, welcomeReadinessIssue, welcomeSkyChances, welcomeSkyEffectIssue, type WelcomeMessage, type WelcomePreviewEffect, type WelcomeResponse, type WelcomeSeason, type WelcomeState, welcomeSaveBody, welcomeSettingsDirty, welcomeStateWithNight } from "./welcome";
  import { REPEAT_RECENT_MAX, repeatChances, repeatFieldIssue, repeatHistory, repeatRecentIds } from "./repeat";
  import type { DiscordContext } from "./types";

  let { initial, channels }: { initial: WelcomeResponse; channels: DiscordContext["channels"] } = $props();
  const seeded = untrack(() => welcomeStateWithNight(structuredClone(initial)));
  let saved = $state<WelcomeState>(seeded.state);
  let nightSupported = $state(seeded.nightSupported);
  let mentionSupported = $state(seeded.mentionSupported);
  let imagesSupported = $state(seeded.imagesSupported);
  let repeatSupported = $state(seeded.repeatSupported);
  let draft = $state(structuredClone(seeded.state.settings));
  let selectedId = $state(untrack(() => initial.catalog[0]?.id ?? ""));
  let season = $state<WelcomeSeason>(untrack(() => initial.effective_season));
  let previewEffect = $state<WelcomePreviewEffect>("none");
  let previewTime = $state<"scheduled" | "day" | "night">("scheduled");
  let previewMoon = $state<"saved" | "shown" | "hidden">("saved");
  let deviceZone = $state("");
  let sampleName = $state(untrack(() => initial.viewer.display_name));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let conflict = $state(false);
  let reloadDialog = $state<ConfirmDialog>();
  let discardDialog = $state<ConfirmDialog>();
  let previewUrl = $state("");
  let previewIdentity = $state<{ key: string; description: string; message: WelcomeMessage } | null>(null);
  let previewError = $state<string | null>(null);
  let previewBusy = $state(false);
  let animated = $state(false);
  let navigationBlocked = $state(false);
  let saveStatus = $state<HTMLDivElement>();
  let pngCache: { url: string; key: string; description: string; message: WelcomeMessage } | undefined;
  let pendingFormat: "png" | "gif" | null = null;
  let controller: AbortController | undefined;
  let playbackTimer: ReturnType<typeof setTimeout> | undefined;
  let serial = 0;

  const dirty = $derived(welcomeSettingsDirty(draft, saved.settings));
  const sendImages = $derived(!imagesSupported || draft.send_images);
  const issue = $derived(welcomeInputIssue(draft, nightSupported ? saved.effective_night.timezones : null) ?? welcomeNightReadinessIssue(draft.night, saved.settings.night, saved.effective_night.ready, sendImages, !imagesSupported || saved.settings.send_images));
  const nightIssue = $derived(welcomeNightIssue(draft.night, saved.effective_night.timezones));
  const nightSummary = $derived(welcomeNightSummary(draft.night));
  const readinessIssue = $derived(welcomeReadinessIssue(draft, saved.catalog, sendImages));
  const draftReady = $derived(readinessIssue === null);
  const selected = $derived(saved.catalog.find((item) => item.id === selectedId));
  const messageIssue = $derived(welcomeMessageIssue(draft.message));
  const selectedEffect = $derived(saved.effects.sky.find((effect) => effect.id === previewEffect));
  const previewEffectReady = $derived(previewEffect === "none" || selectedEffect?.[season === "winter" ? "winter_ready" : "normal_ready"] === true);
  const previewNightReady = $derived(previewTime !== "night" || saved.effective_night.ready);
  const previewReady = $derived(selected?.[season === "winter" ? "winter_ready" : "normal_ready"] === true && previewEffectReady && previewNightReady);
  const previewScene = $derived(welcomePreviewScene(nightSupported, { active: saved.effective_night.active, moon: saved.settings.night.moon }, previewTime, previewMoon));
  const sceneLabel = $derived(previewTime === "day" ? "by day" : previewTime === "night" ? "at night" : "as scheduled at the last update");
  const moonLabel = $derived(previewTime === "day" || previewMoon === "saved" ? "" : previewMoon === "shown" ? " with the moon" : " without the moon");
  const skyEffectIssue = $derived(welcomeSkyEffectIssue(draft.effects.sky));
  const skyCatalogById = $derived(new Map(saved.effects.sky.map((effect) => [effect.id, effect])));
  const displayedSkyChances = $derived(dirty ? welcomeSkyChances(draft.effects.sky, saved.effects.sky) : new Map(saved.effective_effect_chances.sky.map((effect) => [effect.id, effect.percent])));
  const chanceById = $derived(new Map(saved.effective_chances.map((item) => [item.id, item.percent])));
  const proposedChances = $derived.by(() => {
    if (draft.variants.some(({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 1000)) return null;
    const total = draft.variants.reduce((sum, item) => sum + (item.enabled ? item.weight : 0), 0);
    if (total === 0) return null;
    return new Map(draft.variants.map((item) => [item.id, item.enabled ? item.weight * 100 / total : 0]));
  });
  const displayedChances = $derived(dirty ? proposedChances : chanceById);
  const history = $derived(repeatHistory(saved));
  const recentIds = $derived(repeatSupported ? repeatRecentIds(history.recent, draft.repeat.recent) : new Set<string>());
  const repeatIssues = $derived(repeatFieldIssue(draft.repeat));
  const nextChances = $derived(!dirty ? history.current ?? (repeatSupported ? repeatChances(draft.variants, draft.repeat, history.recent) : chanceById) : repeatChances(draft.variants, draft.repeat, repeatSupported ? history.recent : []));
  const catalogById = $derived(new Map(saved.catalog.map((item) => [item.id, item])));
  const destinationChannels = $derived(channels.filter((channel) => channel.archived === undefined));
  const knownChannel = $derived(destinationChannels.some((item) => item.id === draft.channel_id));
  const previewRequest = $derived({
    key: welcomePreviewKey(selectedId, season, sampleName || saved.viewer.display_name, draft.message, previewEffect, draft.name_font, { ...previewScene, saved: saved.settings.night }),
    nameFont: draft.name_font, scene: previewScene,
    id: selectedId, season, name: sampleName || saved.viewer.display_name, effect: previewEffect,
    message: { ...draft.message },
    description: `${selected?.label ?? "Welcome"}, ${season} version ${sceneLabel}${moonLabel} with ${selectedEffect?.label ?? "no sky effect"} for ${sampleName || saved.viewer.display_name}: ${draft.message.headline}, ${draft.message.subtitle}`,
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
    previewIdentity = { key: pngCache.key, description: pngCache.description, message: pngCache.message };
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
    if (format === "gif" && pngCache?.key !== input.key) return;
    previewBusy = true;
    pendingFormat = format;
    const requestSerial = serial;
    controller = new AbortController();
    try {
      const result = await requestWelcomePreview(globalThis.fetch.bind(globalThis), {
        variant_id: input.id, season: input.season, display_name: input.name, message: input.message, name_font: input.nameFont, effect: input.effect, ...input.scene, format,
      }, controller.signal);
      if (requestSerial !== serial) return;
      if (!result.ok) { previewError = result.error.message; return; }
      const nextUrl = URL.createObjectURL(result.data);
      if (previewUrl && previewUrl !== pngCache?.url) URL.revokeObjectURL(previewUrl);
      if (format === "png") {
        if (pngCache) URL.revokeObjectURL(pngCache.url);
        pngCache = { url: nextUrl, key: input.key, description: input.description, message: input.message };
      }
      previewUrl = nextUrl;
      previewIdentity = { key: input.key, description: input.description, message: input.message };
      animated = format === "gif";
      if (animated) playbackTimer = setTimeout(showCachedStill, 16_000);
    } catch (cause) {
      if (requestSerial === serial && !(cause instanceof DOMException && cause.name === "AbortError")) {
        previewError = cause instanceof Error ? cause.message : "Could not load the preview.";
      }
    } finally {
      if (requestSerial === serial) { previewBusy = false; pendingFormat = null; }
    }
  }

  $effect(() => {
    const input = previewRequest;
    const ready = previewReady;
    const invalid = messageIssue;
    untrack(() => {
      if (previewIdentity && welcomePreviewMessageChanged(previewIdentity.message, input.message)) clearPreview();
      else { cancelPreview(); if (animated) showCachedStill(); }
    });
    previewError = null;
    if (!ready || invalid) { untrack(clearPreview); return; }
    if (untrack(() => pngCache?.key === input.key)) { untrack(showCachedStill); return; }
    previewBusy = true;
    const timer = setTimeout(() => void renderPreview(input, "png"), 350);
    return () => { clearTimeout(timer); cancelPreview(); };
  });

  onMount(() => {
    deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    function motionChanged() {
      if (query.matches && (animated || pendingFormat === "gif")) showCachedStill();
    }
    query.addEventListener("change", motionChanged);
    return () => { query.removeEventListener("change", motionChanged); clearPreview(); };
  });

  function received(response: WelcomeResponse) {
    const next = welcomeStateWithNight(response);
    saved = next.state;
    nightSupported = next.nightSupported;
    mentionSupported = next.mentionSupported;
    imagesSupported = next.imagesSupported;
    repeatSupported = next.repeatSupported;
    draft = structuredClone(next.state.settings);
    conflict = false;
    error = null;
    navigationBlocked = false;
  }

  async function save() {
    if (busy || !dirty || issue || conflict || (draft.enabled && !draftReady)) return;
    busy = true; error = null; notice = null; navigationBlocked = false;
    const result = await requestDiscord<WelcomeResponse>(globalThis.fetch.bind(globalThis), "welcome", "PUT", welcomeSaveBody($state.snapshot(draft), nightSupported, mentionSupported, repeatSupported, imagesSupported));
    busy = false;
    if (!result.ok) {
      conflict = result.error.status === 409;
      error = conflict ? "Someone saved newer settings. Your edits are kept until you reload." : result.error.message;
      return;
    }
    received(result.data);
    notice = "Saved. Applies to future joins.";
  }

  async function reloadSaved() {
    busy = true; error = null; notice = null; navigationBlocked = false;
    const result = await requestDiscord<WelcomeResponse>(globalThis.fetch.bind(globalThis), "welcome");
    busy = false;
    if (!result.ok) { error = result.error.message; return; }
    received(result.data);
    notice = "Saved settings loaded.";
  }

  function discard() {
    draft = structuredClone($state.snapshot(saved.settings));
    error = conflict ? "Reload saved settings to resolve the conflict." : null;
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

<ManageHeader area="Discord" title="Welcome messages" lead={`Welcomes are ${saved.settings.enabled ? "on" : "off"}. ${saved.effective_season === "winter" ? "Winter" : "Normal"} season is active.`} />

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
      <Toggle bind:checked={draft.mention_member} label="Mention member" hint={mentionSupported ? undefined : "Not available on this server yet."} disabled={!mentionSupported} />
      <Toggle bind:checked={draft.send_images} label="Send images" hint={imagesSupported ? undefined : "Not available on this server yet."} disabled={!imagesSupported} />

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
      <p class="hint">Yearly in UTC, both dates included. Used in Automatic mode.</p>

      {#if !nightSupported}
      <div class="section-head night-head"><h2>Night</h2></div>
      <p class="hint">Not available on this server yet. Welcomes use day scenes.</p>
      {:else}
      <div class="section-head night-head"><h2>Night</h2><span class="season-state">{saved.effective_night.active ? "Night at last update" : "Day at last update"}{saved.effective_night.local_time ? `, ${saved.effective_night.local_time} ${saved.effective_night.timezone}` : ""}</span></div>
      <Toggle bind:checked={draft.night.enabled} label="Use night scenes on a schedule" disabled={sendImages && !saved.effective_night.ready && !draft.night.enabled} />
      {#if sendImages && !saved.effective_night.ready}
        <p class="readiness" role="status">Night artwork is not installed yet, so night stays off.</p>
      {/if}
      <div class="night-window" class:overridden={!draft.night.enabled}>
        <div class="night-times">
          <Field label="Night starts" hint="24-hour time" error={nightIssue?.start}><TextInput bind:value={draft.night.start} inputmode="numeric" maxlength={5} placeholder="21:00" autocomplete="off" mono required /></Field>
          <Field label="Night ends" hint="24-hour time" error={nightIssue?.end}><TextInput bind:value={draft.night.end} inputmode="numeric" maxlength={5} placeholder="07:00" autocomplete="off" mono required /></Field>
        </div>
        <Field label="Timezone" hint="Named zone, with its daylight saving." error={nightIssue?.timezone}>
          <TextInput bind:value={draft.night.timezone} list="welcome-timezones" placeholder="UTC" autocomplete="off" spellcheck={false} required />
        </Field>
        <datalist id="welcome-timezones">{#each saved.effective_night.timezones as zone (zone)}<option value={zone}></option>{/each}</datalist>
        {#if deviceZone && deviceZone !== draft.night.timezone && saved.effective_night.timezones.includes(deviceZone)}
          <Button variant="ghost" size="sm" onclick={() => { draft.night.timezone = deviceZone; }}>Use device timezone ({deviceZone})</Button>
        {/if}
        <Toggle bind:checked={draft.night.moon} label="Show the moon" />
      </div>
      <p class="hint">{nightSummary ? `${nightSummary}.` : "Enter a start, a different end and a timezone."}{draft.night.enabled ? "" : " Off: welcomes use day scenes."}</p>
      {/if}

      <div class="section-head variants-head"><h2>Welcome odds</h2><span class="hint">Higher weight, more often. Zero never wins.</span></div>
      <div class="repeat-controls">
        <Field label="Repeat penalty" hint="0 to 100%" error={repeatIssues?.percent}><NumberInput bind:value={draft.repeat.percent} min={0} max={100} step={1} required disabled={!repeatSupported} invalid={!!repeatIssues?.percent} /></Field>
        <Field label="Recent events" hint={`1 to ${REPEAT_RECENT_MAX}`} error={repeatIssues?.recent}><NumberInput bind:value={draft.repeat.recent} min={1} max={REPEAT_RECENT_MAX} step={1} required disabled={!repeatSupported} invalid={!!repeatIssues?.recent} /></Field>
      </div>
      <p class="hint">{repeatSupported ? "Recent picks lose this share of weight, once. 0 is off. If none remain, base odds apply." : "Repeat penalty is not available on this server yet."}</p>
      <div class="variant-columns" aria-hidden="true"><span>Welcome</span><span>Weight</span><span>Base</span><span>Next</span></div>
      <div class="variants">
        {#each draft.variants as variant (variant.id)}
          {@const item = catalogById.get(variant.id)}
          <div class="variant" class:selected={selectedId === variant.id} class:off={!variant.enabled || variant.weight === 0}>
            <div class="variant-identity">
              <Toggle bind:checked={variant.enabled} label={`Enable ${item?.label ?? variant.id}`} />
              <button type="button" class="variant-select" aria-pressed={selectedId === variant.id} onclick={() => selectVariant(variant.id)}>{item?.label ?? variant.id}</button>
              {#if item && (!item.normal_ready || !item.winter_ready)}<span class="asset-state">{!item.normal_ready && !item.winter_ready ? "Assets pending" : !item.winter_ready ? "Winter pending" : "Normal pending"}</span>{/if}
              {#if recentIds.has(variant.id)}<span class="recent-tag">recent</span>{/if}
            </div>
            <NumberInput bind:value={variant.weight} min={0} max={1000} step={1} required aria-label={`${item?.label ?? variant.id} weight`} />
            <span class="chance" aria-label={`${item?.label ?? variant.id} ${dirty ? "chance after save" : "saved chance"}: ${displayedChances?.has(variant.id) ? welcomeChance(displayedChances.get(variant.id)) : "Not available"}`}>{welcomeChance(displayedChances?.get(variant.id))}</span>
            <span class="chance" aria-label={`${item?.label ?? variant.id} ${dirty ? "next chance after save" : "next chance"}: ${nextChances?.has(variant.id) ? welcomeChance(nextChances.get(variant.id)) : "Not available"}`}>{welcomeChance(nextChances?.get(variant.id))}</span>
          </div>
        {/each}
      </div>

      <div class="section-head effects-head"><h2>Sky effects</h2><span class="hint">Independent of welcome odds</span></div>
      <div class="effect-columns" aria-hidden="true"><span>Sky effect</span><span>Percent</span><span>{dirty ? "After save" : "Chance"}</span></div>
      <div class="sky-effects">
        {#each draft.effects.sky as effect (effect.id)}
          {@const item = skyCatalogById.get(effect.id)}
          <div class="sky-effect">
            <div class="effect-identity"><span>{item?.label ?? effect.id}</span>
              {#if !item?.normal_ready || !item.winter_ready}<span class="effect-pending">{!item?.normal_ready && !item?.winter_ready ? "Artwork pending" : !item?.winter_ready ? "Winter pending" : "Normal pending"}</span>{/if}
            </div>
            <NumberInput bind:value={effect.percent} min={0} max={100} step={1} required aria-label={`${item?.label ?? effect.id} sky effect percent`} />
            <span class="chance" aria-label={`${item?.label ?? effect.id} ${dirty ? "chance after save" : "saved chance"}: ${welcomeChance(displayedSkyChances?.get(effect.id))}`}>{welcomeChance(displayedSkyChances?.get(effect.id))}</span>
          </div>
        {/each}
        <div class="sky-effect no-effect"><span>No effect</span><span aria-hidden="true"></span><span class="chance" aria-label={`No sky effect chance: ${welcomeChance(displayedSkyChances?.get("none"))}`}>{welcomeChance(displayedSkyChances?.get("none"))}</span></div>
      </div>
      <FormStatus error={skyEffectIssue} compact />
      <p class="hint">Unused percent and pending artwork mean no effect.</p>

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
    <div class="section-head"><h2>Preview</h2></div>
    <div class="preview-heading"><h3 class="preview-title">{selected?.label ?? "Choose a welcome"}</h3>
      <div class="variant-navigation"><Button variant="ghost" size="sm" disabled={draft.variants.length < 2} aria-label="Previous welcome" onclick={() => nextVariant(-1)}>Previous</Button><Button variant="ghost" size="sm" disabled={draft.variants.length < 2} aria-label="Next welcome" onclick={() => nextVariant(1)}>Next</Button></div>
    </div>
    {#if selected?.description}<p class="preview-description">{selected.description}</p>{/if}
    <p class="hint">Uses your avatar and a sample name. Season{nightSupported ? ", time, moon" : ""}, sky effect and name here are preview only, never saved.</p>
    <div class="preview-modes" class:split={nightSupported}>
      <div class="preview-season" role="group" aria-label="Preview season">
        <button type="button" aria-pressed={season === "normal"} onclick={() => { season = "normal"; }}>Normal</button>
        <button type="button" aria-pressed={season === "winter"} onclick={() => { season = "winter"; }}>Winter</button>
      </div>
      {#if nightSupported}
      <div class="preview-season preview-time" role="group" aria-label="Preview time of day">
        <button type="button" aria-pressed={previewTime === "scheduled"} onclick={() => { previewTime = "scheduled"; }}>As scheduled</button>
        <button type="button" aria-pressed={previewTime === "day"} onclick={() => { previewTime = "day"; }}>Day</button>
        <button type="button" aria-pressed={previewTime === "night"} disabled={!saved.effective_night.ready} onclick={() => { previewTime = "night"; }}>Night</button>
      </div>
      {/if}
    </div>
    {#if nightSupported && previewTime === "scheduled"}<p class="hint">As scheduled: {saved.effective_night.active ? "night" : "day"} at last update.</p>{/if}
    <div class="preview-options">
      {#if nightSupported}
      <Field label="Moon" hint="Night only">
        <Select bind:value={previewMoon} disabled={previewTime === "day"}>
          <option value="saved">Saved setting ({saved.settings.night.moon ? "moon shown" : "no moon"})</option>
          <option value="shown">Moon shown</option>
          <option value="hidden">No moon</option>
        </Select>
      </Field>
      {/if}
      <Field label="Sky effect">
        <Select bind:value={previewEffect}>
          <option value="none">No effect</option>
          {#each saved.effects.sky as effect (effect.id)}<option value={effect.id} disabled={!effect[season === "winter" ? "winter_ready" : "normal_ready"]}>{effect.label}{!effect[season === "winter" ? "winter_ready" : "normal_ready"] ? " (artwork pending)" : ""}</option>{/each}
        </Select>
      </Field>
      <Field label="Sample name">
        <TextInput bind:value={sampleName} placeholder={saved.viewer.display_name} />
      </Field>
    </div>
    {#if previewIdentity && previewIdentity.key !== previewRequest.key}<p class="hint">Showing previous: {previewIdentity.description}.</p>{/if}
    <div class="preview-image" aria-busy={previewBusy}>
      {#if previewUrl}
        <img src={previewUrl} alt={previewIdentity?.description ?? "Welcome preview"} width="768" height="432" />
      {:else if previewBusy}<p role="status">Rendering preview…</p>
      {:else if !previewNightReady}<p>Night artwork is not installed yet. Choose Day or As scheduled.</p>
      {:else if !previewEffectReady}<p>{selectedEffect?.label ?? "This sky effect"} is not ready for this season. Choose No effect.</p>
      {:else if !previewReady}<p>{season === "winter" ? "Winter" : "Normal"} artwork for this welcome is still being prepared.</p>
      {:else if messageIssue}<p>{messageIssue}</p>
      {:else if !previewError}<p>Preparing preview…</p>{/if}
    </div>
    {#if previewBusy && previewUrl}<p class="hint" role="status">Updating preview…</p>{/if}
    <FormStatus error={previewError} compact />
    <div class="preview-actions">
      <Button variant="secondary" disabled={!previewReady || !!messageIssue || previewBusy || !previewUrl || previewIdentity?.key !== previewRequest.key} onclick={() => animated ? showCachedStill() : void renderPreview(previewRequest, "gif")}>{animated ? "Stop animation" : "Play animation"}</Button>
      {#if previewError}<Button variant="ghost" disabled={!previewReady || !!messageIssue || previewBusy} onclick={() => void renderPreview(previewRequest, "png")}>Retry preview</Button>{/if}
    </div>
    <fieldset class="message-editor" disabled={busy}>
      <legend>Message text</legend>
      <div class="message-lines">
        <Field label="Headline"><TextInput bind:value={draft.message.headline} required /></Field>
        <Field label="Subtitle"><TextInput bind:value={draft.message.subtitle} required /></Field>
      </div>
      <Field label="Message font" hint="Headline and subtitle only.">
        <Select bind:value={draft.message.font} disabled={saved.fonts.length === 0}>
          {#if saved.fonts.length === 0}<option value={draft.message.font}>Fonts unavailable</option>{/if}
          {#each saved.fonts as font (font.id)}<option value={font.id}>{font.label}</option>{/each}
        </Select>
      </Field>
      <Field label="Name font" hint="Member name on the sign.">
        <Select bind:value={draft.name_font} disabled={saved.fonts.length === 0}>
          {#if saved.fonts.length === 0}<option value={draft.name_font}>Fonts unavailable</option>{/if}
          {#each saved.fonts as font (font.id)}<option value={font.id}>{font.label}</option>{/each}
        </Select>
      </Field>
      <FormStatus error={messageIssue} compact />
    </fieldset>
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

<ConfirmDialog bind:this={reloadDialog} title="Reload saved settings?" body="Unsaved changes will be lost." confirmLabel="Reload settings" onconfirm={() => void reloadSaved()} />
<ConfirmDialog bind:this={discardDialog} title="Discard unsaved changes?" body="Saved settings and posted welcomes stay as they are." confirmLabel="Discard changes" onconfirm={discard} />

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
  .season-head, .night-head, .variants-head, .effects-head, .links-head { padding-top: 16px; margin-top: 4px; border-top: 1px solid var(--border-default); }
  .winter-window { display: grid; gap: 10px; }
  .winter-window.overridden, .night-window.overridden { opacity: 0.65; }
  .night-window { display: grid; gap: 14px; justify-items: stretch; }
  .night-window > :global(.seq-button) { justify-self: start; min-height: 44px; }
  .night-times { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .date-boundary { display: grid; grid-template-columns: 44px minmax(0, 1fr) 80px; gap: 10px; align-items: center; }
  .date-boundary > span { font-size: var(--text-sm); color: var(--text-body); }
  .repeat-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 160px)); gap: 12px; }
  .variant-columns, .variant { display: grid; grid-template-columns: minmax(0, 1fr) 72px 60px 60px; align-items: center; gap: 12px; }
  .variant-columns { padding: 0 10px; font-size: var(--text-xs); color: var(--text-body); }
  .variant-columns span:nth-child(n + 3) { text-align: right; }
  .recent-tag { grid-column: 2; justify-self: start; padding: 0 6px; border: 1px solid var(--border-default); color: var(--color-gold); font-size: var(--text-2xs); line-height: 1.6; }
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
  .sky-effects { display: grid; }
  .effect-columns, .sky-effect { display: grid; grid-template-columns: minmax(0, 1fr) 80px 88px; gap: 12px; align-items: center; padding: 10px; }
  .effect-columns { padding-block: 0; color: var(--text-body); font-size: var(--text-xs); }
  .effect-columns span:last-child { text-align: right; }
  .sky-effect { border-top: 1px solid var(--border-default); color: var(--text-body); font-size: var(--text-sm); }
  .effect-identity { display: grid; gap: 4px; overflow-wrap: anywhere; }
  .effect-pending { color: var(--text-body); font-size: var(--text-xs); }
  .save-bar { position: sticky; bottom: 0; display: grid; gap: 10px; margin-top: 20px; padding: 12px 0 max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border-default); background: var(--bg-page); z-index: 2; }
  .save-actions, .preview-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .dirty-state { flex-basis: 100%; color: var(--color-gold); font-size: var(--text-xs); }
  .save-status:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 4px; }
  .link-editor { display: grid; gap: 14px; justify-items: start; }
  .link-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; width: 100%; padding-bottom: 12px; border-bottom: 1px solid var(--border-default); }
  .link-row :global(.seq-button) { justify-self: start; }
  .link-editor :global(.seq-button), .variant-navigation :global(.seq-button) { min-height: 44px; }
  .preview { position: sticky; top: 5rem; display: grid; grid-auto-rows: max-content; align-content: start; gap: 14px; scroll-margin-top: 5rem; max-height: calc(100vh - 5.5rem); overflow-y: auto; }
  .preview-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .variant-navigation { display: flex; gap: 4px; }
  .preview-title { font-family: var(--font-display); color: var(--color-gold); font-size: var(--text-base); overflow-wrap: anywhere; }
  .preview-description { margin: 0; color: var(--text-body); font-size: var(--text-sm); line-height: 1.5; }
  .preview-season { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border-default); }
  .preview-time { grid-template-columns: repeat(3, 1fr); }
  .preview-modes { display: grid; gap: 8px; }
  .preview-modes.split { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  .preview-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); align-items: start; gap: 12px; }
  .preview-season button { min-height: 44px; border: 0; background: none; color: var(--text-body); font: inherit; font-size: var(--text-sm); cursor: pointer; }
  .preview-season button[aria-pressed="true"] { color: var(--color-gold); background: color-mix(in srgb, var(--color-gold) 10%, transparent); }
  .preview-image { display: grid; place-items: center; aspect-ratio: 16 / 9; border: 1px solid var(--border-default); background: var(--color-deep); overflow: hidden; }
  .preview-image img { display: block; width: 100%; height: auto; image-rendering: pixelated; }
  .preview-image[aria-busy="true"] img { opacity: 0.6; }
  .message-editor { border-top: 1px solid var(--border-default); padding-top: 12px; }
  .message-editor legend { padding: 0 8px 0 0; color: var(--text-heading); font-size: var(--text-sm); }
  .message-lines { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
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
    .message-lines, .preview-modes.split { grid-template-columns: 1fr; }
    .winter-window { gap: 12px; }
    .effect-columns, .sky-effect { grid-template-columns: minmax(0, 1fr) 64px 70px; gap: 8px; padding-inline: 4px; }
    .variant-columns, .variant { grid-template-columns: minmax(0, 1fr) 60px 48px 48px; gap: 6px; padding-inline: 4px; }
    .variant-columns, .effect-columns { font-size: var(--text-2xs); }
    .variant-identity { gap: 2px 0; }
    .save-actions :global(.seq-button) { flex: 1; min-height: 44px; padding-inline: 8px; }
  }
</style>
