<script lang="ts">
  import { tick } from "svelte";

  import TextArea from "#lib/design-system/components/forms/TextArea.svelte";
  import { charCount, embedCount } from "./format";
  import type { DiscordContext } from "./types";

  let {
    label,
    value = $bindable(""),
    limit,
    rows = 4,
    issue,
    context,
    compact = false,
    embedText = false,
  }: {
    label: string;
    value?: string;
    limit: number;
    rows?: number;
    issue?: string;
    /** Mentions and server emoji offered by the insert menu. */
    context: DiscordContext;
    /** Inline styling tools only, for short repeated fields. */
    compact?: boolean;
    /** Embed text: Discord trims surrounding whitespace before counting it. */
    embedText?: boolean;
  } = $props();

  const id = $props.id();
  let element = $state<HTMLTextAreaElement>();
  const count = $derived(embedText ? embedCount(value) : charCount(value));
  const mentionRoles = $derived(context.roles.filter((role) => role.name !== "@everyone"));
  const emojis = $derived(context.emojis.filter((emoji) => emoji.available));

  async function select(start: number, end: number) {
    await tick();
    element?.focus();
    element?.setSelectionRange(start, end);
  }

  function selection() {
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    return { start, end, text: value.slice(start, end) };
  }

  /** Wraps the selection (or a placeholder) and keeps it selected for typing. */
  function wrap(before: string, after: string, placeholder: string) {
    const { start, end, text } = selection();
    const inner = text || placeholder;
    value = value.slice(0, start) + before + inner + after + value.slice(end);
    void select(start + before.length, start + before.length + inner.length);
  }

  /** Prefixes every selected line, e.g. headings, quotes and lists. */
  function prefix(marker: (index: number) => string) {
    const { start, end } = selection();
    const from = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const to = lineEnd === -1 ? value.length : lineEnd;
    const lines = value.slice(from, to).split("\n").map((line, index) => marker(index) + line);
    const replaced = lines.join("\n");
    value = value.slice(0, from) + replaced + value.slice(to);
    void select(from + replaced.length, from + replaced.length);
  }

  function link() {
    const { start, end, text } = selection();
    const shown = text || "link text";
    const inserted = `[${shown}](https://)`;
    value = value.slice(0, start) + inserted + value.slice(end);
    const urlStart = start + shown.length + 3;
    void select(urlStart, urlStart + "https://".length);
  }

  function insert(token: string) {
    if (!token) return;
    if (token === "time:full" || token === "time:relative") {
      token = `<t:${Math.floor(Date.now() / 1000)}:${token === "time:full" ? "F" : "R"}>`;
    }
    const { start, end } = selection();
    const before = start > 0 && !/\s$/.test(value.slice(0, start)) ? " " : "";
    const inserted = `${before}${token}`;
    value = value.slice(0, start) + inserted + value.slice(end);
    void select(start + inserted.length, start + inserted.length);
  }

  const TOOLS: { label: string; glyph: string; apply: () => void }[] = [
    { label: "Bold", glyph: "B", apply: () => wrap("**", "**", "bold text") },
    { label: "Italic", glyph: "I", apply: () => wrap("*", "*", "italic text") },
    { label: "Underline", glyph: "U", apply: () => wrap("__", "__", "underlined text") },
    { label: "Strikethrough", glyph: "S", apply: () => wrap("~~", "~~", "struck text") },
    { label: "Spoiler", glyph: "||", apply: () => wrap("||", "||", "spoiler") },
    { label: "Inline code", glyph: "`", apply: () => wrap("`", "`", "code") },
    { label: "Link", glyph: "Link", apply: link },
    { label: "Heading", glyph: "H", apply: () => prefix(() => "## ") },
    { label: "Bulleted list", glyph: "•", apply: () => prefix(() => "- ") },
    { label: "Numbered list", glyph: "1.", apply: () => prefix((index) => `${index + 1}. `) },
    { label: "Quote", glyph: "❝", apply: () => prefix(() => "> ") },
    { label: "Code block", glyph: "{ }", apply: () => wrap("```\n", "\n```", "code") },
  ];
  const INLINE_TOOLS = new Set(["Bold", "Italic", "Underline", "Strikethrough", "Spoiler", "Inline code", "Link"]);
  // Always visible, never revealed on focus: a toolbar that appears or collapses
  // with focus moves the controls below it out from under the pointer.
  const tools = $derived(compact ? TOOLS.filter((tool) => INLINE_TOOLS.has(tool.label)) : TOOLS);
