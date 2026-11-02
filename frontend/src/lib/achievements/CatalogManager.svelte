<script lang="ts">
  import { onMount, tick } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import { requestDiscord } from "#lib/api/discordManagement.js";
  import { requestCeremonyPreview } from "#lib/api/ceremony.js";
  import Button from "#lib/design-system/components/Button.svelte";
  import Field from "#lib/design-system/components/forms/Field.svelte";
  import FormStatus from "#lib/design-system/components/forms/FormStatus.svelte";
  import TextInput from "#lib/design-system/components/forms/TextInput.svelte";
  import NumberInput from "#lib/design-system/components/forms/NumberInput.svelte";
  import Select from "#lib/design-system/components/forms/Select.svelte";
  import Toggle from "#lib/design-system/components/forms/Toggle.svelte";
  import ConfirmDialog from "#lib/design-system/components/forms/ConfirmDialog.svelte";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";
  import {
    canSortMilestones, catalogBody, catalogEditable, catalogGroups, catalogIssue, catalogThresholdMax, categoryIssue,
    milestonePreviewable, nextMilestone, parseCatalogResponse, resetCategory, sameCategory, sortMilestones,
    type CatalogCategory, type CatalogMilestone, type CatalogResponse,
  } from "./catalog";

  let { initial }: { initial: CatalogResponse } = $props();
  // The saved view seeds one local draft; Rust owns validation, ids and persistence.
  // svelte-ignore state_referenced_locally
  let saved = $state<CatalogResponse>(structuredClone(initial));
  // svelte-ignore state_referenced_locally
  let draft = $state(structuredClone(initial.catalog.categories));
  let expanded = $state<Record<string, boolean>>({});
  // svelte-ignore state_referenced_locally
  let storyId = $state(initial.stories.find((story) => story.ready)?.id ?? "");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let conflict = $state(false);
  let navigationBlocked = $state(false);
  let reloadDialog = $state<ConfirmDialog>();
  let discardDialog = $state<ConfirmDialog>();
  let saveStatus = $state<HTMLDivElement>();
  let previewStatus = $state<HTMLDivElement>();
  let previewUrl = $state("");
  let previewKey = $state("");
  let previewed = $state<{ storyId: string; key: string; id: string } | null>(null);
  let previewDescription = $state("");
  let previewBusy = $state(false);
  let previewError = $state<string | null>(null);
  let controller: AbortController | undefined;
  let serial = 0;

  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved.catalog.categories));
  const issue = $derived(catalogIssue(draft, saved.limits, saved.tiers));
  const groups = $derived(catalogGroups(draft));
  const savedByKey = $derived(new Map(saved.catalog.categories.map((category) => [category.key, category])));
  const defaultsByKey = $derived(new Map(saved.defaults.map((category) => [category.key, category])));
  const readyStories = $derived(saved.stories.filter((story) => story.ready));
  const tierLabels = $derived(new Map(saved.tiers.map((tier) => [tier.id, tier.label])));
  const number = new Intl.NumberFormat("en");

  beforeNavigate(({ cancel }) => {
    if (dirty) {
      cancel(); navigationBlocked = true; error = "Save your changes before leaving, or discard them.";
      void tick().then(() => { saveStatus?.scrollIntoView({ block: "center", behavior: "instant" }); saveStatus?.focus({ preventScroll: true }); });
    }
  });

  function name(category: CatalogCategory): string {
    return category.label.trim() || category.key;
  }

  function cancelPreview() {
    controller?.abort();
    serial += 1;
    previewBusy = false;
  }

  function clearPreview() {
    cancelPreview();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = ""; previewKey = ""; previewDescription = ""; previewed = null;
  }

  onMount(() => clearPreview);

  // A shown image is cleared once its story changes or its milestone is edited away from what was saved.
  $effect(() => {
    const shown = previewed;
    if (!shown) return;
    const category = draft.find(({ key }) => key === shown.key);
    const milestone = category?.milestones.find(({ id }) => id === shown.id);
    if (storyId !== shown.storyId || !category || !milestone || !milestonePreviewable(savedByKey.get(shown.key), category, milestone)) clearPreview();
  });

  async function preview(category: CatalogCategory, milestone: CatalogMilestone) {
    if (!storyId) return;
    const key = JSON.stringify([storyId, category.key, milestone.id]);
    void tick().then(() => previewStatus?.scrollIntoView({ block: "nearest" }));
    if (key === previewKey && previewUrl) return;
    cancelPreview();
    previewError = null;
    previewBusy = true;
    const requestSerial = serial;
    // The response belongs to the story it was requested for, not to a later selection.
    const requestedStory = storyId;
    const description = `${name(category)} ${milestone.label} at ${number.format(milestone.at)}`;
    controller = new AbortController();
    try {
      const result = await requestCeremonyPreview(globalThis.fetch.bind(globalThis), {
        story_id: requestedStory, format: "png", milestone: { key: category.key, id: milestone.id },
      }, controller.signal);
      if (requestSerial !== serial || storyId !== requestedStory) return;
      if (!result.ok) { previewError = result.error.message; return; }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(result.data);
      previewKey = key;
      previewDescription = description;
      previewed = { storyId: requestedStory, key: category.key, id: milestone.id };
    } catch (cause) {
      if (requestSerial === serial && !(cause instanceof DOMException && cause.name === "AbortError")) {
        previewError = cause instanceof Error ? cause.message : "Could not load the preview.";
      }
    } finally {
      if (requestSerial === serial) previewBusy = false;
    }
  }

  function received(response: CatalogResponse) {
    saved = response;
    // Keep the chosen story only while the new response still offers it ready.
    const ready = response.stories.filter((story) => story.ready);
    storyId = ready.some((story) => story.id === storyId) ? storyId : ready[0]?.id ?? "";
    draft = structuredClone(response.catalog.categories);
    conflict = false;
    error = null;
    navigationBlocked = false;
    // A saved catalog can rename or remove the previewed milestone.
    clearPreview();
  }

  async function save() {
    if (busy || !dirty || issue || conflict) return;
    busy = true; error = null; notice = null; navigationBlocked = false;
    const result = await requestDiscord<unknown>(globalThis.fetch.bind(globalThis), "achievements/catalog", "PUT",
      catalogBody(saved.catalog.version, $state.snapshot(draft)));
    busy = false;
    if (!result.ok) {
      conflict = result.error.status === 409;
      error = conflict ? "Someone saved a newer catalog. Your edits are kept until you reload." : result.error.message;
      return;
    }
    const response = parseCatalogResponse(result.data);
    if (!response) { error = "The server returned an unexpected catalog. Reload to see what was saved."; conflict = true; return; }
    received(response);
    notice = "Saved. Applies to the next evaluation.";
  }

  async function reloadSaved() {
    busy = true; error = null; notice = null; navigationBlocked = false;
    const result = await requestDiscord<unknown>(globalThis.fetch.bind(globalThis), "achievements/catalog");
    busy = false;
    const response = result.ok ? parseCatalogResponse(result.data) : null;
    if (!response) { error = result.ok ? "The server returned an unexpected catalog." : result.error.message; return; }
    received(response);
    notice = "Saved catalog loaded.";
  }

  function discard() {
    draft = structuredClone($state.snapshot(saved.catalog.categories));
    error = conflict ? "Reload the saved catalog to resolve the conflict." : null;
    notice = null;
    navigationBlocked = false;
  }

  function addMilestone(category: CatalogCategory) {
    category.milestones.push(nextMilestone(category, saved.limits, saved.tiers));
  }

  function reset(category: CatalogCategory) {
    const seeded = resetCategory(category, saved.defaults);
    const index = draft.findIndex(({ key }) => key === category.key);
    if (seeded && index >= 0) draft[index] = seeded;
  }
