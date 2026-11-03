<script lang="ts">
  import type { Snippet } from "svelte";
  import SectionLabel from "../SectionLabel.svelte";

  let {
    title,
    id,
    meta,
    actions,
    badge,
    class: extraClass = "",
    children,
  }: {
    title: string;
    id?: string;
    meta?: string;
    actions?: Snippet;
    badge?: Snippet;
    class?: string;
    children: Snippet;
  } = $props();
</script>

{#snippet headerActions()}
  {#if badge}{@render badge()}{/if}
  {#if actions}{@render actions()}{/if}
{/snippet}

<section class={["form-section", extraClass]} {id}>
  <SectionLabel {meta} actions={badge || actions ? headerActions : undefined}>{title}</SectionLabel>
  {@render children()}
</section>

<style>
  .form-section {
    display: grid;
    gap: 14px;
    padding: 22px 0 26px;
    border-bottom: 1px solid var(--color-border-subtle);
    scroll-margin-top: calc(3.5rem + 20px);
  }

  .form-section:first-child {
    padding-top: 0;
  }
</style>
