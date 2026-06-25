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

  let hover = $state(false);
</script>

<Card {href} style="display:flex;flex-direction:column;padding:1.5rem">
  {#snippet children()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div onmouseenter={() => hover = true} onmouseleave={() => hover = false} style="display:flex;flex-direction:column;flex:1">
      <div
        style="width:2.5rem;height:2.5rem;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;margin-bottom:1rem;background:{flagship ? 'rgba(245,197,66,0.1)' : 'var(--color-border-subtle)'};color:{flagship ? 'var(--color-gold)' : hover ? 'var(--color-enchant)' : 'var(--color-text-secondary)'};transition:color var(--dur-base) ease,transform var(--dur-base) var(--ease-out-soft);transform:{hover ? 'translateY(-2px) scale(1.04)' : 'none'}"
      >
        {#if icon}{@render icon()}{/if}
      </div>
      <h3 style="font-family:var(--font-display);font-size:1.125rem;letter-spacing:0.04em;color:var(--color-text-primary);margin:0 0 0.5rem">{title}</h3>
      <p style="font-family:var(--font-body);font-size:0.95rem;line-height:1.6;color:var(--color-text-secondary);margin:0">{description}</p>
      <span style="margin-top:1rem;display:inline-flex;align-items:center;gap:0.4rem;font-family:var(--font-display);font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;color:{hover ? 'var(--color-gold)' : 'rgba(245,197,66,0.8)'};transition:color var(--dur-base) ease">
        {cta}
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="transform:{hover ? 'translateX(3px)' : 'none'};transition:transform var(--dur-base) var(--ease-out-soft)">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </span>
    </div>
  {/snippet}
</Card>
