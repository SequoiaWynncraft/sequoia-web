<script lang="ts">
  import { requestDiscord } from "$lib/api/discordManagement";
  import { beforeNavigate } from "$app/navigation";
  import ConfirmDialog from "$lib/design-system/components/forms/ConfirmDialog.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormStatus from "$lib/design-system/components/forms/FormStatus.svelte";
  import TextInput from "$lib/design-system/components/forms/TextInput.svelte";
  import Select from "$lib/design-system/components/forms/Select.svelte";
  import ManageHeader from "$lib/manage/ManageHeader.svelte";
  import DiscordPreview from "./DiscordPreview.svelte";
  import EmbedEditor from "./EmbedEditor.svelte";
  import MarkdownField from "./MarkdownField.svelte";
  import { LIMITS, charCount, definitionIssues, issuesUnder } from "./format";
  import type { Definition, DiscordContext, ManagedMessage, RoleButton } from "./types";

  let { initial, context: initialContext, problem }: { initial: ManagedMessage[]; context: DiscordContext; problem: string | null } = $props();
  // svelte-ignore state_referenced_locally
  let context = $state(structuredClone($state.snapshot(initialContext)));
  // Initial server data seeds an editable workspace, not a second persistence owner.
  // svelte-ignore state_referenced_locally
  let messages = $state<ManagedMessage[]>(initial);
  let selected = $state<ManagedMessage | null>(null);
  let draft = $state<Definition | null>(null);
  let baseline = $state("");
  /** Bumped when another message opens, so per-embed UI state starts fresh. */
  let session = $state(0);
  type Tab = "message" | "buttons" | "emoji" | "roles";
  const TABS: { id: Tab; label: string }[] = [
    { id: "message", label: "Message" },
    { id: "buttons", label: "Buttons" },
    { id: "emoji", label: "Emoji" },
    { id: "roles", label: "Self-service roles" },
  ];
  let tab = $state<Tab>("message");
  let view = $state<"edit" | "preview">("edit");
  let width = $state(0);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let emojiName = $state("");
  let emojiFile = $state<File | null>(null);
  let emojiImage = $state("");
  let emojiSearch = $state("");
  let importLink = $state("");
  let search = $state("");
  let discardDialog = $state<ConfirmDialog | null>(null);
  let deleteDialog = $state<ConfirmDialog | null>(null);
  let pendingSelection = $state<ManagedMessage | "close" | null>(null);
  let roleSearch = $state("");
  let uploadInput = $state<HTMLInputElement>();
  let pickerButtonId = $state<string | null>(null);
  const pickerButton = $derived(draft?.rows.flat().find((button) => button.id === pickerButtonId) ?? null);

  /** Side-by-side preview needs room for both; below that, staff switch views. */
  const narrow = $derived(width > 0 && width < 780);
  const dirty = $derived(draft !== null && JSON.stringify(draft) !== baseline);
  const unresolved = $derived(selected?.delivery_state === "uncertain" || selected?.delivery_state === "publishing");
  const filtered = $derived(messages.filter((m) => m.definition.name.toLowerCase().includes(search.toLowerCase())));
  const eligibleRoles = $derived(context.roles.filter((r) => r.eligible && r.approved));
  const selfServiceRoleIds = $derived(new Set(eligibleRoles.map((role) => role.id)));
  const emojiNameIssue = $derived(emojiFile && !/^[a-zA-Z0-9_]{2,32}$/.test(emojiName) ? "Use 2–32 letters, numbers or underscores." : undefined);
  const roleChoices = $derived(context.roles.filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase())));
  const emojiChoices = $derived(context.emojis.filter((e) => e.available && e.name.toLowerCase().includes(emojiSearch.toLowerCase())));
  const issues = $derived(draft ? definitionIssues(draft, selfServiceRoleIds) : {});
  const issueCount = $derived(Object.keys(issues).length);
  const channelName = $derived(context.channels.find((c) => c.id === draft?.channel_id)?.name);
  const stateLabel = $derived.by(() => {
    if (!selected) return "New message · not saved";
    if (selected.delivery_state === "uncertain") return "Needs recovery";
    if (selected.delivery_state === "publishing") return "Publishing…";
    if (dirty) return "Unsaved changes";
    if (selected.published_version === selected.version) return "Live on Discord";
    return selected.published_version ? "Saved · Discord shows an older version" : "Saved draft · not on Discord yet";
  });
  const publishHint = $derived.by(() => {
    if (unresolved) return "Recover the publication before changing Discord again.";
    if (dirty) return "Saving keeps Discord unchanged. Publish sends the saved version.";
    if (issueCount > 0) return `Fix ${issueCount === 1 ? "1 problem" : `${issueCount} problems`} before publishing.`;
    if (selected && selected.published_version === selected.version) return "Discord matches this saved version.";
    return "Check the preview, then publish the saved draft.";
  });

  beforeNavigate(({ cancel }) => { if (dirty) { cancel(); error = "Save your draft before leaving, or select Discard changes."; } });

  function tabHasIssues(id: Tab) {
    if (id === "message") return Object.keys(issues).some((key) => !key.startsWith("rows"));
    if (id === "buttons") return issuesUnder(issues, "rows").length > 0;
    return false;
  }
  function tabKeys(event: KeyboardEvent) {
    const at = TABS.findIndex((item) => item.id === tab);
    const to = event.key === "ArrowRight" ? at + 1 : event.key === "ArrowLeft" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    tab = TABS[(to + TABS.length) % TABS.length].id;
    document.getElementById(`discord-tab-${tab}`)?.focus();
  }
  function status(message: ManagedMessage) {
    if (message.delivery_state === "uncertain") return { text: "Needs recovery", tone: "error" };
    if (message.published_version === message.version) return { text: "Live", tone: "live" };
    if (message.published_version) return { text: "Unpublished changes", tone: "changed" };
    return { text: "Draft", tone: "draft" };
  }

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
    error = null; notice = null; tab = "message"; view = "edit"; pickerButtonId = null; session += 1;
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
      if (refreshed) received(refreshed);
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
    session += 1;
    importLink = ""; notice = "Message imported. Discord has not changed.";
  }
  async function recover() {
    if (!selected) return;
    const recovered = await request<ManagedMessage>(`messages/${selected.id}/recover`, "POST", parseLink(importLink));
    if (recovered) { received(recovered); importLink = ""; notice = "Recovered and verified the existing message."; }
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
  function roleName(id: string) {
    return context.roles.find((role) => role.id === id)?.name ?? "Unknown role";
  }
  function emojiUrl(id: string, animated = false) { return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=48`; }
  async function chooseUpload(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    emojiFile = null; emojiImage = ""; emojiName = "";
    if (!file) return;
    if (file.size > 256 * 1024 || !["image/png", "image/jpeg", "image/gif"].includes(file.type)) { error = "Use a PNG, JPEG or GIF no larger than 256 KiB."; return; }
    emojiFile = file;
    emojiName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
    const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    // A replacement selection can arrive before the previous FileReader settles.
    if (emojiFile === file) emojiImage = image;
  }
  async function upload() {
    const emoji = await request<DiscordContext["emojis"][number]>("emojis", "POST", { name: emojiName, image: emojiImage });
    if (!emoji) return;
    context.emojis = [...context.emojis.filter((existing) => existing.id !== emoji.id), emoji];
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
  function duplicate() {
    if (!selected) return;
    const copy = structuredClone($state.snapshot(selected.definition));
    copy.name = `${copy.name} copy`.slice(0, LIMITS.name);
    for (const row of copy.rows) for (const button of row) button.id = crypto.randomUUID();
    selected = null; draft = copy; baseline = ""; session += 1;
  }
  function discard() {
    if (pendingSelection !== "close") { open(pendingSelection); return; }
    selected = null; draft = null; baseline = "";
    error = null; notice = null; pickerButtonId = null;
  }
</script>

{#snippet preview()}
  {#if draft}
    <div class="preview-head">
      <h2><span class="diamond" aria-hidden="true">◆</span>Preview</h2>
      <span class="preview-channel">#{channelName ?? "choose a channel"}</span>
      <span class="preview-state" class:preview-unsaved={dirty}>{dirty ? "Includes unsaved changes" : "Saved version"}</span>
      {#if selected?.message_id}<a class="preview-open" href={`https://discord.com/channels/1030187086722109570/${selected.channel_id}/${selected.message_id}`} target="_blank" rel="noopener noreferrer">Open in Discord</a>{/if}
    </div>
    <DiscordPreview {draft} {context} />
    <p class="preview-note">Approximates Discord's dark theme. Discord's own apps decide the final look.</p>
  {/if}
{/snippet}

<div class="discord-workspace" bind:clientWidth={width} aria-busy={busy}>
  <ManageHeader area="Discord" title="Discord messages" lead="Owned messages, embeds and self-service role panels. Saving never changes Discord until you publish.">
    {#snippet actions()}<Button onclick={() => select(null)} disabled={busy}>New message</Button>{/snippet}
  </ManageHeader>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}

  <div class="workspace-grid" class:has-draft={!!draft}>
    <aside class="message-list" aria-label="Managed messages">
      <Field label="Find a message"><TextInput bind:value={search} placeholder="Search messages" /></Field>
      <nav aria-label="Messages">{#each filtered as message (message.id)}
        {@const state = status(message)}
        <button type="button" class:active={selected?.id === message.id} aria-current={selected?.id === message.id ? "true" : undefined} onclick={() => select(message)} disabled={busy}>
          <strong>{message.definition.name}</strong>
          <span>#{context.channels.find((c) => c.id === message.definition.channel_id)?.name ?? "Unknown channel"}</span>
          <small class={`tone-${state.tone}`}>{state.text}</small>
        </button>
      {:else}<p class="empty">{search ? "No matching messages." : "No managed messages yet."}</p>{/each}</nav>
      <details class="import"><summary>Edit an existing message</summary>
        <p class="hint">Import a Sierra message by its Discord link. Application and trial messages stay in their workflows.</p>
        <Field label="Discord message link"><TextInput bind:value={importLink} placeholder="https://discord.com/channels/…" inputmode="url" /></Field>
        <Button variant="secondary" size="sm" disabled={busy || !importLink} onclick={() => perform(importMessage)}>Import message</Button>
      </details>
    </aside>

    {#if draft}
      <section class="editor-main" aria-label="Message editor">
        <div class="editor-heading">
          <h2>{draft.name || "Untitled message"}</h2>
          <span class="state" class:state-dirty={dirty || !selected} class:state-live={!dirty && selected?.published_version === selected?.version} class:state-error={unresolved}>{stateLabel}</span>
        </div>
        {#if selected || dirty}
          <div class="message-actions">
            {#if selected}<Button variant="ghost" size="sm" disabled={busy || dirty || unresolved} onclick={duplicate}>Duplicate</Button><Button variant="ghost" size="sm" disabled={busy || unresolved} onclick={() => deleteDialog?.open()}>Delete</Button>{/if}
            {#if dirty}<Button variant="ghost" size="sm" disabled={busy} onclick={() => { pendingSelection = selected ?? "close"; discardDialog?.open(); }}>Discard changes</Button>{/if}
          </div>
        {/if}
        {#if narrow}
          <div class="view-switch" role="group" aria-label="Editor view">
            <button type="button" aria-pressed={view === "edit"} onclick={() => (view = "edit")}>Edit</button>
            <button type="button" aria-pressed={view === "preview"} onclick={() => (view = "preview")}>Preview</button>
          </div>
        {/if}

        {#if narrow && view === "preview"}
          <div class="inline-preview">{@render preview()}</div>
        {:else}
          <div class="editor-tabs" role="tablist" aria-label="Message editor sections">
            {#each TABS as item (item.id)}
              <button type="button" role="tab" id={`discord-tab-${item.id}`} aria-selected={tab === item.id} aria-controls="discord-editor-panel" tabindex={tab === item.id ? 0 : -1} onclick={() => (tab = item.id)} onkeydown={tabKeys}>{item.label}{#if tabHasIssues(item.id)}<span class="tab-flag" aria-hidden="true"></span><span class="visually-hidden"> (needs attention)</span>{/if}</button>
            {/each}
          </div>
          <div id="discord-editor-panel" role="tabpanel" aria-labelledby={`discord-tab-${tab}`}>
            {#if unresolved}
              <div class="delivery-warning" role="status"><strong>{selected?.delivery_state === "publishing" ? "Publication in progress" : "Publication needs recovery"}</strong><p>{selected?.delivery_error ?? "Publishing is still running. Reload to check its result."}</p>
                {#if selected?.delivery_state === "uncertain"}<Field label="Link to the published Discord message"><TextInput bind:value={importLink} inputmode="url" /></Field><Button variant="secondary" disabled={busy || !importLink} onclick={() => perform(recover)}>Recover message</Button>{/if}
              </div>
            {/if}
            <fieldset class="editor-body" disabled={busy || unresolved}>
            {#if tab === "message"}
              <div class="two-fields">
                <Field label="Name" hint="Only staff see this." error={issues.name}><TextInput bind:value={draft.name} invalid={!!issues.name} /></Field>
                <Field label="Channel" hint={selected?.message_id ? "Published messages stay in their channel; duplicate to move." : undefined} error={issues.channel_id}><Select aria-label="Channel" bind:value={draft.channel_id} disabled={busy || !!selected?.message_id}>{#each context.channels as channel (channel.id)}<option value={channel.id}>#{channel.name}</option>{/each}</Select></Field>
              </div>
              <MarkdownField label="Message text" bind:value={draft.content} limit={LIMITS.content} rows={5} issue={issues.content} {context} />
              {#if issues.embeds}<p class="inline-issue" role="alert">{issues.embeds}</p>{/if}
              {#key session}
                {#each draft.embeds as _, index (index)}
                  <EmbedEditor bind:embed={draft.embeds[index]} {index} count={draft.embeds.length} {issues} {context}
                    onmove={(by) => draft && move(draft.embeds, index, by)}
                    onduplicate={() => draft && draft.embeds.length < LIMITS.embeds && draft.embeds.splice(index + 1, 0, structuredClone($state.snapshot(draft.embeds[index])))}
                    onremove={() => draft?.embeds.splice(index, 1)} />
                {/each}
              {/key}
              <div class="add-row"><Button variant="secondary" disabled={draft.embeds.length >= LIMITS.embeds} onclick={addEmbed}>Add embed</Button><span>{draft.embeds.length} / {LIMITS.embeds} embeds</span></div>
            {:else if tab === "buttons"}
              <p class="hint">Role buttons toggle an approved self-service role for whoever clicks. Link buttons open a page.</p>
              {#each draft.rows as row, ri (ri)}
                <section class="button-row-editor" aria-labelledby={`row-${ri}`}>
                  <div class="section-heading"><h3 id={`row-${ri}`}>Button row {ri + 1}</h3><span class="count">{row.length} / {LIMITS.buttonsPerRow}</span><div class="tools"><button type="button" aria-label={`Move row ${ri + 1} up`} disabled={ri === 0} onclick={() => draft && move(draft.rows, ri, -1)}>↑</button><button type="button" aria-label={`Move row ${ri + 1} down`} disabled={ri === draft.rows.length - 1} onclick={() => draft && move(draft.rows, ri, 1)}>↓</button><button type="button" onclick={() => draft?.rows.splice(ri, 1)}>Remove row</button></div></div>
                  {#if issues[`rows.${ri}`]}<p class="inline-issue" role="alert">{issues[`rows.${ri}`]}</p>{/if}
                  {#each row as button, bi (button.id)}
                    {@const key = `rows.${ri}.${bi}`}
                    <div class="button-editor">
                      <div class="two-fields">
                        <Field label="Button label" hint={`${charCount(button.label)} / ${LIMITS.label}`} error={issues[`${key}.label`]}><TextInput bind:value={button.label} invalid={!!issues[`${key}.label`]} /></Field>
                        <Field label="Action"><Select aria-label="Action" value={button.action.kind} onchange={(e) => actionType(button, e.currentTarget.value as "role" | "link")}><option value="role">Toggle role</option><option value="link">Open link</option></Select></Field>
                      </div>
                      {#if button.action.kind === "role"}
                        <div class="two-fields">
                          <Field label="Role" error={issues[`${key}.role`]}><Select aria-label="Role" bind:value={button.action.role_id}><option value="">Choose a role</option>{#if button.action.role_id && !eligibleRoles.some((role) => button.action.kind === "role" && role.id === button.action.role_id)}<option value={button.action.role_id} disabled>{roleName(button.action.role_id)} (not self-service)</option>{/if}{#each eligibleRoles as role (role.id)}<option value={role.id}>{role.name}</option>{/each}</Select></Field>
                          <Field label="Colour"><Select aria-label="Colour" value={String(button.style)} onchange={(e) => button.style = Number(e.currentTarget.value)}><option value="1">Blue</option><option value="2">Grey</option><option value="3">Green</option><option value="4">Red</option></Select></Field>
                        </div>
                      {:else}<Field label="Destination" error={issues[`${key}.url`]}><TextInput bind:value={button.action.url} inputmode="url" invalid={!!issues[`${key}.url`]} /></Field>{/if}
                      <div class="button-tools">
                        <label class="unicode">Unicode emoji<input class="seq-input" value={button.emoji && !("id" in button.emoji) ? button.emoji.name : ""} oninput={(e) => button.emoji = e.currentTarget.value ? { name: e.currentTarget.value } : null} /></label>
                        <Button variant="ghost" size="sm" onclick={() => { pickerButtonId = button.id; tab = "emoji"; }}>{#if button.emoji && "id" in button.emoji}<img src={emojiUrl(button.emoji.id, button.emoji.animated)} alt="" width="20" height="20" />{/if}Server emoji</Button>
                        {#if button.emoji}<button type="button" onclick={() => (button.emoji = null)}>No emoji</button>{/if}
                        <span class="tools"><button type="button" aria-label={`Move ${button.label || "button"} left`} disabled={bi === 0} onclick={() => move(row, bi, -1)}>←</button><button type="button" aria-label={`Move ${button.label || "button"} right`} disabled={bi === row.length - 1} onclick={() => move(row, bi, 1)}>→</button><button type="button" onclick={() => row.splice(bi, 1)}>Remove</button></span>
                      </div>
                    </div>
                  {/each}
                  <Button variant="ghost" size="sm" disabled={row.length >= LIMITS.buttonsPerRow} onclick={() => addButton(ri)}>Add button</Button>
                </section>
              {/each}
              <div class="add-row"><Button variant="secondary" disabled={draft.rows.length >= LIMITS.rows} onclick={() => { if (draft) { draft.rows.push([]); addButton(draft.rows.length - 1); } }}>Add button row</Button><span>{draft.rows.length} / {LIMITS.rows} rows</span></div>
            {:else if tab === "emoji"}
              <div class="section-heading"><h3>{pickerButton ? `Emoji for ${pickerButton.label || "button"}` : "Server emoji"}</h3>{#if pickerButton}<div class="tools">{#if pickerButton.emoji}<button type="button" onclick={() => { if (pickerButton) pickerButton.emoji = null; }}>No emoji</button>{/if}<button type="button" onclick={() => (tab = "buttons")}>Back to buttons</button></div>{/if}</div>
              <p class="hint">{pickerButton ? "Choose the emoji shown on this button." : "Open this from a button to choose its emoji. Text fields insert emoji from their Insert menu."}</p>
              <Field label="Find an emoji"><TextInput bind:value={emojiSearch} placeholder="Search emoji" /></Field>
              <div class="emoji-grid">{#each emojiChoices as emoji (emoji.id)}<button type="button" title={`:${emoji.name}:`} aria-label={`Use ${emoji.name}`} disabled={!pickerButton} onclick={() => { if (pickerButton) pickerButton.emoji = { id: emoji.id, name: emoji.name, animated: emoji.animated }; tab = "buttons"; }}><img src={emojiUrl(emoji.id, emoji.animated)} alt={emoji.name} loading="lazy" /></button>{:else}<p class="empty">No matching emoji.</p>{/each}</div>
              <section class="upload"><h3>Upload an emoji</h3><p class="hint">Uploads reach the Sequoia server immediately, separately from any draft.</p><Field label="Image" hint="PNG, JPEG or GIF, up to 256 KiB"><input type="file" accept="image/png,image/jpeg,image/gif" bind:this={uploadInput} onchange={chooseUpload} /></Field>
                {#if emojiFile}<div class="upload-preview"><img src={emojiImage} alt="Emoji upload preview" /><Field label="Emoji name" error={emojiNameIssue}><TextInput bind:value={emojiName} maxlength={32} invalid={!!emojiNameIssue} /></Field></div>{/if}
                <Button disabled={busy || !emojiFile || !emojiImage || !!emojiNameIssue} onclick={() => perform(upload)}>Upload to Discord</Button>
              </section>
            {:else}
              <p class="hint">Enabled roles can be granted by anyone using a panel. Disabling self-service does not remove existing memberships. Staff, rank and branch roles stay protected.</p>
              <Field label="Find a role"><TextInput bind:value={roleSearch} /></Field>
              <ul class="role-list">{#each roleChoices as role (role.id)}<li><span>{role.name}</span><small>{!role.eligible ? "Protected or unavailable" : role.approved ? "Self-service enabled" : "Not enabled"}</small>{#if context.can_approve_roles && role.eligible}<Button variant="ghost" size="sm" disabled={busy} onclick={() => perform(() => approve(role))}>{role.approved ? "Disable" : "Enable"}</Button>{/if}</li>{/each}</ul>
            {/if}
          </fieldset></div>
        {/if}

        <footer class="editor-actions">
          <FormStatus error={error} warning={selected?.delivery_error} saved={!!notice} savedText={notice ?? ""} compact />
          <div class="action-buttons">
            <Button variant={dirty ? "primary" : "secondary"} disabled={busy || !dirty || unresolved} onclick={() => perform(saveDraft)}>Save draft</Button>
            <Button variant={dirty ? "secondary" : "primary"} disabled={busy || dirty || !selected || unresolved || issueCount > 0} onclick={() => perform(publishDraft)}>{busy ? "Working…" : selected?.message_id ? "Update Discord" : "Publish to Discord"}</Button>
            <p class="publish-hint">{publishHint}</p>
          </div>
        </footer>
      </section>

      {#if !narrow}
        <aside class="discord-preview" aria-label="Discord message preview">{@render preview()}</aside>
      {/if}
    {:else}
      <section class="choose-message"><h2>Choose a message</h2><p>Edit an existing panel or create a message with embeds and buttons.</p><Button onclick={() => select(null)}>New message</Button><FormStatus error={error} saved={!!notice} savedText={notice ?? ""} /></section>
    {/if}
  </div>
</div>

<ConfirmDialog bind:this={deleteDialog} title="Delete this message?" body="The published Discord message will be deleted. Roles and memberships are not affected." confirmLabel="Delete message" danger onconfirm={() => void perform(confirmedDelete)} />
<ConfirmDialog bind:this={discardDialog} title="Discard unsaved changes?" body="The published message and last saved draft will remain unchanged." confirmLabel="Discard changes" onconfirm={discard} />

<style>
  .discord-workspace { container: discord-workspace / inline-size; padding-bottom: 24px; }
  h2 { margin: 0; color: var(--text-heading); font-size: var(--text-lg); overflow-wrap: anywhere; }
  h3 { margin: 0; color: var(--text-heading); font-family: var(--font-display); font-size: var(--text-xs); font-weight: var(--weight-regular); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  p { line-height: 1.5; }
  .hint, .empty, .preview-note { margin: 0; color: var(--text-muted); font-size: var(--text-xs); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .problem, .inline-issue { margin: 0 0 16px; color: var(--status-error); font-size: var(--text-sm); }
  .inline-issue { margin: 0; font-size: var(--text-xs); }

  /* Narrow: one column with an Edit/Preview switch. */
  .workspace-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
  .message-list { display: grid; gap: 12px; min-width: 0; padding-bottom: 16px; border-bottom: 1px solid var(--border-default); }
  .message-list nav { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
  .message-list nav button { flex: 0 0 auto; display: grid; gap: 4px; width: 190px; min-height: 44px; padding: 10px 12px; text-align: left; background: transparent; border: 1px solid var(--border-default); border-left-width: 2px; color: var(--text-body); cursor: pointer; }
  .message-list nav button.active { border-left-color: var(--color-gold); background: var(--color-surface); }
  .message-list nav button:hover:not(:disabled) { background: var(--color-surface); }
  .message-list strong { color: var(--text-heading); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .message-list span, .message-list small { font-size: var(--text-xs); }
  .tone-live { color: var(--color-gold); } .tone-changed { color: var(--accent-secondary); } .tone-error { color: var(--status-error); } .tone-draft { color: var(--text-muted); }
  .import { border-top: 1px solid var(--border-default); padding-top: 10px; display: grid; gap: 10px; justify-items: start; }
  .import > :global(*) { justify-self: stretch; } .import > :global(.seq-button) { justify-self: start; }
  summary { min-height: 32px; display: flex; align-items: center; color: var(--text-heading); font-size: var(--text-sm); cursor: pointer; }

  .editor-main { container: discord-editor / inline-size; min-width: 0; }
  .editor-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 12px; }
  .state { font-size: var(--text-xs); color: var(--text-muted); }
  .state-dirty { color: var(--color-gold); } .state-live { color: var(--status-positive); } .state-error { color: var(--status-error); }
  .view-switch { position: sticky; top: 3.5rem; z-index: 3; display: grid; grid-template-columns: 1fr 1fr; margin: 12px 0 0; background: var(--bg-page); border: 1px solid var(--border-default); }
  .view-switch button { min-height: 44px; border: 0; background: transparent; color: var(--text-body); font-family: var(--font-display); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; cursor: pointer; }
  .view-switch button[aria-pressed="true"] { background: color-mix(in srgb, var(--color-gold) 12%, transparent); color: var(--color-gold); }
  .inline-preview { margin-top: 16px; }
  .editor-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--border-default); margin: 12px 0 20px; }
  .editor-tabs button { position: relative; flex: 0 0 auto; min-height: 44px; padding: 12px 8px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-body); font-size: var(--text-sm); white-space: nowrap; cursor: pointer; }
  .editor-tabs button[aria-selected="true"] { color: var(--color-gold); border-bottom-color: var(--color-gold); }
  .tab-flag { display: inline-block; width: 6px; height: 6px; margin-left: 6px; border-radius: 50%; background: var(--status-error); vertical-align: middle; }
  .editor-body { display: grid; gap: 18px; border: 0; padding: 0; margin: 0; min-width: 0; }
  .two-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .add-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .add-row span, .count { color: var(--text-muted); font-family: var(--font-data); font-size: var(--text-2xs); font-variant-numeric: tabular-nums; }
  .section-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .tools { display: inline-flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
  .tools button, .button-tools > button { min-height: 36px; padding: 0 10px; border: 1px solid var(--border-default); border-radius: 3px; background: transparent; color: var(--text-body); font-size: var(--text-xs); cursor: pointer; }
  .button-row-editor, .upload { display: grid; gap: 14px; justify-items: start; border-top: 1px solid var(--border-default); padding-top: 18px; }
  .button-row-editor > :global(*), .upload > :global(*) { justify-self: stretch; } .button-row-editor > :global(.seq-button), .upload > :global(.seq-button) { justify-self: start; }
  .button-editor { display: grid; gap: 12px; padding: 12px 0 12px 12px; border-left: 1px solid var(--border-default); }
  .button-tools { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
  .button-tools .tools { align-self: end; }
  .unicode { display: grid; gap: 4px; width: 120px; color: var(--text-muted); font-size: var(--text-xs); }
  .emoji-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 8px; max-height: 300px; overflow: auto; }
  .emoji-grid button { min-height: 44px; border: 1px solid var(--border-default); background: var(--color-surface); cursor: pointer; border-radius: 6px; }
  .emoji-grid img, .upload-preview img { width: 32px; height: 32px; object-fit: contain; }
  .upload-preview { display: flex; gap: 12px; align-items: center; }
  .role-list { list-style: none; margin: 0; padding: 0; }
  .role-list li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; border-bottom: 1px solid var(--border-default); padding: 10px 0; }
  .role-list li > span { flex: 1; color: var(--text-heading); font-size: var(--text-sm); }
  .role-list small { font-size: var(--text-xs); color: var(--text-muted); }
  .message-actions { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 6px; }
  .editor-actions { position: sticky; bottom: 0; z-index: 2; display: grid; gap: 8px; margin-top: 20px; padding: 12px 0 max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border-default); background: var(--bg-page); }
  .action-buttons { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  .publish-hint { flex: 1 1 14rem; margin: 0; color: var(--text-muted); font-size: var(--text-xs); }
  .delivery-warning { color: var(--status-error); border-left: 3px solid var(--status-error); padding: 12px; background: var(--color-surface); display: grid; gap: 10px; }
  .delivery-warning p { margin: 0; font-size: var(--text-sm); }

  .preview-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 12px; }
  .preview-head h2 { font-family: var(--font-display); font-size: var(--text-xs); font-weight: var(--weight-regular); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .diamond { margin-right: 8px; color: var(--color-gold); font-size: 0.8em; }
  .preview-channel, .preview-state { color: var(--text-muted); font-size: var(--text-xs); }
  .preview-unsaved { color: var(--color-gold); }
  .preview-open { margin-left: auto; color: var(--color-gold); font-size: var(--text-xs); }
  .preview-note { margin-top: 10px; }
  .discord-preview { min-width: 0; }
  .choose-message { padding: 24px 0; }
  .choose-message p { color: var(--text-body); }

  button:focus-visible, summary:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 2px; }
  /* Inset where a scrolling strip would clip an outer ring. */
  .editor-tabs button:focus-visible, .view-switch button:focus-visible, .message-list nav button:focus-visible { outline-offset: -2px; }
  button:disabled { opacity: 0.5; cursor: default; }

  /* Medium: messages across the top, editor and preview side by side. */
  @container discord-workspace (min-width: 780px) {
    .workspace-grid.has-draft { grid-template-columns: minmax(0, 1fr) minmax(300px, 0.8fr); }
    .message-list { grid-column: 1 / -1; grid-template-columns: minmax(180px, 240px) minmax(0, 1fr); align-items: start; }
    .message-list nav { grid-column: 2; grid-row: 1 / span 2; }
    .discord-preview { position: sticky; top: 4.5rem; max-height: calc(100vh - 5.5rem); overflow-y: auto; }
  }

  /* Wide: message list, editor and preview as three columns. */
  @container discord-workspace (min-width: 1220px) {
    .workspace-grid, .workspace-grid.has-draft { grid-template-columns: 200px minmax(0, 1.25fr) minmax(360px, 1fr); }
    .discord-preview { max-width: 580px; }
    .message-list { grid-column: auto; grid-template-columns: minmax(0, 1fr); position: sticky; top: 4.5rem; padding-bottom: 0; border-bottom: 0; }
    .message-list nav { grid-column: auto; grid-row: auto; flex-direction: column; max-height: 55vh; overflow-x: hidden; overflow-y: auto; }
    .message-list nav button { width: auto; }
    .choose-message { grid-column: 2 / -1; }
  }

  @container discord-editor (max-width: 520px) {
    .two-fields { grid-template-columns: minmax(0, 1fr); }
    .tools button, .button-tools > button { min-height: 44px; }
    .editor-actions :global(.seq-button) { min-height: 44px; }
  }
</style>
