<script lang="ts">
  import { enhance } from "$app/forms";

  import "$lib/events/editor/editor.css";

  import { GUILD_RANKS, GUILD_RANK_LABELS } from "$lib/api/guildStats";
  import Button from "$lib/design-system/components/Button.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import ConfirmDialog from "$lib/design-system/components/forms/ConfirmDialog.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import FormStatus from "$lib/design-system/components/forms/FormStatus.svelte";
  import InstantField from "$lib/design-system/components/forms/InstantField.svelte";
  import Select from "$lib/design-system/components/forms/Select.svelte";
  import TextArea from "$lib/design-system/components/forms/TextArea.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";
  import EmojiPicker from "$lib/emoji/EmojiPicker.svelte";
  import EventSky from "$lib/events/components/EventSky.svelte";
  import { themeVars } from "$lib/events/theme";
  import type { PostFormContext } from "$lib/server/postFormContext";

  import { POST_BRANCHES, POST_TIER_LABELS, audienceChip, postStatus } from "../audience";
  import PostBody from "../components/PostBody.svelte";
  import { formatPostDate } from "../format";
  import { POST_FEEDS, postHref, type GuildPost, type PostFeed, type PostStatus, type PostTier } from "../types";
  import { MAX_POST_BODY } from "../validate";
  import { PostDraft, SKY_PRESETS } from "./draft.svelte";

  let {
    mode,
    initial = null,
    initialPublished = false,
    initialUpdatedAt = null,
    initialFeed = "news",
    context = null,
    error = null,
    saved = false,
    auditWarning = false,
  }: {
    mode: "create" | "edit";
    initial?: GuildPost | null;
    initialPublished?: boolean;
    /** Stored version the form loaded from; a save based on an older one is rejected. */
    initialUpdatedAt?: number | null;
    /** Feed a new post starts in, e.g. from the feed page's "New post" link. */
    initialFeed?: PostFeed;
    /** Picker data; the audience section degrades without it. */
    context?: PostFormContext | null;
    /** Rejection from the last server submission. */
    error?: string | null;
    saved?: boolean;
    /** The last action succeeded but its audit row did not land. */
    auditWarning?: boolean;
  } = $props();

  const TIERS: PostTier[] = ["everyone", "signedIn", "members", "managers"];

  const STATUS_COPY: Record<PostStatus, string> = {
    draft: "Draft. Only post managers can see it.",
    scheduled: "Scheduled. It goes live at the publish date.",
    live: "Goes live when you save.",
    expired: "Past its expiry date. Only post managers can see it.",
  };

  // The draft deliberately seeds from the props once - the parent remounts the
  // editor via {#key} when the post changes.
  // svelte-ignore state_referenced_locally
  const draft = new PostDraft({ mode, initial, initialPublished, initialUpdatedAt, initialFeed });

  let bodyInput = $state<HTMLTextAreaElement>();
  let deleteForm = $state<HTMLFormElement>();
  let confirmDelete = $state<ConfirmDialog | null>(null);

  const footerError = $derived(draft.showValidation && draft.liveError ? draft.liveError : error);
  const footerWarning = $derived(auditWarning ? "Saved. The audit log entry didn't go through." : null);
  // A saved pick stays listed even if the ladder no longer has it (or failed to load).
  const seqRankChoices = $derived([...new Set([...(context?.seqRanks ?? []), ...draft.seqRanks])]);
  const status = $derived(postStatus(draft.post, draft.published, new Date()));
  const chip = $derived(audienceChip(draft.post.audience));
  const previewDate = $derived(formatPostDate(draft.post.publishAt ?? new Date().toISOString()));
</script>

