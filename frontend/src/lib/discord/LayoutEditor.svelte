<script lang="ts">
  import LayoutEditor from "./LayoutEditor.svelte";
  import Field from "#lib/design-system/components/forms/Field.svelte";
  import Select from "#lib/design-system/components/forms/Select.svelte";
  import MarkdownField from "./MarkdownField.svelte";
  import { hexColor, parseHexColor } from "./format";
  import type { DiscordContext, LayoutComponent } from "./types";

  let { components = $bindable(), context, nested = false }: { components: LayoutComponent[]; context: DiscordContext; nested?: boolean } = $props();
  function move(at: number, by: number) {
    const to = at + by;
    if (to >= 0 && to < components.length) [components[at], components[to]] = [components[to], components[at]];
  }
</script>

<div class="layout-editor">
  {#each components as component, index (index)}
    <section class="layout-block" aria-label={`Layout block ${index + 1}`}>
      <header><strong>{component.type === 17 ? "Container" : component.type === 10 ? "Text block" : "Separator"}</strong><div>
        <button type="button" aria-label={`Move layout block ${index + 1} up`} disabled={index === 0} onclick={() => move(index, -1)}>↑</button>
        <button type="button" aria-label={`Move layout block ${index + 1} down`} disabled={index === components.length - 1} onclick={() => move(index, 1)}>↓</button>
        <button type="button" aria-label={`Remove layout block ${index + 1}`} disabled={!nested && components.length === 1} onclick={() => components.splice(index, 1)}>Remove</button>
      </div></header>
      {#if component.type === 10}
        <MarkdownField label={`Text block ${index + 1}`} bind:value={component.content} limit={4000} rows={8} {context} />
      {:else if component.type === 14}
        <Field label="Separator spacing"><Select aria-label="Separator spacing" value={String(component.spacing ?? 1)} onchange={(e) => component.spacing = Number(e.currentTarget.value) as 1 | 2}><option value="1">Small</option><option value="2">Large</option></Select></Field>
        <label class="check"><input type="checkbox" checked={component.divider ?? true} onchange={(e) => component.divider = e.currentTarget.checked} /> Show divider</label>
      {:else}
        <Field label="Container accent"><input type="color" aria-label="Container accent" value={hexColor(component.accent_color ?? 0x19a775)} oninput={(e) => component.accent_color = parseHexColor(e.currentTarget.value)} /><button type="button" onclick={() => component.accent_color = null}>No accent</button></Field>
        <label class="check"><input type="checkbox" checked={component.spoiler ?? false} onchange={(e) => component.spoiler = e.currentTarget.checked} /> Spoiler container</label>
        <LayoutEditor bind:components={component.components} {context} nested />
      {/if}
    </section>
  {/each}
  <div class="add-block"><button type="button" onclick={() => components.push({ type: 10, content: "" })}>Add text block</button><button type="button" onclick={() => components.push({ type: 14, divider: true, spacing: 1 })}>Add separator</button>{#if !nested}<button type="button" onclick={() => components.push({ type: 17, components: [{ type: 10, content: "" }] })}>Add container</button>{/if}</div>
</div>

<style>
  .layout-editor { display: grid; gap: 12px; min-width: 0; }
  .layout-block { display: grid; gap: 12px; min-width: 0; padding: 14px; border: 1px solid var(--border-default); border-radius: 8px; }
  header, .add-block { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  header div { display: flex; gap: 6px; }
  button { padding: 5px 8px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-default); border-radius: 4px; font: inherit; font-size: var(--text-xs); cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  .check { display: flex; gap: 8px; align-items: center; color: var(--text-muted); font-size: var(--text-xs); }
</style>
