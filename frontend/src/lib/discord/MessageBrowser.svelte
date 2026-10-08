<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import Select from "$lib/design-system/components/forms/Select.svelte";
  import {
    MAIN_GUILD, UNAVAILABLE, UNPLACED, attention, browse, endSearch, groupKey, guildOf, isOpen, isThread, reveal as revealGroup, threadLabel, toggle,
    type BrowserGroup, type Disclosure,
  } from "./navigation";
  import type { DiscordContext, ManagedMessage } from "./types";

  let { messages, context, guildId, selectedId, fresh, dirty, busy, hidden = false, onselect, onresume, onguild, status, children }: {
    messages: ManagedMessage[];
    context: DiscordContext;
    guildId: string;
    /** The open saved message. */
    selectedId: string | null;
    /** The name of an open message that has never been saved. */
    fresh: string | null;
    dirty: boolean;
    busy: boolean;
    hidden?: boolean;
    onselect: (message: ManagedMessage) => void;
    /** Return to the message that is already open. */
    onresume: () => void;
    onguild: (id: string) => Promise<void>;
    /** Outcomes shown while the list stands alone, such as a deletion. */
    status?: Snippet;
    /** Import, below the list. */
    children?: Snippet;
  } = $props();

  const uid = $props.id();
  let query = $state("");
  let disclosure = $state<Disclosure>({ remembered: {}, searching: {} });
  let list = $state<HTMLElement>();
  // Follows the open server; a refused or failed switch resets it below.
  let server = $derived(guildId);
  const searching = $derived(query.trim() !== "");
  const browser = $derived(browse(messages, context, guildId, query));
  const view = $derived({ searching, single: browser.single });
  const shown = $derived(browser.groups.reduce((count, group) => count + group.items.length, 0));
  const guilds = $derived(context.guilds ?? [{ id: MAIN_GUILD, name: "Sequoia" }]);
  const counts = $derived(messages.reduce((totals, message) => totals.set(guildOf(message), (totals.get(guildOf(message)) ?? 0) + 1), new Map<string, number>()));

  /** Keep an opened or saved message's group open, including after the current search. */
  export function reveal(message: ManagedMessage) {
    disclosure = revealGroup(disclosure, groupKey(message, messages, context.channels));
  }
  /** After returning from the open message, land on its row, or on its closed group. */
  export async function focusCurrent() {
    await tick();
    const current = list?.querySelector<HTMLElement>('[aria-current="true"]');
    const target = current && !current.closest("[hidden]") ? current : list?.querySelector<HTMLElement>(".holds-current [data-browser-item]") ?? items()[0];
    target?.focus();
  }

  function setQuery(value: string) {
    query = value;
    if (!value.trim()) disclosure = endSearch(disclosure);
  }
  async function changeServer(id: string) {
    await onguild(id);
    server = guildId;
  }
  function choose(message: ManagedMessage) {
    if (busy) return;
    if (message.id === selectedId) onresume();
    else onselect(message);
  }
  function items() {
    return [...(list?.querySelectorAll<HTMLElement>("[data-browser-item]") ?? [])].filter((item) => !item.closest("[hidden]") && !(item as HTMLButtonElement).disabled);
  }
  function searchKeys(event: KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); items()[0]?.focus(); }
    else if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); }
    else if (event.key === "Enter" && searching) {
      const first = browser.groups.find((group) => isOpen(disclosure, group, view))?.items[0];
      if (first) { event.preventDefault(); choose(first.message); }
    }
  }
  /** Arrows move through visible rows and headers; Left and Right close and open a group. */
  function listKeys(event: KeyboardEvent, group?: BrowserGroup) {
    const all = items();
    const at = all.indexOf(event.currentTarget as HTMLElement);
    const to = event.key === "ArrowDown" ? at + 1 : event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : null;
    if (to !== null) {
      event.preventDefault();
      all[Math.max(0, Math.min(all.length - 1, to))]?.focus();
    } else if (group && (event.key === "ArrowRight" || event.key === "ArrowLeft") && isOpen(disclosure, group, view) !== (event.key === "ArrowRight")) {
      event.preventDefault();
      disclosure = toggle(disclosure, group, view);
    } else if (!group && event.key === "ArrowLeft") {
      event.preventDefault();
      (event.currentTarget as HTMLElement).closest(".group")?.querySelector<HTMLElement>(".group-toggle")?.focus();
    }
  }
