<script lang="ts">
  import Container from "$lib/components/Container.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
</script>

<Container width="md" style="text-align:center;padding:4rem 1.25rem">
  <div class="text-gold-gradient" style="font-family:var(--font-display);font-size:clamp(3rem,10vw,5rem);line-height:1">
    404
  </div>
  <p style="color:var(--color-text-secondary);margin:1rem 0 1.75rem">This path leads nowhere in the forest.</p>
  <a href="/" style="text-decoration:none">
    <Button>Back home</Button>
  </a>
</Container>
