<script lang="ts">
  import Button from "$lib/design-system/components/Button.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";
  import MarkdownField from "./MarkdownField.svelte";
  import {
    LIMITS,
    charCount,
    embedCharacters,
    fromLocalInput,
    hexColor,
    parseHexColor,
    toLocalInput,
    type Issues,
  } from "./format";
  import type { DiscordContext, Embed } from "./types";

  let {
    embed = $bindable(),
    index,
    count,
    issues,
    context,
    onmove,
    onduplicate,
    onremove,
  }: {
    embed: Embed;
    index: number;
    count: number;
    issues: Issues;
    context: DiscordContext;
    onmove: (by: -1 | 1) => void;
    onduplicate: () => void;
    onremove: () => void;
  } = $props();

  const at = $derived(`embeds.${index}`);
  const headingId = $props.id();
  let hexDraft = $state<string | null>(null);
  // Optional groups start open when they hold content, then stay as staff leave them:
  // clearing a value while typing must not collapse the group under the cursor.
  // svelte-ignore state_referenced_locally
  let authorOpen = $state(!!embed.author);
  // svelte-ignore state_referenced_locally
  let imagesOpen = $state(!!(embed.image || embed.thumbnail));
  // svelte-ignore state_referenced_locally
  let footerOpen = $state(!!(embed.footer || embed.timestamp));

  function setAuthor(patch: Partial<NonNullable<Embed["author"]>>) {
    const next = { name: "", ...embed.author, ...patch };
    embed.author = next.name || next.url || next.icon_url ? next : undefined;
  }

  function setFooter(patch: Partial<NonNullable<Embed["footer"]>>) {
    const next = { text: "", ...embed.footer, ...patch };
    embed.footer = next.text || next.icon_url ? next : undefined;
  }

  function setImage(part: "image" | "thumbnail", url: string) {
    embed[part] = url ? { url } : undefined;
  }

  function moveField(at: number, by: -1 | 1) {
    const fields = embed.fields ?? [];
    const to = at + by;
    if (to < 0 || to >= fields.length) return;
    [fields[at], fields[to]] = [fields[to], fields[at]];
  }
</script>

