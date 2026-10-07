<script lang="ts">
  import { requestDiscord } from "$lib/api/discordManagement";
  import { beforeNavigate } from "$app/navigation";
  import ConfirmDialog from "$lib/design-system/components/forms/ConfirmDialog.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormStatus from "$lib/design-system/components/forms/FormStatus.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import TextArea from "$lib/design-system/components/forms/TextArea.svelte";
  import Select from "$lib/design-system/components/forms/Select.svelte";
  import PostBody from "$lib/posts/components/PostBody.svelte";
  import type { Definition, DiscordContext, Embed, ManagedMessage, RoleButton } from "./types";

  let { initial, context: initialContext, problem }: { initial: ManagedMessage[]; context: DiscordContext; problem: string | null } = $props();
  // svelte-ignore state_referenced_locally
  let context = $state(structuredClone($state.snapshot(initialContext)));
  // Initial server data seeds an editable workspace, not a second persistence owner.
  // svelte-ignore state_referenced_locally
  let messages = $state<ManagedMessage[]>(initial);
  let selected = $state<ManagedMessage | null>(null);
  let draft = $state<Definition | null>(null);
  let baseline = $state("");
  let tab = $state<"message" | "buttons" | "emoji" | "roles">("message");
  let mobilePreview = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let emojiName = $state("");
  let emojiFile = $state<File | null>(null);
  let emojiImage = $state("");
  let importLink = $state("");
  let search = $state("");
  let discardDialog = $state<ConfirmDialog | null>(null);
  let deleteDialog = $state<ConfirmDialog | null>(null);
  let pendingSelection = $state<ManagedMessage | null>(null);
  let roleSearch = $state("");
  let uploadInput = $state<HTMLInputElement>();
  let pickerButtonId = $state<string | null>(null);
  const pickerButton = $derived(draft?.rows.flat().find((button) => button.id === pickerButtonId) ?? null);

  const dirty = $derived(draft !== null && JSON.stringify(draft) !== baseline);
  const unresolved = $derived(selected?.delivery_state === "uncertain" || selected?.delivery_state === "publishing");
  const filtered = $derived(messages.filter((m) => m.definition.name.toLowerCase().includes(search.toLowerCase())));
  const eligibleRoles = $derived(context.roles.filter((r) => r.eligible && r.approved));
  const roleChoices = $derived(context.roles.filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase())));

  beforeNavigate(({ cancel }) => { if (dirty) { cancel(); error = "Save your draft before leaving, or select Discard changes."; } });

  function select(message: ManagedMessage | null) {
    if (dirty) { pendingSelection = message; discardDialog?.open(); return; }
    open(message);
  }
  function open(message: ManagedMessage | null) {
    selected = message;
    draft = message ? structuredClone($state.snapshot(message.definition)) : {
      name: "New message", channel_id: context.channels[0]?.id ?? "", content: "Choose your roles below.", embeds: [], rows: [],
    };
    baseline = message ? JSON.stringify(draft) : "";
    error = null; notice = null; tab = "message"; mobilePreview = false; pickerButtonId = null;
  }
  function received(message: ManagedMessage) {
    messages = [message, ...messages.filter((m) => m.id !== message.id)];
    selected = message;
    draft = structuredClone(message.definition);
    baseline = JSON.stringify(draft);
  }
  async function request<T>(path: string, method = "GET", body?: unknown): Promise<T | null> {
    const result = await requestDiscord<T>(globalThis.fetch.bind(globalThis), path, method, body);
    if (!result.ok) { error = result.error.message; return null; }
    return result.data;
  }
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    busy = true; error = null; notice = null;
    try { await action(); } catch (e) { error = e instanceof Error ? e.message : "The request could not be completed"; }
    finally { busy = false; }
  }
  async function saveDraft() {
    if (!draft) return;
    const saved = selected
      ? await request<ManagedMessage>(`messages/${selected.id}`, "PUT", { definition: $state.snapshot(draft), version: selected.version })
      : await request<ManagedMessage>("messages", "POST", $state.snapshot(draft));
    if (!saved) return;
    received(saved); notice = "Draft saved. Discord has not changed.";
  }
  async function publishDraft() {
    if (!selected || dirty) return;
    const published = await request<ManagedMessage>(`messages/${selected.id}/publish`, "POST", { version: selected.version });
    if (published) {
      received(published); notice = "Published and verified on Discord.";
    } else {
      const publicationError = error;
      const refreshed = await request<ManagedMessage>(`messages/${selected.id}`);
      if (refreshed) {
        selected = refreshed;
        messages = messages.map((message) => message.id === refreshed.id ? refreshed : message);
      }
      error = publicationError;
    }
  }

  function parseLink(raw: string) {
    const match = /^https:\/\/(?:discord\.com|canary\.discord\.com|ptb\.discord\.com)\/channels\/1030187086722109570\/([0-9]+)\/([0-9]+)$/.exec(raw.trim());
    if (!match) throw new Error("Paste a Sequoia Discord message link");
    return { channel_id: match[1], message_id: match[2] };
  }
  async function importMessage() {
    if (dirty) { error = "Save or discard your current draft before importing another message."; return; }
    const imported = await request<ManagedMessage>("messages/adopt", "POST", parseLink(importLink));
    if (!imported) return;
    received(imported);
    importLink = ""; notice = "Message imported. Discord has not changed.";
  }
  function addEmbed() {
    draft?.embeds.push({ type: "rich", title: "", description: "", color: 0x19a775, fields: [] });
  }
  function addButton(row: number) {
    const role = eligibleRoles[0];
    draft?.rows[row].push({ id: crypto.randomUUID(), label: role?.name ?? "Open website", style: role ? 2 : 5, emoji: null, action: role ? { kind: "role", role_id: role.id } : { kind: "link", url: "https://seqwawa.com" } });
  }
  function move<T>(items: T[], at: number, by: number) {
    const to = at + by;
    if (to < 0 || to >= items.length) return;
    [items[at], items[to]] = [items[to], items[at]];
  }
  function actionType(button: RoleButton, kind: "role" | "link") {
    button.action = kind === "role" ? { kind, role_id: eligibleRoles[0]?.id ?? "" } : { kind, url: "https://seqwawa.com" };
    button.style = kind === "link" ? 5 : 2;
  }
  function previewText(raw: string) {
    return raw.replace(/<@&([0-9]+)>/g, (_, id) => `@${context.roles.find((r) => r.id === id)?.name ?? id}`);
  }
  function emojiUrl(id: string, animated = false) { return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=48`; }
  function safeUrl(raw: string | undefined) { try { const url = new URL(raw ?? ""); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } }
  function hex(value: number | undefined) { return `#${(value ?? 0x19a775).toString(16).padStart(6, "0")}`; }
  function setEmbedPart(embed: Embed, part: "image" | "thumbnail", value: string) { embed[part] = value ? { url: value } : undefined; }
  async function chooseUpload(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    if (file.size > 256 * 1024 || !["image/png", "image/jpeg", "image/gif"].includes(file.type)) { error = "Use a PNG, JPEG or GIF no larger than 256 KiB."; return; }
    emojiFile = file;
    emojiName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
    emojiImage = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
  }
  async function upload() {
    const emoji = await request<DiscordContext["emojis"][number]>("emojis", "POST", { name: emojiName, image: emojiImage });
    if (!emoji) return;
    context.emojis = [...context.emojis, emoji];
    if (pickerButton) pickerButton.emoji = { id: emoji.id, name: emoji.name, animated: emoji.animated };
    emojiFile = null; emojiImage = ""; emojiName = ""; if (uploadInput) uploadInput.value = "";
    notice = `Uploaded :${emoji.name}: to Discord.`;
  }
  async function approve(role: DiscordContext["roles"][number]) {
    if (!await request("self-service-roles", "POST", { role_id: role.id, enabled: !role.approved })) return;
    context.roles = context.roles.map((r) => r.id === role.id ? { ...r, approved: !r.approved } : r);
    notice = role.approved ? "Self-service disabled. Existing memberships are unchanged." : "Role enabled for self-service buttons.";
  }
  async function confirmedDelete() {
    if (!selected) return;
    if (!await request(`messages/${selected.id}`, "DELETE", { version: selected.version })) return;
    messages = messages.filter((m) => m.id !== selected?.id); selected = null; draft = null; baseline = "";
    notice = "Message deleted. Roles and memberships are unchanged.";
  }
</script>

<div class="discord-workspace" aria-busy={busy}>
  <header class="workspace-head">
    <div><h1>Discord messages</h1><p>Messages, embeds and self-service role panels.</p></div>
    <Button onclick={() => select(null)} disabled={busy}>New message</Button>
  </header>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  <div class="workspace-grid">
    <aside class="message-list" aria-label="Managed messages">
      <Field label="Find a message"><TextInput bind:value={search} placeholder="Search messages" /></Field>
      <nav>{#each filtered as message (message.id)}
        <button type="button" class:active={selected?.id === message.id} onclick={() => select(message)} disabled={busy}>
          <strong>{message.definition.name}</strong>
          <span>#{context.channels.find((c) => c.id === message.definition.channel_id)?.name ?? "Unknown channel"}</span>
          <small>{message.delivery_state === "uncertain" ? "Needs recovery" : message.published_version === message.version ? "Published" : message.published_version ? "Unpublished changes" : "Draft"}</small>
        </button>
      {:else}<p class="empty">{search ? "No matching messages." : "No managed messages yet."}</p>{/each}</nav>
      <details><summary>Edit an existing message</summary>
        <Field label="Discord message link"><TextInput bind:value={importLink} placeholder="https://discord.com/channels/…" /></Field>
        <Button variant="secondary" size="sm" disabled={busy || !importLink} onclick={() => perform(importMessage)}>Import message</Button>
      </details>
    </aside>

    {#if draft}
      <section class="editor-main">
        <div class="editor-heading"><h2>{draft.name || "Untitled message"}</h2><span>{dirty ? "Unsaved changes" : selected?.published_version === selected?.version ? "Published" : "Saved draft"}</span></div>
        <nav class="editor-tabs" aria-label="Message editor">
          {#each ["message", "buttons", "emoji", "roles"] as name}<button type="button" class:active={tab === name} onclick={() => { tab = name as typeof tab; mobilePreview = false; }}>{name === "emoji" ? "Emoji" : name === "roles" ? "Self-service roles" : name === "buttons" ? "Buttons" : "Message"}</button>{/each}
          <button type="button" class="preview-tab" class:active={mobilePreview} onclick={() => mobilePreview = !mobilePreview}>Preview</button>
        </nav>
        <fieldset class="editor-body" disabled={busy} class:mobile-hidden={mobilePreview}>
          {#if unresolved}
            <div class="delivery-warning" role="status"><strong>{selected?.delivery_state === "publishing" ? "Publication in progress" : "Publication needs recovery"}</strong><p>{selected?.delivery_error ?? "Publishing is still running. Reload to check its result."}</p>
              {#if selected?.delivery_state === "uncertain"}<Field label="Link to the published Discord message"><TextInput bind:value={importLink} /></Field><Button variant="secondary" disabled={busy || !importLink} onclick={() => perform(async () => { if (selected) { const recovered = await request<ManagedMessage>(`messages/${selected.id}/recover`, "POST", parseLink(importLink)); if (recovered) { received(recovered); notice = "Recovered and verified the existing message."; } } })}>Recover message</Button>{/if}
            </div>
          {/if}
          {#if tab === "message"}
            <div class="two-fields"><Field label="Name"><TextInput bind:value={draft.name} maxlength={100} /></Field><Field label="Channel"><Select aria-label="Channel" bind:value={draft.channel_id} disabled={busy || !!selected?.message_id}>{#each context.channels as channel}<option value={channel.id}>#{channel.name}</option>{/each}</Select></Field></div>
            <Field label="Message text"><TextArea bind:value={draft.content} maxlength={2000} rows={4} /></Field>
            {#each draft.embeds as embed, index (index)}
              <section class="embed-editor"><div class="section-heading"><h3>Embed {index + 1}</h3><div><button type="button" aria-label={`Move embed ${index + 1} up`} disabled={index === 0} onclick={() => draft && move(draft.embeds, index, -1)}>↑</button><button type="button" aria-label={`Remove embed ${index + 1}`} onclick={() => draft?.embeds.splice(index, 1)}>Remove</button></div></div>
                <div class="two-fields"><Field label="Title"><TextInput bind:value={embed.title} maxlength={256} /></Field><Field label="Colour"><input type="color" value={hex(embed.color)} oninput={(e) => embed.color = Number.parseInt(e.currentTarget.value.slice(1), 16)} /></Field></div>
                <Field label="Description"><TextArea bind:value={embed.description} maxlength={4096} rows={5} /></Field>
                {#each embed.fields ?? [] as field, fi (fi)}<div class="embed-field-editor"><Field label="Field name"><TextInput bind:value={field.name} maxlength={256} /></Field><Field label="Field value"><TextArea bind:value={field.value} maxlength={1024} rows={2} /></Field><label class="check"><input type="checkbox" bind:checked={field.inline} />Side by side</label><button type="button" aria-label={`Remove field ${fi + 1}`} onclick={() => embed.fields?.splice(fi, 1)}>Remove field</button></div>{/each}
                <Button variant="ghost" size="sm" disabled={(embed.fields?.length ?? 0) >= 25} onclick={() => { embed.fields ??= []; embed.fields.push({ name: "", value: "", inline: false }); }}>Add field</Button>
                <details><summary>Links, images and attribution</summary>
                  <Field label="Title link"><TextInput bind:value={embed.url} /></Field>
                  <div class="two-fields"><Field label="Image URL"><TextInput value={embed.image?.url ?? ""} oninput={(e) => setEmbedPart(embed, "image", e.currentTarget.value)} /></Field><Field label="Thumbnail URL"><TextInput value={embed.thumbnail?.url ?? ""} oninput={(e) => setEmbedPart(embed, "thumbnail", e.currentTarget.value)} /></Field></div>
                  <Field label="Author"><TextInput value={embed.author?.name ?? ""} oninput={(e) => { embed.author = e.currentTarget.value ? { ...embed.author, name: e.currentTarget.value } : undefined; }} /></Field>
                  {#if embed.author}<div class="two-fields"><Field label="Author link"><TextInput bind:value={embed.author.url} /></Field><Field label="Author icon URL"><TextInput bind:value={embed.author.icon_url} /></Field></div>{/if}
                  <Field label="Footer"><TextInput value={embed.footer?.text ?? ""} oninput={(e) => { embed.footer = e.currentTarget.value ? { ...embed.footer, text: e.currentTarget.value } : undefined; }} /></Field>
                  {#if embed.footer}<Field label="Footer icon URL"><TextInput bind:value={embed.footer.icon_url} /></Field>{/if}
                  <Field label="Timestamp" hint="ISO 8601, such as 2026-10-07T12:00:00Z"><TextInput bind:value={embed.timestamp} /></Field>
                </details>
              </section>
            {/each}
            <Button variant="secondary" disabled={draft.embeds.length >= 10} onclick={addEmbed}>Add embed</Button>
          {:else if tab === "buttons"}
            {#each draft.rows as row, ri (ri)}
              <section class="button-row-editor"><div class="section-heading"><h3>Button row {ri + 1}</h3><div><button type="button" aria-label={`Move row ${ri + 1} up`} disabled={ri === 0} onclick={() => draft && move(draft.rows, ri, -1)}>↑</button><button type="button" onclick={() => draft?.rows.splice(ri, 1)}>Remove row</button></div></div>
                {#each row as button, bi (button.id)}<div class="button-editor">
                  <div class="two-fields"><Field label="Button label"><TextInput bind:value={button.label} maxlength={80} /></Field><Field label="Action"><Select aria-label="Action" value={button.action.kind} onchange={(e) => actionType(button, e.currentTarget.value as "role" | "link")}><option value="role">Toggle role</option><option value="link">Open link</option></Select></Field></div>
                  {#if button.action.kind === "role"}<div class="two-fields"><Field label="Role"><Select aria-label="Role" bind:value={button.action.role_id}><option value="">Choose a role</option>{#each eligibleRoles as role}<option value={role.id}>{role.name}</option>{/each}</Select></Field><Field label="Colour"><Select aria-label="Colour" value={String(button.style)} onchange={(e) => button.style = Number(e.currentTarget.value)}><option value="1">Blue</option><option value="2">Grey</option><option value="3">Green</option><option value="4">Red</option></Select></Field></div>
                  {:else}<Field label="Destination"><TextInput bind:value={button.action.url} /></Field>{/if}
                  <div class="button-tools"><label>Unicode emoji<input class="seq-input" value={button.emoji && !("id" in button.emoji) ? button.emoji.name : ""} oninput={(e) => button.emoji = e.currentTarget.value ? { name: e.currentTarget.value } : null} /></label><Button variant="ghost" size="sm" onclick={() => { pickerButtonId = button.id; tab = "emoji"; }}>{#if button.emoji && "id" in button.emoji}<img src={emojiUrl(button.emoji.id, button.emoji.animated)} alt="" width="20" height="20" />{/if}Server emoji</Button><button type="button" aria-label={`Move ${button.label || "button"} left`} disabled={bi === 0} onclick={() => move(row, bi, -1)}>←</button><button type="button" aria-label={`Move ${button.label || "button"} right`} disabled={bi === row.length - 1} onclick={() => move(row, bi, 1)}>→</button><button type="button" onclick={() => row.splice(bi, 1)}>Remove</button></div>
                </div>{/each}
                <Button variant="ghost" size="sm" disabled={row.length >= 5} onclick={() => addButton(ri)}>Add button</Button>
              </section>
            {/each}
            <Button variant="secondary" disabled={draft.rows.length >= 5} onclick={() => { if (draft) { draft.rows.push([]); addButton(draft.rows.length - 1); } }}>Add button row</Button>
          {:else if tab === "emoji"}
            <h3>{pickerButton ? `Emoji for ${pickerButton.label || "button"}` : "Server emoji"}</h3>
            <div class="emoji-grid">{#each context.emojis.filter((e) => e.available) as emoji (emoji.id)}<button type="button" title={`:${emoji.name}:`} aria-label={`Use ${emoji.name}`} disabled={!pickerButton} onclick={() => { if (pickerButton) pickerButton.emoji = { id: emoji.id, name: emoji.name, animated: emoji.animated }; tab = "buttons"; }}><img src={emojiUrl(emoji.id, emoji.animated)} alt={emoji.name} loading="lazy" /></button>{/each}</div>
            <section class="upload"><h3>Upload an emoji</h3><Field label="Image" hint="PNG, JPEG or GIF, up to 256 KiB"><input type="file" accept="image/png,image/jpeg,image/gif" bind:this={uploadInput} onchange={chooseUpload} /></Field>
              {#if emojiFile}<div class="upload-preview"><img src={emojiImage} alt="Emoji upload preview" /><Field label="Emoji name"><TextInput bind:value={emojiName} maxlength={32} /></Field></div>{/if}
              <Button disabled={busy || !emojiFile || !emojiName} onclick={() => perform(upload)}>Upload to Discord</Button>
            </section>
          {:else}
            <p class="role-explanation">Enabled roles can be granted by anyone using a panel. Disabling self-service does not remove existing memberships.</p>
            <Field label="Find a role"><TextInput bind:value={roleSearch} /></Field>
            <ul class="role-list">{#each roleChoices as role (role.id)}<li><span>{role.name}</span><small>{!role.eligible ? "Protected or unavailable" : role.approved ? "Self-service enabled" : "Not enabled"}</small>{#if context.can_approve_roles && role.eligible}<Button variant="ghost" size="sm" disabled={busy} onclick={() => perform(() => approve(role))}>{role.approved ? "Disable" : "Enable"}</Button>{/if}</li>{/each}</ul>
          {/if}
        </fieldset>
        <footer class="editor-actions"><FormStatus error={error} warning={selected?.delivery_error} saved={!!notice} savedText={notice ?? ""} compact />
          <div><Button variant="secondary" disabled={busy || !dirty || unresolved} onclick={() => perform(saveDraft)}>Save draft</Button><Button disabled={busy || dirty || !selected || unresolved} onclick={() => perform(publishDraft)}>{busy ? "Working…" : selected?.message_id ? "Update Discord" : "Publish to Discord"}</Button>
            {#if selected}<Button variant="ghost" disabled={busy || dirty || unresolved} onclick={() => { const copy = structuredClone($state.snapshot(selected!.definition)); selected = null; draft = copy; draft.name += " copy"; baseline = ""; }}>Duplicate</Button><Button variant="ghost" disabled={busy || unresolved} onclick={() => deleteDialog?.open()}>Delete</Button>{/if}
            {#if dirty}<Button variant="ghost" disabled={busy} onclick={() => { pendingSelection = selected; discardDialog?.open(); }}>Discard changes</Button>{/if}
          </div>
        </footer>
      </section>

      <aside class="discord-preview" class:mobile-visible={mobilePreview} aria-label="Discord message preview">
        <header><strong>Discord preview</strong><span>#{context.channels.find((c) => c.id === draft?.channel_id)?.name ?? "Choose a channel"}</span>{#if selected?.message_id}<a href={`https://discord.com/channels/1030187086722109570/${selected.channel_id}/${selected.message_id}`} target="_blank" rel="noreferrer">Open message</a>{/if}</header>
        <div class="preview-message"><div class="bot-avatar" aria-hidden="true">S</div><div class="preview-content"><div class="bot-name">Sierra <small>APP</small></div><PostBody source={previewText(draft.content)} />
          {#each draft.embeds as embed, ei (ei)}<div class="discord-embed" style={`border-left-color:${hex(embed.color)}`}>
            {#if embed.thumbnail?.url && safeUrl(embed.thumbnail.url)}<img class="embed-thumb" src={safeUrl(embed.thumbnail.url)} alt="Embed thumbnail" />{/if}
            {#if embed.author}<div class="embed-author">{#if safeUrl(embed.author.icon_url)}<img src={safeUrl(embed.author.icon_url)} alt="" />{/if}{embed.author.name}</div>{/if}
            {#if embed.title}<strong class="embed-title">{embed.title}</strong>{/if}
            {#if embed.description}<PostBody source={previewText(embed.description)} />{/if}
            <div class="embed-fields">{#each embed.fields ?? [] as field, fi (fi)}<div class:embed-inline={field.inline}><strong>{field.name}</strong><PostBody source={previewText(field.value)} /></div>{/each}</div>
            {#if safeUrl(embed.image?.url)}<img class="embed-image" src={safeUrl(embed.image?.url)} alt="Embed illustration" />{/if}
            {#if embed.footer?.text || embed.timestamp}<small class="embed-footer">{embed.footer?.text ?? ""}{embed.timestamp ? ` · ${embed.timestamp}` : ""}</small>{/if}
          </div>{/each}
          <div class="preview-rows">{#each draft.rows as row, ri (ri)}<div>{#each row as button (button.id)}<span class={`discord-button style-${button.style}`}>{#if button.emoji}{#if "id" in button.emoji}<img src={emojiUrl(button.emoji.id, button.emoji.animated)} alt="" />{:else}{button.emoji.name}{/if}{/if}{button.label || "Button"}{button.action.kind === "link" ? " ↗" : ""}</span>{/each}</div>{/each}</div>
        </div></div>
      </aside>
    {:else}
      <section class="choose-message"><h2>Choose a message</h2><p>Edit an existing panel or create a message with embeds and buttons.</p><Button onclick={() => select(null)}>New message</Button><FormStatus error={error} saved={!!notice} savedText={notice ?? ""} /></section>
    {/if}
  </div>
</div>

<ConfirmDialog bind:this={deleteDialog} title="Delete this message?" body="The published Discord message will be deleted. Roles and memberships are not affected." confirmLabel="Delete message" danger onconfirm={() => void perform(confirmedDelete)} />
<ConfirmDialog bind:this={discardDialog} title="Discard unsaved changes?" body="The published message and last saved draft will remain unchanged." confirmLabel="Discard changes" onconfirm={() => { baseline = ""; open(pendingSelection); }} />

<style>
  .discord-workspace { padding: 24px 0; }
  .workspace-head, .section-heading, .editor-heading, .editor-actions > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h1 { margin: 0; color: var(--text-heading); font-size: var(--text-xl); }
  h2 { margin: 0; font-size: var(--text-lg); color: var(--text-heading); }
  h3 { margin: 0; font-size: var(--text-base); color: var(--text-heading); }
  p { line-height: 1.5; }
  .workspace-head p { margin: 8px 0 24px; color: var(--text-body); }
  .workspace-grid { display: grid; grid-template-columns: 200px minmax(320px, 1fr) minmax(280px, .9fr); gap: 24px; align-items: start; }
  .message-list { position: sticky; top: 6rem; display: grid; gap: 18px; }
  .message-list nav { display: grid; gap: 4px; max-height: 55vh; overflow-y: auto; }
  .message-list nav button { display: grid; gap: 5px; text-align: left; padding: 12px; background: transparent; border: 1px solid transparent; color: var(--text-body); cursor: pointer; }
  .message-list nav button.active { border-left-color: var(--color-gold); background: var(--color-surface); }
  .message-list strong { color: var(--text-heading); overflow-wrap: anywhere; }
  .message-list small, .message-list span, .editor-heading span { font-size: var(--text-xs); }
  .empty { color: var(--text-body); font-size: var(--text-sm); }
  details { border-top: 1px solid var(--border-default); padding-top: 12px; }
  summary { cursor: pointer; margin-bottom: 12px; color: var(--text-heading); font-size: var(--text-sm); }
  details :global(.field) { margin: 12px 0; }
  .editor-main { min-width: 0; }
  .editor-heading { min-height: 40px; align-items: baseline; }
  .editor-heading span { color: var(--color-gold); white-space: nowrap; }
  .editor-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border-default); margin: 12px 0 20px; }
  .editor-tabs button { color: var(--text-body); background: transparent; border: 0; border-bottom: 2px solid transparent; padding: 12px 8px; cursor: pointer; min-height: 44px; font-size: var(--text-sm); }
  .editor-tabs button.active { color: var(--color-gold); border-bottom-color: var(--color-gold); }
  .editor-tabs .preview-tab { display: none; }
  .editor-body { display: grid; gap: 18px; border: 0; padding: 0; margin: 0; min-width: 0; }
  .two-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .embed-editor, .button-row-editor, .upload { display: grid; gap: 14px; border-top: 1px solid var(--border-default); padding-top: 20px; }
  .section-heading > div, .button-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .section-heading button, .button-tools > button, .embed-field-editor > button { color: var(--text-body); background: transparent; border: 1px solid var(--border-default); border-radius: 4px; padding: 8px; min-height: 36px; cursor: pointer; }
  .button-editor, .embed-field-editor { display: grid; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--border-default); }
  .check { font-size: var(--text-sm); display: flex; gap: 8px; }
  input[type="color"] { width: 100%; height: 42px; border: 1px solid var(--border-default); background: var(--color-surface); }
  .button-tools label { display: grid; gap: 4px; flex: 1; min-width: 100px; max-width: 180px; font-size: var(--text-xs); }
  .emoji-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 8px; max-height: 300px; overflow: auto; }
  .emoji-grid button { min-height: 44px; border: 1px solid var(--border-default); background: var(--color-surface); cursor: pointer; border-radius: 6px; }
  .emoji-grid img, .upload-preview img { width: 32px; height: 32px; object-fit: contain; }
  .upload-preview { display: flex; gap: 12px; align-items: center; }
  .role-list { list-style: none; margin: 0; padding: 0; }
  .role-list li { display: flex; gap: 10px; align-items: center; border-bottom: 1px solid var(--border-default); padding: 10px 0; }
  .role-list li > span { flex: 1; }
  .role-list small { font-size: var(--text-xs); color: var(--text-body); }
  .role-explanation { margin: 0; color: var(--text-body); font-size: var(--text-sm); }
  .editor-actions { position: sticky; bottom: 0; background: var(--bg-page); border-top: 1px solid var(--border-default); padding: 14px 0; margin-top: 20px; display: grid; gap: 12px; z-index: 2; }
  .editor-actions > div { justify-content: start; flex-wrap: wrap; }
  .discord-preview { min-width: 0; position: sticky; top: 6rem; background: #313338; border-radius: 8px; color: #dbdee1; padding: 16px; }
  .discord-preview header { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #b5bac1; padding-bottom: 16px; }
  .discord-preview header strong { color: #f2f3f5; }
  .discord-preview header a { color: #00a8fc; margin-left: auto; }
  .preview-message { display: flex; gap: 12px; }
  .bot-avatar { flex: 0 0 32px; height: 32px; display: grid; place-items: center; background: #248046; color: white; border-radius: 50%; font-weight: 700; }
  .preview-content { min-width: 0; flex: 1; --text-body: #dbdee1; --text-heading: #f2f3f5; --text-muted: #b5bac1; --ev-accent: #f2f3f5; --font-display: var(--font-body); --text-base: 14px; }
  .bot-name { font-weight: 600; margin-bottom: 8px; }
  .bot-name small { background: #5865f2; color: white; font-size: 10px; padding: 2px 4px; border-radius: 3px; margin-left: 4px; }
  .discord-embed { border-left: 4px solid; background: #2b2d31; padding: 12px; border-radius: 4px; margin-top: 10px; overflow: hidden; overflow-wrap: anywhere; }
  .embed-title { display: block; margin-bottom: 8px; font-size: 16px; color: white; }
  .embed-thumb { width: 64px; height: 64px; object-fit: contain; float: right; margin: 0 0 8px 8px; }
  .embed-image { display: block; max-width: 100%; border-radius: 4px; margin-top: 8px; }
  .embed-author { display: flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .embed-author img { width: 24px; height: 24px; border-radius: 50%; }
  .embed-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
  .embed-fields > div { grid-column: 1 / -1; }
  .embed-fields .embed-inline { grid-column: auto; }
  .embed-footer { display: block; margin-top: 8px; font-size: 11px; }
  .preview-rows { margin-top: 8px; display: grid; gap: 4px; }
  .preview-rows > div { display: flex; gap: 4px; flex-wrap: wrap; }
  .discord-button { padding: 7px 10px; min-height: 32px; border-radius: 4px; font-size: 13px; line-height: 18px; color: white; display: inline-flex; align-items: center; gap: 5px; overflow-wrap: anywhere; }
  .discord-button img { width: 18px; height: 18px; }
  .style-1 { background: #5865f2; }.style-2,.style-5 { background: #4e5058; }.style-3 { background: #248046; }.style-4 { background: #da373c; }
  .choose-message { grid-column: 2 / -1; padding: 40px 0; }
  .choose-message p { color: var(--text-body); }
  .problem, .delivery-warning { color: var(--status-error); }
  .delivery-warning { border-left: 3px solid var(--status-error); padding: 12px; background: var(--color-surface); }
  .delivery-warning p { font-size: var(--text-sm); }
  button:focus-visible, summary:focus-visible, input:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 2px; }
  button:disabled { opacity: .5; cursor: default; }
  @media (max-width: 1400px) { .workspace-grid { grid-template-columns: 160px minmax(300px, 1fr); }.discord-preview { grid-column: 2; position: static; }.message-list { grid-row: span 2; } }
  @media (max-width: 700px) {
    .workspace-head { align-items: start; }.workspace-head p { font-size: var(--text-sm); }
    .workspace-grid { display: flex; flex-direction: column; gap: 20px; }.message-list { width: 100%; position: static; }.message-list nav { display: flex; overflow-x: auto; }.message-list nav button { min-width: 180px; }
    .editor-main, .discord-preview { width: 100%; }.editor-tabs { flex-wrap: nowrap; overflow-x: auto; }.editor-tabs button { white-space: nowrap; }.editor-tabs .preview-tab { display: block; position: sticky; right: 0; background: var(--bg-page); }.discord-preview { display: none; }.discord-preview.mobile-visible { display: block; }.editor-body.mobile-hidden { display: none; }
    .two-fields { grid-template-columns: 1fr; }.editor-heading { flex-wrap: wrap; }.role-list li { flex-wrap: wrap; }.role-list small { flex-basis: 100%; order: 3; }.choose-message { padding: 12px 0; }
    .section-heading button, .button-tools > button, .embed-field-editor > button { min-height: 44px; }
    .editor-actions { padding-bottom: max(14px, env(safe-area-inset-bottom)); }.editor-actions :global(.seq-button) { min-height: 44px; }
  }
</style>