</script>

<aside class="browser" aria-label="Managed messages" {hidden}>
  <div class="browser-controls">
    <Field label="Server">
      <Select aria-label="Server" bind:value={server} disabled={busy || dirty} onchange={() => changeServer(server)}>
        {#each guilds as guild (guild.id)}<option value={guild.id}>{guild.name} ({counts.get(guild.id) ?? 0})</option>{/each}
      </Select>
    </Field>
    <Field label="Find a message">
      <input class="seq-input" type="search" value={query} placeholder="Name, channel or status" autocomplete="off" spellcheck="false" oninput={(event) => setQuery(event.currentTarget.value)} onkeydown={searchKeys} />
    </Field>
  </div>
  {@render status?.()}
  <p class="visually-hidden" aria-live="polite">{searching ? `${shown} ${shown === 1 ? "match" : "matches"} on this server` : ""}</p>

  <nav class="browser-list" aria-label="Messages" bind:this={list}>
    {#if fresh !== null}
      <button type="button" class="row row-fresh" aria-current="true" data-browser-item onclick={onresume} onkeydown={(event) => listKeys(event)}>
        <span class="row-name">{fresh || "Untitled message"}</span>
        <span class="row-meta"><span class="tone-unsaved">Not saved yet</span></span>
      </button>
    {/if}
    {#each browser.groups as group (group.key)}
      {@const open = isOpen(disclosure, group, view)}
      {@const flag = group.kind === "unplaced" ? null : attention(group.items)}
      {@const holds = !open && group.items.some((item) => item.message.id === selectedId)}
      <section class="group" class:holds-current={holds}>
        <h3>
          <button type="button" class="group-toggle" aria-expanded={open} aria-controls={`${uid}-${group.key}`} data-browser-item onclick={() => (disclosure = toggle(disclosure, group, view))} onkeydown={(event) => listKeys(event, group)}>
            <span class="chevron" aria-hidden="true"></span>
            <span class="group-name">{#if group.kind === "unplaced"}{UNPLACED}{:else if !group.channel}{UNAVAILABLE}{:else if isThread(group.channel)}{group.channel.name} <small>{threadLabel(group.channel).toLowerCase()}</small>{:else}<span class="hash" aria-hidden="true">#</span>{group.channel.name}{/if}</span>
            <span class="count">{group.items.length}<span class="visually-hidden">{` ${group.items.length === 1 ? "message" : "messages"}${holds ? ", including the open one" : ""}`}</span></span>
            {#if flag}<span class={`flag tone-${flag.tone}`}>{flag.text}</span>{/if}
          </button>
        </h3>
        <ul id={`${uid}-${group.key}`} hidden={!open}>
          {#each group.items as item (item.message.id)}
            {@const current = item.message.id === selectedId}
            <li>
              <button type="button" class="row" aria-current={current ? "true" : undefined} data-browser-item data-message-id={item.message.id} disabled={busy} onclick={() => choose(item.message)} onkeydown={(event) => listKeys(event)}>
                <span class="row-name">{item.message.definition.name || "Untitled message"}</span>
                <span class="row-meta">
                  <span class={`tone-${item.state.tone}`}>{item.state.text}</span>
                  {#if current && dirty}<span class="tone-unsaved">Unsaved changes</span>{/if}
                  {#if item.thread}<span>{threadLabel(item.thread)}{item.thread.name === item.message.definition.name ? "" : `: ${item.thread.name}`}</span>{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    {#if searching && shown === 0}
      <p class="empty">No messages on this server match “{query.trim()}”.</p>
    {:else if browser.total === 0 && fresh === null}
      <p class="empty">No managed messages on this server yet.</p>
    {/if}
    {#if browser.elsewhere.length > 0}
      <div class="elsewhere">
        {#each browser.elsewhere as other (other.guild.id)}
          <button type="button" disabled={busy || dirty} onclick={() => changeServer(other.guild.id)}>Show {other.count} {other.count === 1 ? "match" : "matches"} in {other.guild.name}</button>
        {/each}
        {#if dirty}<p class="empty">Save or discard your changes to switch servers.</p>{/if}
      </div>
    {/if}
  </nav>

  {@render children?.()}
</aside>

<style>
  .browser { container: message-browser / inline-size; display: flex; flex-direction: column; gap: 14px; min-width: 0; max-width: 44rem; }
  .browser[hidden] { display: none; }
  .browser-controls { display: grid; gap: 12px; }
  .browser-list { display: grid; align-content: start; gap: 2px; min-height: 0; }
  /* As a full-width picker, the two controls share a row. */
  @container message-browser (min-width: 520px) { .browser-controls { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); } }
  /* Beside the editor, the browser stays in view and scrolls on its own (see DiscordEditor). */
  @container discord-workspace (min-width: 1040px) {
    .browser { position: sticky; top: 4.5rem; max-height: calc(100vh - 5.5rem); }
    .browser-list { flex: 0 1 auto; overflow-y: auto; overscroll-behavior: contain; }
  }

  h3 { margin: 0; font: inherit; }
  ul { display: grid; gap: 2px; margin: 0 0 6px; padding: 0; list-style: none; }
  ul[hidden] { display: none; }

  .group-toggle, .row { width: 100%; border: 0; background: transparent; color: var(--text-body); text-align: left; cursor: pointer; }
  .group-toggle { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; gap: 0 8px; min-height: 40px; padding: 6px 8px 6px 6px; border-radius: 3px; }
  .chevron { justify-self: center; width: 6px; height: 6px; border-right: 1.5px solid var(--text-muted); border-bottom: 1.5px solid var(--text-muted); transform: rotate(-45deg); transition: transform var(--dur-fast) ease; }
  .group-toggle[aria-expanded="true"] .chevron { transform: rotate(45deg) translate(-1px, -1px); }
  .group-name { min-width: 0; overflow: hidden; color: var(--text-heading); font-size: var(--text-sm); text-overflow: ellipsis; white-space: nowrap; }
  .group-name small, .hash { color: var(--text-muted); font-size: var(--text-xs); }
  .hash { margin-right: 2px; font-size: inherit; }
  .count { color: var(--text-muted); font-family: var(--font-data); font-size: var(--text-2xs); font-variant-numeric: tabular-nums; }
  .flag { grid-column: 2 / -1; margin-top: 1px; font-size: var(--text-xs); line-height: 1.3; }
  .holds-current .chevron { border-color: var(--color-gold); }
  .holds-current .group-name { color: var(--color-gold); }

  .row { display: grid; gap: 3px; min-height: 44px; padding: 7px 10px 7px 24px; border-left: 2px solid transparent; }
  .row[aria-current="true"] { border-left-color: var(--color-gold); background: color-mix(in srgb, var(--color-gold) 7%, transparent); }
  .row-fresh { margin-bottom: 6px; padding-left: 10px; }
  .row-name { color: var(--text-heading); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .row-meta { display: flex; flex-wrap: wrap; gap: 0 6px; color: var(--text-muted); font-size: var(--text-xs); }
  .row-meta > span + span::before { content: "·"; content: "·" / ""; margin-right: 6px; color: var(--text-muted); }
  .tone-live { color: var(--color-gold); } .tone-changed { color: var(--accent-secondary); } .tone-error { color: var(--status-error); } .tone-draft { color: var(--text-muted); }
  .tone-unsaved { color: var(--color-gold); }

  .empty { margin: 4px 0; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.5; }
  .elsewhere { display: grid; justify-items: start; gap: 6px; margin-top: 6px; }
  .elsewhere button { min-height: 36px; padding: 0; border: 0; background: none; color: var(--color-gold); font-size: var(--text-xs); text-align: left; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  button:focus-visible { outline: 2px solid var(--color-gold); outline-offset: -2px; }
  button:disabled { opacity: 0.5; cursor: default; }

  /* Touch screens would keep a tapped row tinted after returning to the list. */
  @media (hover: hover) { .group-toggle:hover, .row:hover:not(:disabled):not([aria-current="true"]) { background: color-mix(in srgb, var(--color-gold) 4%, transparent); } }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
  @media (pointer: coarse) { .group-toggle { min-height: 44px; } .elsewhere button { min-height: 44px; } }
</style>