<section class="embed-editor" aria-labelledby={headingId} style:--embed-colour={embed.color === undefined ? "var(--border-strong)" : hexColor(embed.color)}>
  <header class="embed-head">
    <h3 id={headingId}>Embed {index + 1}</h3>
    <span class="embed-total">{embedCharacters(embed)} characters</span>
    <div class="embed-tools">
      <button type="button" aria-label={`Move embed ${index + 1} up`} disabled={index === 0} onclick={() => onmove(-1)}>↑</button>
      <button type="button" aria-label={`Move embed ${index + 1} down`} disabled={index === count - 1} onclick={() => onmove(1)}>↓</button>
      <button type="button" disabled={count >= LIMITS.embeds} onclick={onduplicate}>Duplicate</button>
      <button type="button" aria-label={`Remove embed ${index + 1}`} onclick={onremove}>Remove</button>
    </div>
  </header>
  {#if issues[at]}<p class="embed-issue" role="alert">{issues[at]}</p>{/if}

  <div class="two-fields">
    <Field label="Title" hint={`${charCount(embed.title)} / ${LIMITS.title}`} error={issues[`${at}.title`]}>
      <TextInput bind:value={embed.title} invalid={!!issues[`${at}.title`]} />
    </Field>
    <Field label="Colour" element="div">
      <div class="colour-row">
        <input type="color" aria-label="Embed colour" value={hexColor(embed.color ?? 0x19a775)} oninput={(event) => { embed.color = parseHexColor(event.currentTarget.value); hexDraft = null; }} />
        <TextInput mono aria-label="Embed colour hex" value={hexDraft ?? (embed.color === undefined ? "" : hexColor(embed.color))} placeholder="Default" maxlength={7} oninput={(event) => { hexDraft = event.currentTarget.value; const parsed = parseHexColor(hexDraft); if (parsed !== undefined) embed.color = parsed; }} onblur={() => (hexDraft = null)} />
        <button type="button" class="text-button" disabled={embed.color === undefined} onclick={() => { embed.color = undefined; hexDraft = null; }}>Default</button>
      </div>
    </Field>
  </div>
  <Field label="Title link" hint="Makes the title open this page." error={issues[`${at}.url`]}>
    <TextInput bind:value={embed.url} placeholder="https://" inputmode="url" invalid={!!issues[`${at}.url`]} />
  </Field>
  <MarkdownField label="Description" bind:value={embed.description} limit={LIMITS.description} rows={5} issue={issues[`${at}.description`]} {context} />

  <div class="embed-fields">
    <div class="fields-head"><h4>Fields</h4><span>{embed.fields?.length ?? 0} / {LIMITS.fields}</span></div>
    {#each embed.fields ?? [] as field, fieldIndex (fieldIndex)}
      <div class="field-editor">
        <Field label="Field name" hint={`${charCount(field.name)} / ${LIMITS.fieldName}`} error={issues[`${at}.fields.${fieldIndex}.name`]}>
          <TextInput bind:value={field.name} invalid={!!issues[`${at}.fields.${fieldIndex}.name`]} />
        </Field>
        <MarkdownField label="Field value" bind:value={field.value} limit={LIMITS.fieldValue} rows={2} issue={issues[`${at}.fields.${fieldIndex}.value`]} {context} compact />
        <div class="field-tools">
          <Toggle label="Inline" hint="Up to three inline fields share a row." bind:checked={field.inline} />
          <div class="embed-tools">
            <button type="button" aria-label={`Move field ${fieldIndex + 1} up`} disabled={fieldIndex === 0} onclick={() => moveField(fieldIndex, -1)}>↑</button>
            <button type="button" aria-label={`Move field ${fieldIndex + 1} down`} disabled={fieldIndex === (embed.fields?.length ?? 0) - 1} onclick={() => moveField(fieldIndex, 1)}>↓</button>
            <button type="button" aria-label={`Remove field ${fieldIndex + 1}`} onclick={() => embed.fields?.splice(fieldIndex, 1)}>Remove</button>
          </div>
        </div>
      </div>
    {/each}
    <Button variant="ghost" size="sm" disabled={(embed.fields?.length ?? 0) >= LIMITS.fields} onclick={() => { embed.fields ??= []; embed.fields.push({ name: "", value: "", inline: false }); }}>Add field</Button>
  </div>

  <details class="embed-group" bind:open={authorOpen}>
    <summary>Author</summary>
    <Field label="Author" hint={`${charCount(embed.author?.name)} / ${LIMITS.author}`} error={issues[`${at}.author`]}>
      <TextInput value={embed.author?.name ?? ""} oninput={(event) => setAuthor({ name: event.currentTarget.value })} />
    </Field>
    <div class="two-fields">
      <Field label="Author link" error={issues[`${at}.author_url`]}>
        <TextInput value={embed.author?.url ?? ""} placeholder="https://" inputmode="url" oninput={(event) => setAuthor({ url: event.currentTarget.value || undefined })} />
      </Field>
      <Field label="Author icon URL" error={issues[`${at}.author_icon`]}>
        <TextInput value={embed.author?.icon_url ?? ""} placeholder="https://" inputmode="url" oninput={(event) => setAuthor({ icon_url: event.currentTarget.value || undefined })} />
      </Field>
    </div>
  </details>

  <details class="embed-group" bind:open={imagesOpen}>
    <summary>Images</summary>
    <div class="two-fields">
      <Field label="Image URL" hint="Large image below the text." error={issues[`${at}.image`]}>
        <TextInput value={embed.image?.url ?? ""} placeholder="https://" inputmode="url" oninput={(event) => setImage("image", event.currentTarget.value)} />
      </Field>
      <Field label="Thumbnail URL" hint="Small image in the corner." error={issues[`${at}.thumbnail`]}>
        <TextInput value={embed.thumbnail?.url ?? ""} placeholder="https://" inputmode="url" oninput={(event) => setImage("thumbnail", event.currentTarget.value)} />
      </Field>
    </div>
  </details>

  <details class="embed-group" bind:open={footerOpen}>
    <summary>Footer and timestamp</summary>
    <Field label="Footer" hint={`${charCount(embed.footer?.text)} / ${LIMITS.footer}`} error={issues[`${at}.footer`]}>
      <TextInput value={embed.footer?.text ?? ""} oninput={(event) => setFooter({ text: event.currentTarget.value })} />
    </Field>
    <div class="two-fields">
      <Field label="Footer icon URL" error={issues[`${at}.footer_icon`]}>
        <TextInput value={embed.footer?.icon_url ?? ""} placeholder="https://" inputmode="url" oninput={(event) => setFooter({ icon_url: event.currentTarget.value || undefined })} />
      </Field>
      <Field label="Timestamp" element="div" hint="Readers see it in their own time zone." error={issues[`${at}.timestamp`]}>
        <div class="time-row">
          <input class="seq-input" type="datetime-local" aria-label="Timestamp" value={toLocalInput(embed.timestamp)} onchange={(event) => (embed.timestamp = fromLocalInput(event.currentTarget.value))} />
          <button type="button" class="text-button" onclick={() => (embed.timestamp = new Date().toISOString())}>Now</button>
          <button type="button" class="text-button" disabled={!embed.timestamp} onclick={() => (embed.timestamp = undefined)}>Clear</button>
        </div>
      </Field>
    </div>
  </details>
</section>

<style>
  .embed-editor {
    display: grid;
    gap: 14px;
    min-width: 0;
    padding: 16px 0 18px 14px;
    border-left: 3px solid var(--embed-colour);
    border-top: 1px solid var(--border-default);
  }

  .embed-head,
  .fields-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  h3,
  h4 {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  h4 {
    font-size: var(--text-2xs);
  }

  .embed-total,
  .fields-head span {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }

  .embed-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-left: auto;
  }

  .embed-tools button,
  .text-button {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border-default);
    border-radius: 3px;
    background: transparent;
    color: var(--text-body);
    font-size: var(--text-xs);
    cursor: pointer;
  }

  .embed-tools button:hover:not(:disabled),
  .text-button:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text-heading);
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  button:focus-visible,
  summary:focus-visible,
  input[type="color"]:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .embed-issue {
    margin: 0;
    color: var(--status-error);
    font-size: var(--text-xs);
  }

  .two-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .colour-row,
  .time-row {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }

  .colour-row :global(.seq-input) {
    min-width: 0;
    flex: 1;
  }

  .time-row input {
    min-width: 0;
    flex: 1;
  }

  input[type="color"] {
    flex: 0 0 42px;
    height: 38px;
    padding: 2px;
    border: 1px solid var(--border-default);
    background: var(--color-surface);
    cursor: pointer;
  }

  .embed-fields {
    display: grid;
    gap: 12px;
    justify-items: start;
  }

  .embed-fields > :global(*) {
    justify-self: stretch;
  }

  .embed-fields > :global(.seq-button) {
    justify-self: start;
  }

  .field-editor {
    display: grid;
    gap: 10px;
    padding: 12px 0 12px 12px;
    border-left: 1px solid var(--border-default);
  }

  .field-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .embed-group {
    display: grid;
    gap: 12px;
    border-top: 1px solid var(--border-default);
    padding-top: 10px;
  }

  .embed-group[open] {
    padding-bottom: 4px;
  }

  .embed-group > :global(.field),
  .embed-group > .two-fields {
    margin-top: 10px;
  }

  summary {
    min-height: 32px;
    display: flex;
    align-items: center;
    color: var(--text-heading);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  @container discord-editor (max-width: 520px) {
    .two-fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .embed-editor {
      padding-left: 10px;
    }

    .embed-tools button,
    .text-button {
      min-height: 44px;
    }
  }
</style>
