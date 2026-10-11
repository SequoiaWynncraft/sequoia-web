<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import { requestDiscord } from "$lib/api/discordManagement";
  import { requestCeremonyPreview } from "$lib/api/ceremony";
  import Button from "$lib/design-system/components/Button.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormStatus from "$lib/design-system/components/forms/FormStatus.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import NumberInput from "$lib/design-system/components/forms/NumberInput.svelte";
  import Select from "$lib/design-system/components/forms/Select.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";
  import ConfirmDialog from "$lib/design-system/components/forms/ConfirmDialog.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import {
    CEREMONY_ALL_RAIDS, CEREMONY_BADGE_TITLE_MAX, CEREMONY_LOOP_MS, CEREMONY_RAIDS, CEREMONY_SCENES, CEREMONY_TIERS,
    ceremonyAchievementBody, ceremonyAchievementDescription, ceremonyAchievementIssue, ceremonyCategories, ceremonyChance,
    ceremonyInputIssue, ceremonyKeyLabel, ceremonyPreviewKey, ceremonyPreviewScene, ceremonyProposedChances, ceremonyReadinessIssue,
    ceremonyRoleLabel, ceremonySaveBody, ceremonySceneLabel, ceremonySettingsDirty, ceremonyState, ceremonyTierLabel,
    type CeremonyAchievement, type CeremonyCategory, type CeremonyCategoryKind, type CeremonyResponse, type CeremonySceneChoice, type CeremonyState,
  } from "./ceremony";
  import { REPEAT_RECENT_MAX, repeatChances, repeatFieldIssue, repeatHistory, repeatRecentIds } from "./repeat";
  import type { DiscordContext } from "./types";

  let { initial, channels }: { initial: CeremonyResponse; channels: DiscordContext["channels"] } = $props();
  // The saved response seeds one local draft; Rust owns persistence and normalization.
  // svelte-ignore state_referenced_locally
  const seeded = ceremonyState(structuredClone(initial));
  let saved = $state<CeremonyState>(seeded.state);
  let mentionSupported = $state(seeded.mentionSupported);
  let imagesSupported = $state(seeded.imagesSupported);
  let repeatSupported = $state(seeded.repeatSupported);
  let draft = $state(structuredClone(seeded.state.settings));
  // svelte-ignore state_referenced_locally
  let storyId = $state((initial.catalog.find((item) => item.ready) ?? initial.catalog[0])?.id ?? "");
  // Sample values per category. Older servers without a catalog only preview raids with the fixed lists.
  const LEGACY_TIERS = CEREMONY_TIERS.map(({ id }) => id as string);
  const LEGACY_RAIDS = [CEREMONY_ALL_RAIDS, ...CEREMONY_RAIDS];
  function pick<T>(wanted: T, options: readonly T[]): T {
    return options.includes(wanted) ? wanted : options[0] ?? wanted;
  }
  function entryOf<K extends CeremonyCategoryKind>(list: CeremonyCategory[] | null, kind: K) {
    return list?.find((item): item is Extract<CeremonyCategory, { kind: K }> => item.kind === kind);
  }
  // svelte-ignore state_referenced_locally
  const initialCategories = ceremonyCategories(initial);
  const initialRaid = entryOf(initialCategories, "raid");
  const initialWar = entryOf(initialCategories, "war");
  const initialProfession = entryOf(initialCategories, "profession");
  const initialRole = entryOf(initialCategories, "role");
  let kind = $state<CeremonyCategoryKind>(initialRaid || !initialCategories ? "raid" : initialCategories[0].kind);
  let tier = $state(pick("diamond", initialRaid?.tiers ?? LEGACY_TIERS));
  let raid = $state(pick("TNA", initialRaid?.raids ?? LEGACY_RAIDS));
  let count = $state<number | null | undefined>(1000);
  let warTier = $state(pick("gold", initialWar?.tiers ?? LEGACY_TIERS));
  let warCount = $state<number | null | undefined>(100);
  let profession = $state(pick("mining", initialProfession?.professions ?? []));
  let level = $state(String(pick(110, initialProfession?.levels ?? [])));
  let roleCategory = $state(pick("insignia", initialRole?.categories ?? []));
  let roleTier = $state(pick("gold", initialRole?.tiers ?? []));
  let badgeTitle = $state("Founder");
  let sceneChoice = $state<CeremonySceneChoice>("scheduled");
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

  const dirty = $derived(ceremonySettingsDirty(draft, saved.settings));
  const issue = $derived(ceremonyInputIssue(draft));
  const readinessIssue = $derived(ceremonyReadinessIssue(draft, saved.ready));
  const draftReady = $derived(readinessIssue === null);
  const catalogById = $derived(new Map(saved.catalog.map((item) => [item.id, item])));
  // Only stories the server catalog lists are shown; unknown saved rows are kept and sent back untouched.
  const rows = $derived(draft.stories.filter((story) => catalogById.has(story.id)));
  const savedChances = $derived(new Map(saved.effective_chances.map((item) => [item.id, item.percent])));
  const displayedChances = $derived(dirty ? ceremonyProposedChances(draft.stories) : savedChances);
  // Next pick odds: the server's while clean, otherwise the same penalty rule over the draft.
  const history = $derived(repeatHistory(saved));
  const recentIds = $derived(repeatSupported ? repeatRecentIds(history.recent, draft.repeat.recent) : new Set<string>());
  const repeatIssues = $derived(repeatFieldIssue(draft.repeat));
  // Older servers have no penalty, so their next pick uses the base odds.
  const nextChances = $derived(!dirty ? history.current ?? (repeatSupported ? repeatChances(rows, draft.repeat, history.recent) : savedChances) : repeatChances(rows, draft.repeat, repeatSupported ? history.recent : []));
  const destinationChannels = $derived(channels.filter((channel) => channel.archived === undefined));
  const knownChannel = $derived(destinationChannels.some((item) => item.id === draft.channel_id));
  const selected = $derived(catalogById.get(storyId));
  const categories = $derived(ceremonyCategories(saved));
  const legacy = $derived(categories === null);
  const activeKind = $derived(categories?.some((item) => item.kind === kind) ? kind : "raid");
  const raidEntry = $derived(entryOf(categories, "raid"));
  const warEntry = $derived(entryOf(categories, "war"));
  const professionEntry = $derived(entryOf(categories, "profession"));
  const roleEntry = $derived(entryOf(categories, "role"));
  const raidOptions = $derived(raidEntry?.raids ?? LEGACY_RAIDS);
  const raidTiers = $derived(raidEntry?.tiers ?? LEGACY_TIERS);
  const warTiers = $derived(warEntry?.tiers ?? LEGACY_TIERS);
  const achievement = $derived.by((): CeremonyAchievement => {
    const sample = (value: number | null | undefined) => typeof value === "number" ? value : 0;
    switch (activeKind) {
      case "war": return { kind: "war", tier: pick(warTier, warTiers), count: sample(warCount) };
      case "profession": return { kind: "profession", profession: pick(profession, professionEntry?.professions ?? []), level: Number(pick(level, (professionEntry?.levels ?? []).map(String))) };
      case "role": {
        const category = pick(roleCategory, roleEntry?.categories ?? []);
        const roleTierValue = pick(roleTier, roleEntry?.tiers ?? []);
        return { kind: "role", category, tier: roleTierValue, label: ceremonyRoleLabel(category, roleTierValue) };
      }
      case "badge": return { kind: "badge", title: badgeTitle };
      default: {
        const raidValue = pick(raid, raidOptions);
        return { kind: "raid", raid: raidValue === CEREMONY_ALL_RAIDS ? null : raidValue, tier: pick(tier, raidTiers), count: sample(count) };
      }
    }
  });
  const achievementIssue = $derived(ceremonyAchievementIssue(achievement));
  const previewReady = $derived(selected?.ready === true && achievementIssue === null);
  const scheduledLabel = $derived(ceremonySceneLabel(saved.effective_scene));
  const previewRequest = $derived.by(() => {
    const scene = ceremonyPreviewScene(sceneChoice, saved.effective_scene);
    return {
      key: ceremonyPreviewKey(storyId, achievement, scene),
      story_id: storyId, achievement, legacy, scene,
      description: `${selected?.label ?? "Ceremony"}, ${ceremonySceneLabel(scene)}${sceneChoice === "scheduled" ? " as scheduled" : ""}, ${ceremonyAchievementDescription(achievement)} for ${saved.viewer.display_name}`,
    };
  });

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
      const result = await requestCeremonyPreview(globalThis.fetch.bind(globalThis), {
        story_id: input.story_id, ...input.scene, ...ceremonyAchievementBody(input.achievement, input.legacy), format,
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
      if (animated) playbackTimer = setTimeout(showCachedStill, CEREMONY_LOOP_MS);
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
    // Replacements retain the correctly labeled previous still until new bytes arrive.
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

  function received(response: CeremonyResponse) {
    const next = ceremonyState(response);
    saved = next.state;
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
    // Freeze the sent draft. Controls stay disabled until normalization returns.
    const result = await requestDiscord<CeremonyResponse>(globalThis.fetch.bind(globalThis), "ceremonies", "PUT", ceremonySaveBody($state.snapshot(draft), mentionSupported, repeatSupported, imagesSupported));
    busy = false;
    if (!result.ok) {
      conflict = result.error.status === 409;
      error = conflict ? "Someone saved newer settings. Your edits are kept until you reload." : result.error.message;
      return;
    }
    received(result.data);
    notice = "Saved. Applies to future achievements.";
  }

  async function reloadSaved() {
    busy = true; error = null; notice = null; navigationBlocked = false;
    const result = await requestDiscord<CeremonyResponse>(globalThis.fetch.bind(globalThis), "ceremonies");
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
</script>

<ManageHeader area="Discord" title="Achievement ceremonies" lead={`Ceremonies are ${saved.settings.enabled ? "on" : "off"}. Scene now: ${scheduledLabel}.`} />

<div class="ceremony-workspace">
  <section class="settings" aria-label="Ceremony settings">
    <fieldset disabled={busy}>
      <div class="section-head">
        <h2>Posting</h2>
        <span class="saved-state">Saved version {saved.settings.version}</span>
      </div>
      <p class="hint">When off, achievements post the plain announcement.</p>
      <Toggle bind:checked={draft.enabled} label="Post achievement ceremonies" disabled={!draftReady && !draft.enabled} />
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
      <p class="hint">Season and night follow the welcome schedule.</p>

      <div class="section-head stories-head"><h2>Story odds</h2><span class="hint">Higher weight, more often. Zero never wins.</span></div>
      <div class="repeat-controls">
        <Field label="Repeat penalty" hint="0 to 100%" error={repeatIssues?.percent}><NumberInput bind:value={draft.repeat.percent} min={0} max={100} step={1} required disabled={!repeatSupported} invalid={!!repeatIssues?.percent} /></Field>
        <Field label="Recent events" hint={`1 to ${REPEAT_RECENT_MAX}`} error={repeatIssues?.recent}><NumberInput bind:value={draft.repeat.recent} min={1} max={REPEAT_RECENT_MAX} step={1} required disabled={!repeatSupported} invalid={!!repeatIssues?.recent} /></Field>
      </div>
      <p class="hint">{repeatSupported ? "Recent picks lose this share of weight, once. 0 is off. If none remain, base odds apply." : "Repeat penalty is not available on this server yet."}</p>
      <div class="story-columns" aria-hidden="true"><span>Story</span><span>Weight</span><span>Base</span><span>Next</span></div>
      <div class="stories">
        {#each rows as story (story.id)}
          {@const item = catalogById.get(story.id)}
          {@const label = item?.label ?? story.id}
          <div class="story" class:selected={storyId === story.id} class:off={!story.enabled || story.weight === 0}>
            <div class="story-identity">
              <Toggle bind:checked={story.enabled} label={`Enable ${label}`} />
              <button type="button" class="story-select" aria-pressed={storyId === story.id} onclick={() => { storyId = story.id; }}>{label}</button>
              {#if item && !item.ready}<span class="asset-state">Artwork pending</span>{/if}
              {#if recentIds.has(story.id)}<span class="recent-tag">recent</span>{/if}
            </div>
            <NumberInput bind:value={story.weight} min={0} max={1000} step={1} required aria-label={`${label} weight`} />
            <span class="chance" aria-label={`${label} ${dirty ? "chance after save" : "saved chance"}: ${displayedChances?.has(story.id) ? ceremonyChance(displayedChances.get(story.id)) : "Not available"}`}>{ceremonyChance(displayedChances?.get(story.id))}</span>
            <span class="chance" aria-label={`${label} ${dirty ? "next chance after save" : "next chance"}: ${nextChances?.has(story.id) ? ceremonyChance(nextChances.get(story.id)) : "Not available"}`}>{ceremonyChance(nextChances?.get(story.id))}</span>
          </div>
        {:else}
          <p class="hint">No stories are installed on this server.</p>
        {/each}
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

  <aside class="preview" id="ceremony-preview" aria-label="Ceremony preview">
    <div class="section-head"><h2>Preview</h2></div>
    <p class="hint">Uses your head and name ({saved.viewer.display_name}) with sample values. Marked DEMO, never posted.</p>
    <Field label="Story">
      <Select bind:value={storyId} disabled={saved.catalog.length === 0}>
        {#if saved.catalog.length === 0}<option value="">No stories installed</option>{/if}
        {#each saved.catalog as item (item.id)}<option value={item.id} disabled={!item.ready}>{item.label}{item.ready ? "" : " (artwork pending)"}</option>{/each}
      </Select>
    </Field>
    {#if selected?.description}<p class="preview-description">{selected.description}</p>{/if}
    <div class="preview-controls">
      {#if categories}
        <Field label="Category">
          <Select bind:value={kind}>{#each categories as option (option.kind)}<option value={option.kind}>{option.label}</option>{/each}</Select>
        </Field>
      {/if}
      {#if activeKind === "war"}
        <Field label="Tier">
          <Select bind:value={warTier}>{#each warTiers as option (option)}<option value={option}>{ceremonyTierLabel(option)}</option>{/each}</Select>
        </Field>
        <Field label="Wars" error={achievementIssue ?? undefined}>
          <NumberInput bind:value={warCount} min={1} max={1000000} step={1} required invalid={!!achievementIssue} />
        </Field>
      {:else if activeKind === "profession"}
        <Field label="Profession">
          <Select bind:value={profession}>{#each professionEntry?.professions ?? [] as option (option)}<option value={option}>{ceremonyKeyLabel(option)}</option>{/each}</Select>
        </Field>
        <Field label="Level">
          <Select bind:value={level}>{#each professionEntry?.levels ?? [] as option (option)}<option value={String(option)}>{option}</option>{/each}</Select>
        </Field>
      {:else if activeKind === "role"}
        <Field label="Role">
          <Select bind:value={roleCategory}>{#each roleEntry?.categories ?? [] as option (option)}<option value={option}>{ceremonyKeyLabel(option)}</option>{/each}</Select>
        </Field>
        <Field label="Tier">
          <Select bind:value={roleTier}>{#each roleEntry?.tiers ?? [] as option (option)}<option value={option}>{ceremonyTierLabel(option)}</option>{/each}</Select>
        </Field>
      {:else if activeKind === "badge"}
        <Field label="Badge title" error={achievementIssue ?? undefined}>
          <TextInput bind:value={badgeTitle} maxlength={CEREMONY_BADGE_TITLE_MAX} required invalid={!!achievementIssue} />
        </Field>
      {:else}
        <Field label="Tier">
          <Select bind:value={tier}>{#each raidTiers as option (option)}<option value={option}>{ceremonyTierLabel(option)}</option>{/each}</Select>
        </Field>
        <Field label="Raid">
          <Select bind:value={raid}>{#each raidOptions as option (option)}<option value={option}>{option}</option>{/each}</Select>
        </Field>
        <Field label="Count" error={achievementIssue ?? undefined}>
          <NumberInput bind:value={count} min={1} max={1000000} step={1} required invalid={!!achievementIssue} />
        </Field>
      {/if}
      <Field label="Scene" hint={sceneChoice === "scheduled" ? `Now: ${scheduledLabel}` : "Preview only"}>
        <Select bind:value={sceneChoice}>{#each CEREMONY_SCENES as option (option.id)}<option value={option.id}>{option.label}</option>{/each}</Select>
      </Field>
    </div>
    {#if previewIdentity && previewIdentity.key !== previewRequest.key}<p class="hint">Showing previous: {previewIdentity.description}.</p>{/if}
    <div class="preview-image" aria-busy={previewBusy}>
      {#if previewUrl}
        <img src={previewUrl} alt={previewIdentity?.description ?? "Ceremony preview"} width="768" height="432" />
      {:else if previewBusy}<p role="status">Rendering preview…</p>
      {:else if !selected}<p>No story to preview.</p>
      {:else if !selected.ready}<p>Artwork for this story is still being prepared.</p>
      {:else if achievementIssue}<p>{achievementIssue}</p>
      {:else if !previewError}<p>Preparing preview…</p>{/if}
    </div>
    {#if previewBusy && previewUrl}<p class="hint" role="status">Updating preview…</p>{/if}
    <FormStatus error={previewError} compact />
    <div class="preview-actions">
      <Button variant="secondary" disabled={!previewReady || previewBusy || !previewUrl || previewIdentity?.key !== previewRequest.key} onclick={() => animated ? showCachedStill() : void renderPreview(previewRequest, "gif")}>{animated ? "Stop animation" : "Play animation"}</Button>
      {#if previewError}<Button variant="ghost" disabled={!previewReady || previewBusy} onclick={() => void renderPreview(previewRequest, "png")}>Retry preview</Button>{/if}
    </div>
  </aside>
</div>

<ConfirmDialog bind:this={reloadDialog} title="Reload saved settings?" body="Unsaved changes will be lost." confirmLabel="Reload settings" onconfirm={() => void reloadSaved()} />
<ConfirmDialog bind:this={discardDialog} title="Discard unsaved changes?" body="Saved settings stay as they are." confirmLabel="Discard changes" onconfirm={discard} />

<style>
  .ceremony-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 1fr); gap: 32px; align-items: start; }
  .settings, .preview { min-width: 0; }
  fieldset { display: grid; gap: 14px; padding: 0; margin: 0; border: 0; min-width: 0; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; }
  h2 { margin: 0; color: var(--text-heading); font-weight: var(--weight-regular); font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .hint, .saved-state { margin: 0; color: var(--text-body); font-size: var(--text-xs); line-height: 1.5; overflow-wrap: anywhere; }
  .readiness { margin: 0; padding: 10px 12px; border-left: 2px solid var(--color-gold); color: var(--text-body); background: var(--color-surface); font-size: var(--text-sm); line-height: 1.5; }
  .stories-head { padding-top: 16px; margin-top: 4px; border-top: 1px solid var(--border-default); }
  .repeat-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 160px)); gap: 12px; }
  .story-columns, .story { display: grid; grid-template-columns: minmax(0, 1fr) 72px 60px 60px; align-items: center; gap: 12px; }
  .story-columns { padding: 0 10px; font-size: var(--text-xs); color: var(--text-body); }
  .story-columns span:nth-child(n + 3) { text-align: right; }
  .recent-tag { grid-column: 2; justify-self: start; padding: 0 6px; border: 1px solid var(--border-default); color: var(--color-gold); font-size: var(--text-2xs); line-height: 1.6; }
  .stories { display: grid; }
  .story { padding: 10px; border-top: 1px solid var(--border-default); border-left: 2px solid transparent; }
  .story.selected { border-left-color: var(--color-gold); background: color-mix(in srgb, var(--color-gold) 5%, transparent); }
  .story-identity { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 2px 4px; }
  .story-identity :global(.check span) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .story-identity :global(.check) { min-width: 44px; min-height: 44px; justify-content: center; align-items: center; }
  .story-select { border: 0; padding: 0; min-height: 44px; background: none; color: var(--text-heading); text-align: left; font: inherit; font-size: var(--text-sm); cursor: pointer; overflow-wrap: anywhere; }
  .story-select[aria-pressed="true"] { color: var(--color-gold); }
  .story.off .story-select, .story.off .chance { color: var(--text-muted); }
  .asset-state { grid-column: 2; font-size: var(--text-xs); color: var(--text-body); }
  .chance { text-align: right; color: var(--text-body); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
  .save-bar { position: sticky; bottom: 0; display: grid; gap: 10px; margin-top: 20px; padding: 12px 0 max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border-default); background: var(--bg-page); z-index: 2; }
  .save-actions, .preview-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .dirty-state { flex-basis: 100%; color: var(--color-gold); font-size: var(--text-xs); }
  .save-status:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 4px; }
  .preview { position: sticky; top: 5rem; display: grid; grid-auto-rows: max-content; align-content: start; gap: 14px; scroll-margin-top: 5rem; max-height: calc(100vh - 5.5rem); overflow-y: auto; }
  .preview-description { margin: 0; color: var(--text-body); font-size: var(--text-sm); line-height: 1.5; }
  .preview-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); align-items: start; gap: 12px; }
  .preview-image { display: grid; place-items: center; aspect-ratio: 16 / 9; border: 1px solid var(--border-default); background: var(--color-deep); overflow: hidden; }
  .preview-image img { display: block; width: 100%; height: auto; image-rendering: pixelated; }
  .preview-image[aria-busy="true"] img { opacity: 0.6; }
  .preview-image p { max-width: 32ch; padding: 16px; margin: 0; text-align: center; color: var(--text-body); font-size: var(--text-sm); line-height: 1.5; }
  button:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 2px; }
  button:disabled { opacity: 0.5; cursor: default; }
  @media (max-width: 1180px) {
    .ceremony-workspace { grid-template-columns: 1fr; gap: 26px; }
    .preview { position: static; max-width: 768px; max-height: none; overflow-y: visible; order: -1; }
  }
  @media (max-width: 520px) {
    .preview-controls { grid-template-columns: 1fr; }
    .story-columns, .story { grid-template-columns: minmax(0, 1fr) 60px 48px 48px; gap: 6px; padding-inline: 4px; }
    .story-columns { font-size: var(--text-2xs); }
    .save-actions :global(.seq-button) { flex: 1; min-height: 44px; padding-inline: 8px; }
  }
</style>