</script>

<ManageHeader area="Discord" title="Achievements" lead="Milestones, names and styles for achievement categories. Saved changes apply to the next evaluation; existing awards are kept." />

<div class="catalog-workspace">
  <section class="settings" aria-label="Achievement catalog">
    <fieldset disabled={busy}>
      {#each groups as group (group.kind)}
        <div class="group">
          <div class="section-head"><h2>{group.label}</h2></div>
          {#if group.kind === "role"}<p class="hint">Styles follow the Discord roles.</p>{/if}
          {#each group.categories as category (category.key)}
            {@const editable = catalogEditable(category.kind)}
            {@const savedCategory = savedByKey.get(category.key)}
            {@const categoryHint = categoryIssue(category, saved.limits, saved.tiers)}
            {@const open = editable.milestones && expanded[category.key] === true}
            {@const panelId = `milestones-${category.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
            <div class="category" class:off={!category.enabled}>
              <div class="category-row">
                <Toggle bind:checked={category.enabled} label={`Enable ${name(category)}`} />
                {#if editable.label}
                  <TextInput bind:value={category.label} required invalid={!category.label.trim()} aria-label={`${savedCategory?.label ?? category.key} name`} />
                {:else}
                  <span class="fixed-name">{category.label}</span>
                {/if}
                <span class="category-state">
                  {#if !sameCategory(category, savedCategory)}<span class="dirty-state">Edited</span>{/if}
                  {#if editable.milestones}{category.milestones.length} {category.milestones.length === 1 ? "milestone" : "milestones"}{/if}
                </span>
                {#if editable.milestones}
                  <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={panelId} aria-label={`${open ? "Hide" : "Edit"} ${name(category)} milestones`} onclick={() => { expanded[category.key] = !open; }}>{open ? "Hide" : "Edit"}</Button>
                {/if}
              </div>
              {#if categoryHint && !open}<p class="row-hint">{categoryHint}</p>{/if}
              {#if open}
                {@const max = catalogThresholdMax(category.kind, saved.limits)}
                <div class="milestones" id={panelId}>
                  <div class="milestone-columns" aria-hidden="true"><span>{category.kind === "profession" ? "Level" : "Threshold"}</span><span>Label</span><span>Style</span><span></span></div>
                  {#each category.milestones as milestone, index (index)}
                    {@const rowName = `${name(category)} milestone ${index + 1}`}
                    {@const previewable = milestonePreviewable(savedCategory, category, milestone)}
                    <div class="milestone">
                      <NumberInput bind:value={milestone.at} min={1} {max} step={1} required invalid={!Number.isInteger(milestone.at) || milestone.at < 1 || milestone.at > max} aria-label={`${rowName} threshold`} />
                      <TextInput bind:value={milestone.label} required invalid={!milestone.label.trim()} aria-label={`${rowName} label`} />
                      <Select bind:value={milestone.tier} aria-label={`${rowName} style`}>
                        {#if !tierLabels.has(milestone.tier)}<option value={milestone.tier}>Choose a style</option>{/if}
                        {#each saved.tiers as tier (tier.id)}<option value={tier.id}>{tier.label}</option>{/each}
                      </Select>
                      <div class="milestone-actions">
                        <Button variant="ghost" size="sm" disabled={!previewable || !storyId} title={previewable ? undefined : "Save to preview"} aria-label={`Preview ${rowName}`} onclick={() => void preview(category, milestone)}>Preview</Button>
                        <Button variant="ghost" size="sm" aria-label={`Remove ${rowName}`} onclick={() => { category.milestones.splice(index, 1); }}>Remove</Button>
                      </div>
                    </div>
                  {/each}
                  {#if categoryHint}<p class="row-hint" role="status">{categoryHint}</p>{/if}
                  {#if category.milestones.some((item) => !milestonePreviewable(savedCategory, category, item))}<p class="hint">Save to preview new or edited milestones.</p>{/if}
                  <div class="milestone-tools">
                    <Button variant="secondary" size="sm" disabled={category.milestones.length >= saved.limits.milestones_max} onclick={() => addMilestone(category)}>Add milestone</Button>
                    {#if canSortMilestones(category.milestones)}<Button variant="ghost" size="sm" onclick={() => { category.milestones = sortMilestones(category.milestones); }}>Sort by threshold</Button>{/if}
                    <Button variant="ghost" size="sm" disabled={!defaultsByKey.has(category.key) || sameCategory({ ...category, enabled: true }, { ...defaultsByKey.get(category.key)!, enabled: true })} onclick={() => reset(category)}>Reset to defaults</Button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </fieldset>

    <footer class="save-bar">
      <p class="hint">Edits never revoke or repeat an award. Newly reachable milestones are recorded quietly; later progress announces.</p>
      <div bind:this={saveStatus} class="save-status" tabindex="-1"><FormStatus {error} warning={dirty && issue ? issue : null} saved={!!notice && !dirty} savedText={notice ?? ""} live={!navigationBlocked} compact /></div>
      <div class="save-actions">
        {#if dirty}<span class="dirty-state">Unsaved changes</span>{/if}
        <Button disabled={busy || !dirty || !!issue || conflict} onclick={() => void save()}>{busy ? "Saving…" : "Save changes"}</Button>
        {#if conflict}<Button variant="secondary" disabled={busy} onclick={() => dirty ? reloadDialog?.open() : void reloadSaved()}>Reload saved catalog</Button>
        {:else}<Button variant="ghost" disabled={busy || !dirty} onclick={() => discardDialog?.open()}>Discard changes</Button>{/if}
        <span class="saved-state">Saved version {saved.catalog.version}</span>
      </div>
    </footer>
  </section>

  <aside class="preview" aria-label="Milestone preview">
    <div class="section-head"><h2>Preview</h2></div>
    <p class="hint">Pick Preview on a saved milestone. Marked DEMO, never posted.</p>
    <Field label="Story">
      <Select bind:value={storyId} disabled={readyStories.length === 0}>
        {#if readyStories.length === 0}<option value="">No stories ready</option>{/if}
        {#each readyStories as story (story.id)}<option value={story.id}>{story.label}</option>{/each}
      </Select>
    </Field>
    <div class="preview-image" aria-busy={previewBusy} bind:this={previewStatus}>
      {#if previewUrl}
        <img src={previewUrl} alt={previewDescription} width="768" height="432" />
      {:else if previewBusy}<p role="status">Rendering preview…</p>
      {:else if readyStories.length === 0}<p>Ceremony artwork is not installed yet.</p>
      {:else}<p>No milestone selected.</p>{/if}
    </div>
    {#if previewBusy && previewUrl}<p class="hint" role="status">Updating preview…</p>{/if}
    {#if previewUrl && !previewBusy}<p class="hint">{previewDescription}</p>{/if}
    <FormStatus error={previewError} compact />
  </aside>
</div>

<ConfirmDialog bind:this={reloadDialog} title="Reload saved catalog?" body="Unsaved changes will be lost." confirmLabel="Reload catalog" onconfirm={() => void reloadSaved()} />
<ConfirmDialog bind:this={discardDialog} title="Discard unsaved changes?" body="The saved catalog stays as it is." confirmLabel="Discard changes" onconfirm={discard} />

<style>
  .catalog-workspace { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 32px; align-items: start; }
  .settings, .preview { min-width: 0; }
  fieldset { display: grid; gap: 22px; padding: 0; margin: 0; border: 0; min-width: 0; }
  .group { display: grid; gap: 6px; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px 14px; }
  h2 { margin: 0; color: var(--text-heading); font-weight: var(--weight-regular); font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .hint, .saved-state, .row-hint { margin: 0; color: var(--text-body); font-size: var(--text-xs); line-height: 1.5; overflow-wrap: anywhere; }
  .row-hint { color: var(--color-gold); }
  .category { display: grid; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--border-default); }
  .category-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto; align-items: center; gap: 4px 12px; }
  .category-row :global(.check span) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .category-row :global(.check) { min-width: 44px; min-height: 44px; justify-content: center; align-items: center; }
  .fixed-name { color: var(--text-heading); font-size: var(--text-sm); }
  .category.off .fixed-name { color: var(--text-muted); }
  .category-state { display: flex; gap: 8px; color: var(--text-body); font-size: var(--text-xs); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .milestones { display: grid; gap: 8px; padding: 4px 0 8px 56px; }
  .milestone-columns, .milestone { display: grid; grid-template-columns: 110px minmax(0, 1fr) 130px auto; align-items: center; gap: 8px; }
  .milestone-columns { font-size: var(--text-xs); color: var(--text-body); }
  .milestone-actions, .milestone-tools, .save-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .dirty-state { color: var(--color-gold); font-size: var(--text-xs); }
  .save-actions .dirty-state { flex-basis: 100%; }
  .save-bar { position: sticky; bottom: 0; display: grid; gap: 10px; margin-top: 20px; padding: 12px 0 max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border-default); background: var(--bg-page); z-index: 2; }
  .save-status:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 4px; }
  .preview { position: sticky; top: 5rem; display: grid; grid-auto-rows: max-content; gap: 14px; }
  .preview-image { display: grid; place-items: center; aspect-ratio: 16 / 9; border: 1px solid var(--border-default); background: var(--color-deep); overflow: hidden; }
  .preview-image img { display: block; width: 100%; height: auto; image-rendering: pixelated; }
  .preview-image[aria-busy="true"] img { opacity: 0.6; }
  .preview-image p { max-width: 32ch; padding: 16px; margin: 0; text-align: center; color: var(--text-body); font-size: var(--text-sm); line-height: 1.5; }
  @media (max-width: 1180px) {
    .catalog-workspace { grid-template-columns: 1fr; gap: 26px; }
    .preview { position: static; max-width: 768px; order: -1; }
  }
  @media (max-width: 640px) {
    .milestones { padding-left: 0; }
    .milestone-columns { display: none; }
    .milestone { grid-template-columns: 90px minmax(0, 1fr); }
    .category-row { grid-template-columns: 44px minmax(0, 1fr) auto; }
    .category-state { grid-column: 2; }
  }
</style>
