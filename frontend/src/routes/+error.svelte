<script lang="ts">
  import { page } from "$app/stores";
  import Container from "$lib/components/Container.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import { errorCopy } from "$lib/site/errorCopy";

  const copy = $derived(errorCopy($page.status));
</script>

<svelte:head>
  <title>{copy.title} — Sequoia</title>
</svelte:head>

<Container width="md" style="text-align:center;padding:4rem 1.25rem">
  <div class="text-gold-gradient" style="font-family:var(--font-display);font-size:clamp(3rem,10vw,5rem);line-height:1">
    {copy.heading}
  </div>
  <p style="color:var(--color-text-secondary);margin:1rem 0 1.75rem">{copy.message}</p>
  <Button href="/">Back home</Button>
</Container>
