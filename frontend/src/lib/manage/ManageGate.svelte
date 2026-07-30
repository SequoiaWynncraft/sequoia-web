<script lang="ts">
  import Button from "$lib/design-system/components/Button.svelte";
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import type { AreaAccess } from "./types";

  let {
    access,
    returnTo,
    title = "Restricted",
    signinText = "Sign in to continue.",
    deniedText = "You don't have access to this area.",
    backHref,
    backLabel = "Back",
  }: {
    access: Exclude<AreaAccess, "granted">;
    returnTo: string;
    title?: string;
    signinText?: string;
    deniedText?: string;
    backHref?: string;
    backLabel?: string;
  } = $props();
</script>

<div class="gate">
  <span class="gate-diamond" aria-hidden="true">◆</span>
  <h2 class="gate-title">{title}</h2>
  {#if access === "signin"}
    <p class="gate-text">{signinText}</p>
    <Button href={webAuthStartUrl(returnTo)}>Sign in</Button>
  {:else if access === "unverified"}
    <p class="gate-text">Access can't be verified right now - try again shortly.</p>
  {:else}
    <p class="gate-text">{deniedText}</p>
    {#if backHref}
      <Button variant="ghost" href={backHref}>{backLabel}</Button>
    {/if}
  {/if}
</div>

<style>
  .gate {
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

  .gate-diamond {
    color: var(--color-gold);
    font-size: var(--text-lg);
  }

  .gate-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .gate-text {
    margin: 0 0 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
