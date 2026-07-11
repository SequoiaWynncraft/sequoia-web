<script lang="ts">
  import "$lib/design-system/styles.css";
  import "../app.css";
  import { onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { NMSR_PRECONNECT_ORIGIN } from "$lib/config/public";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import type { Snippet } from "svelte";
  import type { Viewer } from "$lib/site/viewer";

  let { children, data }: { children: Snippet; data: { viewer: Viewer | null } } = $props();
  const isHome = $derived(page.url.pathname === "/");

  // Events navigation morphs a hub sky band into the event hero (matching
  // view-transition-names); everywhere else keeps instant navigation.
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    const from = navigation.from?.url.pathname ?? "";
    const to = navigation.to?.url.pathname ?? "";
    if (!from.startsWith("/events") || !to.startsWith("/events")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
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
