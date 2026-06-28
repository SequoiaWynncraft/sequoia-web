<script lang="ts">
  import type { Snippet } from "svelte";
  import Card from "./Card.svelte";

  let {
    icon,
    title,
    description,
    cta = "Visit",
    href = "#",
    flagship = false,
  }: {
    icon?: Snippet;
    title: string;
    description: string;
    cta?: string;
    href?: string;
    flagship?: boolean;
  } = $props();
</script>

<Card {href} style="display:flex;flex-direction:column;padding:1.5rem">
  {#snippet children()}
    <div class="seq-service-card">
      <div
        class:seq-service-card-icon-flagship={flagship}
        class="seq-service-card-icon"
      >
        {#if icon}{@render icon()}{/if}
      </div>
      <h3 class="seq-service-card-title">{title}</h3>
      <p class="seq-service-card-copy">{description}</p>
      <span class="seq-service-card-cta">
        {cta}
        <svg class="seq-service-card-arrow" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </span>
    </div>
  {/snippet}
</Card>
