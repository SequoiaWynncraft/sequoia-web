<script lang="ts">
  import "$lib/design-system/styles.css";
  import "../app.css";
  import { page } from "$app/state";
  import { NMSR_PRECONNECT_ORIGIN } from "$lib/config/public";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import type { Snippet } from "svelte";
  import type { Viewer } from "$lib/site/viewer";

  let { children, data }: { children: Snippet; data: { viewer: Viewer | null } } = $props();
  const isHome = $derived(page.url.pathname === "/");
</script>

<svelte:head>
  {#if NMSR_PRECONNECT_ORIGIN}
    <link rel="preconnect" href={NMSR_PRECONNECT_ORIGIN} />
  {/if}
</svelte:head>

<div class="seq-app-shell">
  <div aria-hidden="true" class="seq-page-backdrop">
    <div class="seq-page-backdrop-glow seq-page-backdrop-glow-gold"></div>
    <div class="seq-page-backdrop-glow seq-page-backdrop-glow-enchant"></div>
    <div class="seq-page-backdrop-glow seq-page-backdrop-glow-low"></div>
    <div class="seq-page-backdrop-vignette"></div>
  </div>
  <Navbar viewer={data.viewer} />
  <main class="seq-main-shell" class:seq-main-home={isHome}>
    {@render children()}
  </main>
  <div class="seq-footer-layer">
    <Footer />
  </div>
</div>
