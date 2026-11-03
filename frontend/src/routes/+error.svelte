<script lang="ts">
  import { pageTitle } from "#lib/site/brand.js";
  import { page } from "$app/state";
  import Container from "#lib/components/Container.svelte";
  import Button from "#lib/design-system/components/Button.svelte";
  import { errorCopy } from "#lib/site/errorCopy.js";

  const copy = $derived(errorCopy(page.status));
  const requestId = $derived(page.error?.requestId);
</script>

<svelte:head>
  <title>{pageTitle(copy.title)}</title>
</svelte:head>

<Container width="md" style="text-align:center;padding:4rem 1.25rem">
  <div class="text-gold-gradient" style="font-family:var(--font-display);font-size:clamp(3rem,10vw,5rem);line-height:1">
    {copy.heading}
  </div>
  <p style="color:var(--color-text-secondary);margin:1rem 0 1.75rem">{copy.message}</p>
  {#if requestId}
    <p style="color:var(--color-text-dim);font-size:0.78rem;margin:-0.75rem 0 1.75rem">
      Reference: <code>{requestId}</code>
    </p>
  {/if}
  <Button href="/">Back home</Button>
</Container>