</script>

<div class="md-field">
  <div class="md-head">
    <label class="md-label" for={id}>{label}</label>
    <span class="md-count" class:md-over={count > limit} aria-live="polite">{count} / {limit}</span>
  </div>
  <div class="md-tools" role="group" aria-label={`${label} formatting`}>
    {#each tools as tool (tool.label)}
      <button type="button" class="md-tool" aria-label={tool.label} title={tool.label} onclick={tool.apply}>
        <span class={`md-glyph md-glyph-${tool.label.toLowerCase().replaceAll(" ", "-")}`} aria-hidden="true">{tool.glyph}</span>
      </button>
    {/each}
    <select class="md-insert" aria-label={`Insert into ${label.toLowerCase()}`} onchange={(event) => { insert(event.currentTarget.value); event.currentTarget.value = ""; }}>
      <option value="">Insert…</option>
      {#if emojis.length > 0}
        <optgroup label="Server emoji">
          {#each emojis as emoji (emoji.id)}
            <option value={`<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`}>:{emoji.name}:</option>
          {/each}
        </optgroup>
      {/if}
      <optgroup label="Role mention (no ping)">
        {#each mentionRoles as role (role.id)}
          <option value={`<@&${role.id}>`}>@{role.name}</option>
        {/each}
      </optgroup>
      <optgroup label="Channel">
        {#each context.channels as channel (channel.id)}
          <option value={`<#${channel.id}>`}>#{channel.name}</option>
        {/each}
      </optgroup>
      <optgroup label="Time">
        <option value="time:full">Current date and time</option>
        <option value="time:relative">Relative time</option>
      </optgroup>
    </select>
  </div>
  <TextArea {id} bind:value bind:element {rows} invalid={!!issue} aria-describedby={issue ? `${id}-issue` : undefined} />
  {#if issue}<span class="md-issue" id={`${id}-issue`} role="alert">{issue}</span>{/if}
</div>

<style>
  .md-field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .md-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .md-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .md-count {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
  }

  .md-over,
  .md-issue {
    color: var(--status-error);
  }

  .md-issue {
    font-size: var(--text-xs);
  }

  .md-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
  }

  .md-tool {
    min-width: 32px;
    height: 32px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    color: var(--text-body);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    cursor: pointer;
  }

  .md-tool:hover {
    border-color: var(--border-default);
    color: var(--text-heading);
  }

  .md-glyph-bold {
    font-weight: 700;
  }

  .md-glyph-italic {
    font-style: italic;
  }

  .md-glyph-underline {
    text-decoration: underline;
  }

  .md-glyph-strikethrough {
    text-decoration: line-through;
  }

  .md-glyph-inline-code,
  .md-glyph-code-block {
    font-family: var(--font-mono);
  }

  .md-insert {
    max-width: 9rem;
    height: 32px;
    margin-left: auto;
    padding: 0 6px;
    border: 1px solid var(--border-default);
    border-radius: 3px;
    background: var(--color-surface);
    color: var(--text-body);
    font-size: var(--text-xs);
  }

  .md-tool:focus-visible,
  .md-insert:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 1px;
  }

  /* Phones: one scrollable row instead of several wrapped rows above every field. */
  @container discord-editor (max-width: 520px) {
    .md-tools {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: thin;
    }

    .md-tool,
    .md-insert {
      flex: 0 0 auto;
      min-width: 40px;
      height: 40px;
    }

    .md-insert {
      margin-left: 0;
    }
  }
</style>