<div class="evf-editor">
  <aside class="evf-side" aria-label="Post preview">
    <div>
      <SectionLabel>Preview</SectionLabel>
      <EventSky theme={draft.theme} dim={status === "expired"}>
        <div class="pe-band">
          <span
            class="pe-band-name"
            style="background-image: linear-gradient(90deg, {draft.accent}, {draft.accentSecondary})"
          >
            {draft.title || "Post title"}
          </span>
          <span class="pe-band-summary">{draft.summary || "Summary."}</span>
          <span class="pe-band-meta">
            {POST_FEEDS[draft.feed].label} · {previewDate}{#if draft.pinned}&nbsp;· Pinned{/if}{#if chip}&nbsp;· {chip}{/if}
          </span>
        </div>
      </EventSky>
      <p class="seq-hint">{STATUS_COPY[status]}</p>
    </div>

    <div>
      <SectionLabel>Who sees this</SectionLabel>
      <p class="pe-audience">{draft.audienceText}</p>
      <p class="seq-hint">Post managers always see every post.</p>
    </div>

    <div>
      <SectionLabel>Body preview</SectionLabel>
      <div class="pe-body-preview" style={themeVars(draft.theme)}>
        {#if draft.body.trim()}
          <PostBody source={draft.body} />
        {:else}
          <p class="seq-hint">The body preview appears as you type.</p>
        {/if}
      </div>
    </div>
  </aside>

  <div class="evf-main">
    <form class="evf-form" method="POST" action="?/save" use:enhance={draft.submit}>
      <input type="hidden" name="payload" value={draft.payload} />
      <input type="hidden" name="baseUpdatedAt" value={draft.knownUpdatedAt ?? ""} />

      <FormSection id="identity" title="Identity" class="evf-half">
        <div class="evf-grid-2">
          <Field label="Title">
            <TextInput bind:value={draft.title} oninput={() => draft.syncSlug()} maxlength={120} />
          </Field>
          {#if mode === "create"}
            <Field label="Slug">
              <TextInput
                mono
                bind:value={draft.slug}
                oninput={() => (draft.slugEdited = true)}
                maxlength={64}
                spellcheck="false"
              />
            </Field>
          {:else}
            <Field label="Address" element="div">
              <span class="evf-static">{postHref(draft.post)}</span>
            </Field>
          {/if}
        </div>
        <Field label="Summary" hint="One line for the feed and the homepage.">
          <TextInput bind:value={draft.summary} maxlength={240} />
        </Field>
        <div class="evf-grid-2">
          <Field label="Feed" element="label">
            <Select bind:value={draft.feed}>
              <option value="news">News</option>
              <option value="announcements">Announcements</option>
            </Select>
          </Field>
          <div class="pe-toggles">
            <Toggle
              bind:checked={draft.published}
              label="Published"
              hint="Unpublished drafts stay with post managers."
            />
            <Toggle bind:checked={draft.pinned} label="Pinned" hint="Held at the top of its feed." />
          </div>
        </div>
      </FormSection>

      <FormSection id="audience" title="Audience" class="evf-half">
        <Field label="Who can see it" element="label">
          <Select bind:value={draft.tier}>
            {#each TIERS as tier (tier)}
              <option value={tier}>{POST_TIER_LABELS[tier]}</option>
            {/each}
          </Select>
        </Field>
        {#if draft.tier === "members"}
          <p class="seq-hint pe-narrow-hint">
            Leave every box empty to reach all members. Tick boxes to reach only members who match at least one.
          </p>
          <fieldset class="pe-choices">
            <legend class="seq-field-label">Guild rank</legend>
            <div class="pe-choice-grid">
              {#each GUILD_RANKS as rank (rank)}
                <label class="evf-check">
                  <input
                    type="checkbox"
                    checked={draft.guildRanks.includes(rank)}
                    onchange={() => draft.toggleGuildRank(rank)}
                  />
                  {GUILD_RANK_LABELS[rank]}
                </label>
              {/each}
            </div>
          </fieldset>
          <fieldset class="pe-choices">
            <legend class="seq-field-label">Sequoia rank</legend>
            {#if seqRankChoices.length === 0}
              <p class="seq-hint">Couldn't load the Sequoia ranks. Reload to try again.</p>
            {:else}
              <div class="pe-choice-grid">
                {#each seqRankChoices as rank (rank)}
                  <label class="evf-check">
                    <input
                      type="checkbox"
                      checked={draft.seqRanks.includes(rank)}
                      onchange={() => draft.toggleSeqRank(rank)}
                    />
                    {rank}
                  </label>
                {/each}
              </div>
            {/if}
          </fieldset>
          <fieldset class="pe-choices">
            <legend class="seq-field-label">Branch</legend>
            <div class="pe-choice-grid">
              {#each POST_BRANCHES as branch (branch.key)}
                <label class="evf-check">
                  <input
                    type="checkbox"
                    checked={draft.branches.includes(branch.key)}
                    onchange={() => draft.toggleBranch(branch.key)}
                  />
                  {branch.label}
                </label>
              {/each}
            </div>
            <p class="seq-hint">Counts full branch members. Trainees are left out.</p>
          </fieldset>
        {/if}
      </FormSection>

      <FormSection id="schedule" title="Schedule" class="evf-half">
        <Field label="Publish at (UTC)" element="div" hint="Empty goes live the moment it is saved as published.">
          <div class="pe-instant">
            <InstantField bind:value={draft.publishAt} name="Publish" />
            {#if draft.publishAt}
              <Button size="sm" variant="ghost" onclick={() => (draft.publishAt = "")}>Clear</Button>
            {/if}
          </div>
        </Field>
        <Field label="Expires at (UTC)" element="div" hint="Empty never expires.">
          <div class="pe-instant">
            <InstantField bind:value={draft.expiresAt} name="Expiry" />
            {#if draft.expiresAt}
              <Button size="sm" variant="ghost" onclick={() => (draft.expiresAt = "")}>Clear</Button>
            {/if}
          </div>
        </Field>
      </FormSection>

      <FormSection id="sky" title="Sky" class="evf-half">
        <div class="pe-presets" role="group" aria-label="Sky presets">
          {#each SKY_PRESETS as preset (preset.name)}
            <button
              type="button"
              class="pe-preset focus-ring"
              style="background: linear-gradient(160deg, {preset.theme.sky[0]}, {preset.theme.sky[1]}); border-color: {preset.theme.accent}; color: {preset.theme.accent}"
              onclick={() => draft.applyTheme(preset.theme)}
            >
              {preset.name}
            </button>
          {/each}
        </div>
        <div class="evf-grid-colors">
          <Field label="Sky top">
            <span class="evf-color-pair">
              <input type="color" bind:value={draft.skyTop} />
              <input class="seq-input seq-input-mono" bind:value={draft.skyTop} maxlength="7" spellcheck="false" />
            </span>
          </Field>
          <Field label="Sky bottom">
            <span class="evf-color-pair">
              <input type="color" bind:value={draft.skyBottom} />
              <input class="seq-input seq-input-mono" bind:value={draft.skyBottom} maxlength="7" spellcheck="false" />
            </span>
          </Field>
          <Field label="Accent">
            <span class="evf-color-pair">
              <input type="color" bind:value={draft.accent} />
              <input class="seq-input seq-input-mono" bind:value={draft.accent} maxlength="7" spellcheck="false" />
            </span>
          </Field>
          <Field label="Accent 2">
            <span class="evf-color-pair">
              <input type="color" bind:value={draft.accentSecondary} />
              <input
                class="seq-input seq-input-mono"
                bind:value={draft.accentSecondary}
                maxlength="7"
                spellcheck="false"
              />
            </span>
          </Field>
          <Field label="Stars">
            <span class="evf-color-pair">
              <input type="color" bind:value={draft.star} />
              <input class="seq-input seq-input-mono" bind:value={draft.star} maxlength="7" spellcheck="false" />
            </span>
          </Field>
        </div>
      </FormSection>

      <FormSection
        id="body"
        title="Body"
        meta={`${draft.body.length.toLocaleString()} / ${MAX_POST_BODY.toLocaleString()}`}
      >
        <EmojiPicker textarea={bodyInput} bind:value={draft.body} />
        <TextArea bind:value={draft.body} bind:element={bodyInput} rows={16} maxlength={MAX_POST_BODY} aria-label="Post body" class="pe-body-input" />
        <p class="seq-hint pe-cheats">
          **bold** · *italic* · [link](https://…) · - list · 1. list · ### heading · &gt; quote · `code` · :emoji:
        </p>
      </FormSection>

      <div class="evf-footer">
        <Button type="submit" disabled={draft.saving}>
          {mode === "edit" ? "Save changes" : draft.published ? "Publish post" : "Save draft"}
        </Button>
        {#if mode === "edit"}
          <a class="evf-view focus-ring" href={postHref(draft.post)}>View post</a>
        {/if}
        <FormStatus error={footerError} warning={footerWarning} {saved} compact />
      </div>
    </form>

    {#if mode === "edit"}
      <form bind:this={deleteForm} class="evf-danger" method="POST" action="?/delete" use:enhance>
        <!-- Pinned to the version the manager reviewed, like the save. -->
        <input type="hidden" name="baseUpdatedAt" value={draft.knownUpdatedAt ?? ""} />
        <Button size="sm" variant="ghost" onclick={() => confirmDelete?.open()}>Delete post</Button>
        <ConfirmDialog
          bind:this={confirmDelete}
          title="Delete post"
          body={`Delete "${draft.title}"? This can't be undone.`}
          confirmLabel="Confirm delete"
          cancelLabel="Keep"
          danger
          onconfirm={() => deleteForm?.requestSubmit()}
        />
      </form>
    {/if}
  </div>
</div>

<style>
  .pe-band {
    display: grid;
    gap: 6px;
    padding: 24px 20px;
  }

  .pe-band-name {
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    overflow-wrap: anywhere;
    text-transform: uppercase;
  }

  .pe-band-summary {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .pe-band-meta {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .pe-audience {
    margin: 0 0 6px;
    color: var(--text-heading);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .pe-body-preview {
    padding: 18px 16px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--ev-sky-1) 35%, transparent);
  }

  .pe-toggles {
    display: grid;
    align-content: start;
    gap: 10px;
    padding-top: 4px;
  }

  .pe-narrow-hint {
    margin: 0;
  }

  .pe-choices {
    display: grid;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .pe-choice-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
  }

  .pe-instant {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .pe-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pe-preset {
    padding: 6px 12px 5px;
    border: 1px solid;
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .pe-cheats {
    margin: 0;
    font-family: var(--font-data);
  }

  :global(.pe-body-input) {
    min-height: 320px;
    font-family: var(--font-data);
    line-height: 1.6;
    resize: vertical;
  }
</style>
