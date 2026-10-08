<script lang="ts">
  import LayoutPreview from "./LayoutPreview.svelte";
  import DiscordMarkdown from "./DiscordMarkdown.svelte";
  import { hexColor } from "./format";
  import type { LayoutComponent } from "./types";
  let { components, names, now }: { components: LayoutComponent[]; names: { roles: Map<string,string>; channels: Map<string,string> }; now: number } = $props();
</script>
<div class="layout-preview">
  {#each components as component, index (index)}
    {#if component.type === 10}
      <div class="layout-text"><DiscordMarkdown source={component.content} {names} {now} /></div>
    {:else if component.type === 14}
      <div class="layout-separator" class:large={component.spacing === 2} class:divider={component.divider ?? true}></div>
    {:else}
      <div class="layout-container" class:spoiler={component.spoiler} style:border-left-color={component.accent_color == null ? "transparent" : hexColor(component.accent_color)}><LayoutPreview components={component.components} {names} {now} /></div>
    {/if}
  {/each}
</div>
<style>
  .layout-preview { display: grid; gap: 8px; min-width: 0; }
  .layout-text { overflow-wrap: anywhere; min-width: 0; }
  .layout-container { max-width: 516px; padding: 16px; background: #2b2d31; border: 1px solid #1e1f22; border-left-width: 4px; border-radius: 8px; }
  .layout-container.spoiler { filter: blur(6px); }
  .layout-container.spoiler:hover { filter: none; }
  .layout-separator { height: 8px; }
  .layout-separator.large { height: 16px; }
  .layout-separator.divider { border-top: 1px solid #4e5058; margin-top: 8px; }
</style>
