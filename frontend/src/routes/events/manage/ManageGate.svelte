<script lang="ts">
  import Button from "$lib/design-system/components/Button.svelte";
  import type { ManagerAccess } from "$lib/server/eventManagers";
  import { webAuthStartUrl } from "$lib/site/webAuth";

  let { access, returnTo }: { access: Exclude<ManagerAccess, "manager">; returnTo: string } =
    $props();
</script>

<div class="mg-gate">
  <span class="mg-gate-diamond" aria-hidden="true">◆</span>
  <h2 class="mg-gate-title">Guild leadership only</h2>
  {#if access === "signin"}
    <p class="mg-gate-text">Sign in to manage guild events.</p>
    <Button href={webAuthStartUrl(returnTo)}>Sign in</Button>
  {:else if access === "unverified"}
    <p class="mg-gate-text">Membership can't be verified right now - try again shortly.</p>
  {:else}
    <p class="mg-gate-text">Events are managed by strategists and above.</p>
    <Button variant="ghost" href="/events">Back to events</Button>
  {/if}
</div>

<style>
  .mg-gate {
    display: grid;
    justify-items: center;
    gap: 12px;
    margin: 72px auto 40px;
    padding: 44px 28px;
    max-width: 460px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-abyss) 55%, transparent);
    text-align: center;
  }

  .mg-gate-diamond {
    color: var(--color-gold);
    font-size: var(--text-lg);
  }

  .mg-gate-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .mg-gate-text {
    margin: 0 0 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
