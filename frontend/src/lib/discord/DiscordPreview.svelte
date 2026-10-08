<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import LayoutPreview from "./LayoutPreview.svelte";
  import DiscordMarkdown from "./DiscordMarkdown.svelte";
  import { calendarTime, embedGroups, fieldColumns, hexColor, isWebUrl, standaloneAttachments } from "./format";
  import type { Definition, DiscordContext, Embed, RoleButton } from "./types";

  let { draft, context }: { draft: Definition; context: DiscordContext } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  const names = $derived({
    roles: new Map(context.roles.map((role) => [role.id, role.name])),
    channels: new Map(context.channels.map((channel) => [channel.id, channel.name])),
  });
  /** Images that failed to load, so staff see a broken link instead of a gap. */
  const failed = new SvelteSet<string>();
  const standalone = $derived(standaloneAttachments(draft));
  const groups = $derived(embedGroups(draft.embeds));

  function image(raw: string | undefined): string | null {
    if (raw?.startsWith("attachment://")) {
      const attachment = draft.attachments?.find((a) => a.filename === raw.slice(13));
      return attachment ? `/manage/discord/api/assets/${attachment.id}` : null;
    }
    return raw && isWebUrl(raw) ? raw : null;
  }

  function emojiSrc(id: string, animated = false) {
    return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=48`;
  }

  function footerTime(embed: Embed): string {
    return embed.timestamp ? calendarTime(new Date(embed.timestamp), new Date(now)) : "";
  }

  const STYLE_NAMES: Record<number, string> = { 1: "primary", 2: "secondary", 3: "success", 4: "danger", 5: "link" };

  function buttonStyle(button: RoleButton) {
    return button.action.kind === "link" ? "link" : (STYLE_NAMES[button.style] ?? "secondary");
  }
</script>

{#snippet picture(url: string, className: string, alt: string)}
  {#if failed.has(url)}
    <span class={`${className} dp-broken`} role="img" aria-label={`${alt} could not load`}>Image could not load</span>
  {:else}
    <img class={className} src={url} {alt} loading="lazy" referrerpolicy="no-referrer" onerror={() => failed.add(url)} />
  {/if}
{/snippet}

<div class="dp">
  <div class="dp-message">
    <div class="dp-avatar" aria-hidden="true">S</div>
    <div class="dp-body">
      <p class="dp-header">
        <span class="dp-author-name">Sierra</span>
        <span class="dp-app">APP</span>
        <time class="dp-sent" datetime={new Date(now).toISOString()}>{calendarTime(new Date(now), new Date(now))}</time>
      </p>
      {#if draft.content.trim()}
        <div class="dp-content"><DiscordMarkdown source={draft.content} {names} {now} jumbo /></div>
      {/if}

      {#if draft.components_v2?.length}<LayoutPreview components={draft.components_v2} {names} {now} />{/if}

      {#each groups as group (group.index)}
        {@const embed = group.embed}
        {@const index = group.index}
        {@const thumbnail = image(embed.thumbnail?.url)}
        {@const columns = fieldColumns(embed.fields ?? [], thumbnail !== null)}
        <article
          class="dp-embed"
          aria-label={`Embed ${index + 1}`}
          style:border-left-color={embed.color === undefined ? "#1e1f22" : hexColor(embed.color)}
        >
          <div class="dp-embed-grid" class:dp-has-thumb={thumbnail !== null}>
            {#if embed.author?.name}
              <div class="dp-embed-author">
                {#if image(embed.author.icon_url)}
                  {@render picture(image(embed.author.icon_url) ?? "", "dp-author-icon", "Author icon")}
                {/if}
                {#if isWebUrl(embed.author.url)}
                  <a href={embed.author.url} target="_blank" rel="noopener noreferrer">{embed.author.name}</a>
                {:else}
                  <span>{embed.author.name}</span>
                {/if}
              </div>
            {/if}
            {#if embed.title}
              <div class="dp-embed-title">
                {#if isWebUrl(embed.url)}
                  <a href={embed.url} target="_blank" rel="noopener noreferrer"><DiscordMarkdown source={embed.title} surface="title" {names} {now} /></a>
                {:else}
                  <DiscordMarkdown source={embed.title} surface="title" {names} {now} />
                {/if}
              </div>
            {/if}
            {#if embed.description}
              <div class="dp-embed-description"><DiscordMarkdown source={embed.description} {names} {now} /></div>
            {/if}
            {#if (embed.fields?.length ?? 0) > 0}
              <div class="dp-fields">
                {#each embed.fields ?? [] as field, fieldIndex (fieldIndex)}
                  <div class="dp-field" style:grid-column={columns[fieldIndex]}>
                    <div class="dp-field-name"><DiscordMarkdown source={field.name} surface="title" {names} {now} /></div>
                    <div class="dp-field-value"><DiscordMarkdown source={field.value} {names} {now} /></div>
                  </div>
                {/each}
              </div>
            {/if}
            {#if image(embed.image?.url)}
              <div class="dp-embed-image" class:dp-gallery={group.indices.length > 1} class:dp-gallery-three={group.indices.length === 3} class:dp-gallery-four={group.indices.length === 4}>
                {#each group.indices as imageIndex (imageIndex)}
                  {@const url = image(draft.embeds[imageIndex].image?.url)}
                  {#if url}<a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open embed image ${imageIndex + 1}`}>{@render picture(url, "dp-image", `Embed image ${imageIndex + 1}`)}</a>{/if}
                {/each}
              </div>
            {/if}
            {#if thumbnail}
              <div class="dp-embed-thumb">{@render picture(thumbnail, "dp-thumb", "Embed thumbnail")}</div>
            {/if}
            {#if embed.footer?.text || embed.timestamp}
              <div class="dp-embed-footer">
                {#if embed.footer?.text && image(embed.footer.icon_url)}
                  {@render picture(image(embed.footer.icon_url) ?? "", "dp-footer-icon", "Footer icon")}
                {/if}
                <span>{embed.footer?.text ?? ""}{#if embed.footer?.text && embed.timestamp}<span class="dp-dot" aria-hidden="true">•</span>{/if}{footerTime(embed)}</span>
              </div>
            {/if}
          </div>
        </article>
      {/each}

      {#if standalone.length}
        <div class="dp-attachments">{#each standalone as attachment (attachment.id)}<figure><img src={`/manage/discord/api/assets/${attachment.id}`} alt={attachment.description ?? attachment.filename} loading="lazy" /><figcaption>{attachment.filename}</figcaption></figure>{/each}</div>
      {/if}
      {#if draft.rows.some((row) => row.length > 0)}
        <div class="dp-components">
          {#each draft.rows as row, rowIndex (rowIndex)}
            {#if row.length > 0}
              <div class="dp-row">
                {#each row as button (button.id)}
                  <span class={`dp-button dp-${buttonStyle(button)}`}>
                    {#if button.emoji}
                      {#if "id" in button.emoji}
                        <img class="dp-button-emoji" src={emojiSrc(button.emoji.id, button.emoji.animated)} alt={`:${button.emoji.name ?? "emoji"}:`} />
                      {:else}
                        <span class="dp-button-emoji dp-button-unicode">{button.emoji.name}</span>
                      {/if}
                    {/if}
                    {#if button.label}<span class="dp-button-label">{button.label}</span>{/if}
                    {#if button.action.kind === "link"}
                      <svg class="dp-external" viewBox="0 0 24 24" width="16" height="16" aria-label="Opens a link" role="img"><path fill="currentColor" d="M15 2a1 1 0 0 0 0 2h3.6l-7.3 7.3a1 1 0 1 0 1.4 1.4L20 5.4V9a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1h-6ZM5 4a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5a1 1 0 1 0-2 0v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5a1 1 0 1 0 0-2H5Z" /></svg>
                    {/if}
                  </span>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Discord's dark theme, approximated with the site's own text face. */
  .dp {
    padding: 16px 16px 16px 0;
    border-radius: 8px;
    background: #313338;
    color: #dbdee1;
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.375rem;
    text-align: left;
  }

  .dp-message {
    display: flex;
    gap: 16px;
    padding-left: 16px;
    min-width: 0;
  }

  .dp-avatar {
    flex: 0 0 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #248046;
    color: #fff;
    font-weight: 700;
  }

  .dp-body {
    flex: 1;
    min-width: 0;
  }

  .dp-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin: 0 0 2px;
    line-height: 1.375rem;
  }

  .dp-author-name {
    color: #f2f3f5;
    font-weight: 500;
  }

  .dp-app {
    padding: 0 0.275rem;
    border-radius: 3px;
    background: #5865f2;
    color: #fff;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 0.9375rem;
  }

  .dp-sent {
    margin-left: 0.25rem;
    color: #949ba4;
    font-size: 0.75rem;
  }

  .dp-content {
    color: #dbdee1;
  }

  .dp-embed {
    --dm-code-bg: #1e1f22;
    display: grid;
    max-width: 516px;
    margin-top: 8px;
    border-left: 4px solid;
    border-radius: 4px;
    background: #2b2d31;
    overflow: hidden;
  }

  .dp-embed-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    padding: 2px 16px 16px 12px;
  }

  .dp-has-thumb {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .dp-embed-grid > * {
    grid-column: 1 / 2;
    min-width: 0;
  }

  .dp-embed-author {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    color: #f2f3f5;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.375rem;
    overflow-wrap: break-word;
  }

  .dp-embed-author a,
  .dp-embed-title a {
    color: inherit;
    text-decoration: none;
  }

  .dp-embed-author a:hover,
  .dp-embed-title a:hover {
    text-decoration: underline;
  }

  .dp-embed-title a {
    color: #00a8fc;
  }

  .dp-embed-title {
    margin-top: 8px;
    color: #f2f3f5;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.375rem;
  }

  .dp-embed-description {
    margin-top: 8px;
    font-size: 0.875rem;
    line-height: 1.125rem;
  }

  .dp-fields {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 8px;
    margin-top: 8px;
  }

  .dp-field {
    min-width: 0;
    font-size: 0.875rem;
    line-height: 1.125rem;
  }

  .dp-field-name {
    margin-bottom: 2px;
    color: #f2f3f5;
    font-weight: 600;
  }

  .dp-embed-image {
    grid-column: 1 / -1;
    margin-top: 16px;
  }

  .dp-gallery {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    height: 300px;
    gap: 4px;
  }

  .dp-gallery-three, .dp-gallery-four { grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .dp-gallery a { min-width: 0; height: 100%; overflow: hidden; border-radius: 4px; }
  .dp-gallery :global(.dp-image) { width: 100%; height: 100%; max-height: none; object-fit: cover; }
  .dp-gallery-three a:first-child { grid-row: span 2; }

  .dp-embed-thumb {
    grid-column: 2 / 3;
    grid-row: 1 / 8;
    justify-self: end;
    margin: 8px 0 0 16px;
  }

  .dp-embed-footer {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    color: #dbdee1;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1rem;
    overflow-wrap: break-word;
  }

  .dp-dot {
    margin: 0 4px;
  }

  .dp-image {
    display: block;
    max-width: 100%;
    max-height: 300px;
    border-radius: 4px;
    object-fit: contain;
  }

  .dp-thumb {
    display: block;
    max-width: 80px;
    max-height: 80px;
    border-radius: 4px;
    object-fit: contain;
  }

  .dp-author-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
  }

  .dp-footer-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
  }

  .dp-broken {
    display: grid;
    place-items: center;
    min-width: 80px;
    min-height: 40px;
    padding: 6px;
    border: 1px dashed #4e5058;
    border-radius: 4px;
    color: #949ba4;
    font-size: 0.75rem;
    line-height: 1rem;
    text-align: center;
  }

  .dp-attachments { display: grid; gap: 8px; margin-top: 8px; }
  .dp-attachments figure { margin: 0; min-width: 0; }
  .dp-attachments img { max-width: 100%; max-height: 300px; object-fit: contain; border-radius: 4px; }
  .dp-attachments figcaption { color: #949ba4; font-size: .75rem; overflow-wrap: anywhere; }

  .dp-components {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }

  .dp-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .dp-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    max-width: 100%;
    min-width: 60px;
    min-height: 32px;
    padding: 2px 16px;
    border-radius: 8px;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1rem;
    overflow-wrap: break-word;
  }

  .dp-primary {
    background: #5865f2;
  }

  .dp-secondary,
  .dp-link {
    background: #4e5058;
  }

  .dp-success {
    background: #248046;
  }

  .dp-danger {
    background: #da373c;
  }

  .dp-button-emoji {
    width: 1.375rem;
    height: 1.375rem;
    object-fit: contain;
  }

  .dp-button-unicode {
    width: auto;
    font-size: 1.1rem;
    line-height: 1.375rem;
  }

  .dp-external {
    flex: 0 0 16px;
  }

  a:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 1px;
  }

  @media (max-width: 420px) {
    .dp {
      padding-right: 10px;
    }

    .dp-message {
      gap: 10px;
      padding-left: 10px;
    }

    .dp-avatar {
      flex-basis: 32px;
      height: 32px;
    }
  }
</style>
