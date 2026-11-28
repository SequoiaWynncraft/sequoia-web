<script lang="ts">
  import { BRAND } from "#lib/site/brand.js";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import SectionHeading from "#lib/design-system/components/SectionHeading.svelte";
  import StatBlock from "#lib/design-system/components/StatBlock.svelte";
  import HeroSparks from "#lib/components/HeroSparks.svelte";
  import BranchmasterLane from "#lib/components/BranchmasterLane.svelte";
  import type { BranchmasterCardData } from "#lib/components/BranchmasterCard.svelte";
  import SequoianTree from "#lib/components/SequoianTree.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import EventSky from "#lib/events/components/EventSky.svelte";
  import { formatWindow } from "#lib/events/format.js";
  import { eventStatus } from "#lib/events/helpers.js";
  import { formatPostDate } from "#lib/posts/format.js";
  import { POST_FEEDS, postHref } from "#lib/posts/types.js";
  import { createSequoiaApiClient } from "#lib/api/client.js";
  import {
    branchLeadershipBadge,
    type BranchmasterMember,
    type HomepageStats,
  } from "#lib/api/guildOverview.js";
  import { NMSR_BASE_URL } from "#lib/config/public.js";
  import { themeById } from "#lib/site/themePreferences.js";

  const IMG = "/assets/images/";
  let { data } = $props();
  const theme = $derived(themeById(page.data.theme));
  let heroImage: HTMLImageElement;
  let statsSection: HTMLElement;
  let refreshedHomepageStats = $state<HomepageStats | null>(null);
  const homepageStats = $derived(refreshedHomepageStats ?? data.homepageStats);
  let pendingHomepageStats: HomepageStats | null = null;
  let statProgress = $state(1);
  const statEase = $derived(1 - Math.pow(1 - statProgress, 3));

  let refreshedBranchmasters = $state<BranchmasterMember[] | null>(null);

  // The server may answer from a stale cache; only then ask for fresh numbers.
  onMount(() => {
    if (!data.statsStale) return;
    const client = createSequoiaApiClient({ fetch: window.fetch.bind(window) });
    let cancelled = false;

    client.getGuildOverview()
      .then((result) => {
        if (cancelled || !result.ok) return;
        applyHomepageStats(result.data.stats);
        if (result.data.branchmasters.length > 0) refreshedBranchmasters = result.data.branchmasters;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  });

  function applyHomepageStats(stats: HomepageStats) {
    if (statProgress > 0 && statProgress < 1) {
      pendingHomepageStats = stats;
      return;
    }
    refreshedHomepageStats = stats;
  }

  onMount(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !heroImage) return;

    let smoothScrollY = window.scrollY;
    let targetScrollY = smoothScrollY;
    let raf = 0;
    const render = () => {
      const heroOffset = Math.max(-18, smoothScrollY * -0.032);
      heroImage.style.transform = `translate3d(0,${heroOffset}px,0) scale(1.045)`;
    };
    const tick = () => {
      const delta = targetScrollY - smoothScrollY;

      if (Math.abs(delta) < 0.2) {
        smoothScrollY = targetScrollY;
        render();
        raf = 0;
        return;
      }

      smoothScrollY += delta * 0.14;
      render();
      raf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      targetScrollY = window.scrollY;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    targetScrollY = window.scrollY;
    smoothScrollY = targetScrollY;
    render();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  });

  onMount(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !statsSection) return;

    const initialRect = statsSection.getBoundingClientRect();
    if (initialRect.bottom > 0 && initialRect.top < window.innerHeight) return;
    if (initialRect.bottom <= 0) return;

    let raf = 0, start = 0;
    let observer: IntersectionObserver | undefined;
    const dur = 1400;
    const animate = () => {
      if (raf) return;
      start = 0;
      raf = requestAnimationFrame(tick);
    };
    const tick = (t: number) => {
      if (!start) start = t;
      statProgress = Math.min((t - start) / dur, 1);
      if (statProgress < 1) raf = requestAnimationFrame(tick);
      else if (pendingHomepageStats) {
        refreshedHomepageStats = pendingHomepageStats;
        pendingHomepageStats = null;
      }
    };

    statProgress = 0;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        observer?.disconnect();
        animate();
      }, { threshold: 0.01 });
      observer.observe(statsSection);
    } else {
      statProgress = 1;
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  });
  const statValue = (target: number | undefined) =>
    target === undefined ? "-" : Math.round(target * statEase).toLocaleString();
  const nmsrHeadIsoUrl = (username: string) =>
    `${NMSR_BASE_URL.replace(/\/+$/, "")}/headiso/${encodeURIComponent(username)}?w=128`;

  function branchmasterCard(member: BranchmasterMember): BranchmasterCardData {
    const badge = branchLeadershipBadge(member);
    return {
      username: member.username,
      rank: badge.label,
      rankColor: badge.color,
      online: member.online === true,
      avatarUrl: nmsrHeadIsoUrl(member.username),
      stats: [
        ["XP", compactNumber(member.contributed)],
        ["Wars", formattedNumber(member.wars)],
        ["Raids", formattedNumber(member.raids)],
        ["Joined", joinedMonth(member.joined)],
      ],
    };
  }

  function lanes(members: BranchmasterMember[]) {
    const cards = members.map((member) => ({ role: member.rank, card: branchmasterCard(member) }));
    return {
      masters: cards.filter((entry) => entry.role === "branchmaster").map((entry) => entry.card),
      novices: cards.filter((entry) => entry.role === "branch_novice").map((entry) => entry.card),
    };
  }

  function compactNumber(value: number | null): string {
    if (value === null) return "-";
    return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  function formattedNumber(value: number | null): string {
    return value === null ? "-" : value.toLocaleString();
  }

  function joinedMonth(value: string | null): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "-";
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }

  const ART = [
    { src: "fruma_banner.avif", title: "Fruma", desc: "Stained-glass guardian", w: 1920, h: 1080 },
    { src: "cozy_aspec.avif", title: "Cozy", desc: "A quiet evening in", w: 926, h: 1186 },
    { src: "spirits_propaganda_chibis.avif", title: "Spirits", desc: "Chibi propaganda", w: 2400, h: 2000 },
    { src: "tcc_gloating_rights.avif", title: "Gloating Rights", desc: "Season victory", w: 1450, h: 1398 },
    { src: "nolers2.avif", title: "Nolers", desc: "Community piece", w: 812, h: 768 },
    { src: "nol_chibi_rush_all.avif", title: "Chibi Rush", desc: "The whole parade", w: 6868, h: 712 },
    { src: "anni_july_page.avif", title: "July Anniversary", desc: "Guild milestone", w: 2400, h: 2000 },
    { src: "nolers3.avif", title: "Nolers III", desc: "Fan art", w: 868, h: 512 },
  ];
  let lightbox = $state<number | null>(null);
  let lightboxDialog = $state<HTMLDialogElement | null>(null);
  let lightboxClose = $state<HTMLButtonElement | null>(null);
  let lightboxOpener: HTMLElement | null = null;

  $effect(() => {
    if (lightbox === null || !lightboxDialog) return;
    if (!lightboxDialog.open) lightboxDialog.showModal();
    lightboxClose?.focus();
  });

  function openLightbox(index: number, opener: HTMLElement) {
    lightboxOpener = opener;
    lightbox = index;
  }

  function closeLightbox() {
    lightboxDialog?.close();
  }

  function onLightboxClosed() {
    lightbox = null;
    lightboxOpener?.focus();
    lightboxOpener = null;
  }

</script>

<section class="seq-hero seq-home-page">
  <div class="seq-hero-bg-wrap" style:background-image={theme.heroPreview ? `url(${theme.heroPreview})` : undefined}>
    <img
      src={IMG + theme.heroImage}
      srcset={theme.heroSmall
        ? `${IMG + theme.heroSmall.src} ${theme.heroSmall.width}w, ${IMG + theme.heroImage} ${theme.heroSmall.fullWidth}w`
        : undefined}
      sizes={theme.heroSmall ? "100vw" : undefined}
      alt=""
      aria-hidden="true"
      decoding="async"
      fetchpriority="high"
      class="seq-hero-bg"
      bind:this={heroImage}
      style="transform:translate3d(0,0px,0) scale(1.045)"
    />
  </div>
  <div class="seq-hero-vignette"></div>
  <div class="seq-hero-fade"></div>
  <HeroSparks />
  <div class="seq-hero-content">
    <h1 class="seq-hero-title text-gold-gradient">
      {BRAND.name}
    </h1>
  </div>
  <div class="seq-hero-scroll">
    <span class="seq-hero-kicker">Explore</span>
    <div class="seq-hero-chevron"></div>
  </div>
</section>

<section bind:this={statsSection} style="padding:4rem 1.5rem;background:var(--color-deep)">
  <div style="max-width:64rem;margin:0 auto">
    <div class="divider-gold" style="margin-bottom:3rem"></div>
    <div class="seq-stats-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:2rem 1rem">
      <StatBlock value={statValue(homepageStats?.members)} label="Members">{#snippet icon()}<Icon name="users" />{/snippet}</StatBlock>
      <StatBlock value={statValue(homepageStats?.guild_level)} label="Guild Level">{#snippet icon()}<Icon name="level" />{/snippet}</StatBlock>
      <StatBlock value={statValue(homepageStats?.territories)} label="Territories">{#snippet icon()}<Icon name="territory" />{/snippet}</StatBlock>
      <StatBlock value={statValue(homepageStats?.total_wars)} label="Total Wars">{#snippet icon()}<Icon name="war" />{/snippet}</StatBlock>
      <StatBlock value={statValue(homepageStats?.raids)} label="Raids">{#snippet icon()}<Icon name="raid" />{/snippet}</StatBlock>
      <StatBlock value={statValue(homepageStats?.online_now)} label="Online Now">{#snippet icon()}<Icon name="online" />{/snippet}</StatBlock>
    </div>
    <div class="divider-gold" style="margin-top:3rem"></div>
  </div>
</section>

{#await data.latest then { events, posts }}
  {#if events.length > 0 || posts.length > 0}
    <section class="seq-latest" aria-label="Latest news, announcements and events">
      <SectionHeading kicker="From the guild" style="margin-bottom:2.5rem">Latest</SectionHeading>
      <div class="seq-latest-grid">
        {#each events as event (event.slug)}
          <a class="seq-latest-card focus-ring" href={`/events/${event.slug}`}>
            <EventSky theme={event.theme}>
              <div class="seq-latest-inner">
                <span class="seq-latest-meta">
                  {eventStatus(event, new Date()) === "live" ? "Live now" : "Starting soon"} · {formatWindow(event)}
                </span>
                <span class="seq-latest-title">{event.name}</span>
                <span class="seq-latest-summary">{event.tagline}</span>
              </div>
            </EventSky>
          </a>
        {/each}
        {#each posts as post (post.slug)}
          <a class="seq-latest-card focus-ring" href={postHref(post)}>
            <EventSky theme={post.theme}>
              <div class="seq-latest-inner">
                <span class="seq-latest-meta">
                  {POST_FEEDS[post.feed].label} · <time datetime={post.date}>{formatPostDate(post.date)}</time>
                </span>
                <span class="seq-latest-title">{post.title}</span>
                <span class="seq-latest-summary">{post.summary}</span>
              </div>
            </EventSky>
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/await}

<style>
  .seq-latest {
    max-width: 72rem;
    margin: 0 auto;
    padding: 5rem 1.5rem 0;
  }

  .seq-latest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1.5rem;
  }

  .seq-latest-card {
    display: block;
    text-decoration: none;
  }

  .seq-latest-card :global(.ev-sky) {
    height: 100%;
  }

  .seq-latest-card:hover :global(.ev-sky) {
    border-color: color-mix(in srgb, var(--ev-accent) 45%, var(--color-border-subtle));
  }

  .seq-latest-inner {
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 22px 22px 24px;
  }

  .seq-latest-meta {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .seq-latest-title {
    background: linear-gradient(90deg, var(--ev-accent), var(--ev-accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    overflow-wrap: anywhere;
    text-transform: uppercase;
  }

  .seq-latest-summary {
    color: var(--text-body);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
</style>

<SequoianTree />

<section id="members" class="seq-branchmasters-section">
  <div class="seq-branchmasters-heading">
    <SectionHeading kicker="The Guild">The Branchmasters</SectionHeading>
  </div>
  <div class="seq-branchmasters-lanes">
    {#await data.branchmasters}
      <div class="seq-branchmasters-pending"></div>
    {:then streamed}
      {@const { masters, novices } = lanes(refreshedBranchmasters ?? streamed)}
      {#if masters.length > 0}
        <BranchmasterLane members={masters} direction="left" label="Branchmasters" />
      {/if}
      {#if novices.length > 0}
        <BranchmasterLane members={novices} direction="right" label="Branch novices" />
      {/if}
    {/await}
  </div>
</section>

<section style="padding:5rem 1.5rem;background:var(--color-deep)">
  <div style="max-width:80rem;margin:0 auto">
    <SectionHeading kicker="Community" gradient="enchant" style="margin-bottom:2.5rem">Exhibition</SectionHeading>
    <div style="columns:auto 260px;column-gap:1rem">
      {#each ART as a, i}
        <button type="button" onclick={(event) => openLightbox(i, event.currentTarget)} class="seq-art-frame" aria-label={`View ${a.title} full size`} style="break-inside:avoid;margin-bottom:1rem;padding:0;width:100%;text-align:left;border-radius:0.75rem;overflow:hidden;border:1px solid color-mix(in srgb, var(--color-border-subtle) 60%, transparent);background:none;cursor:zoom-in;position:relative">
          <img src={IMG + a.src} alt={a.title} width={a.w} height={a.h} loading="lazy" decoding="async" style="width:100%;height:auto;aspect-ratio:{a.w} / {a.h};display:block;filter:brightness(0.92) saturate(0.95)" />
          <div class="seq-art-cap" style="position:absolute;bottom:0;left:0;right:0;padding:0.7rem 0.85rem;background:linear-gradient(to top,color-mix(in srgb, var(--color-abyss) 90%, transparent),transparent)">
            <div style="font-family:var(--font-display);font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;color:color-mix(in srgb, var(--color-gold) 90%, transparent)">{a.title}</div>
            <div style="font-size:0.72rem;color:color-mix(in srgb, var(--color-text-secondary) 80%, transparent)">{a.desc}</div>
          </div>
        </button>
      {/each}
    </div>
  </div>

  {#if lightbox !== null}
    <dialog
      bind:this={lightboxDialog}
      class="seq-lightbox"
      aria-label={ART[lightbox].title}
      onclose={onLightboxClosed}
    >
      <button
        type="button"
        onclick={closeLightbox}
        aria-label="Close image"
        style="position:absolute;inset:0;border:0;background:color-mix(in srgb, var(--color-abyss) 92%, transparent);backdrop-filter:blur(8px);cursor:zoom-out"
      ></button>
      <img src={IMG + ART[lightbox].src} alt={ART[lightbox].title} width={ART[lightbox].w} height={ART[lightbox].h} style="position:relative;width:auto;height:auto;max-width:90vw;max-height:85vh;object-fit:contain;border-radius:4px;box-shadow:var(--shadow-lg)" />
      <button
        bind:this={lightboxClose}
        type="button"
        onclick={closeLightbox}
        class="seq-button seq-button-secondary seq-button-sm"
        style="position:absolute;top:1.5rem;right:1.5rem"
      >
        Close
      </button>
    </dialog>
  {/if}
</section>

<section id="join" style="background:var(--color-deep);padding:1rem 0 3rem">
  <div style="max-width:36rem;margin:0 auto;padding:3rem 2rem;text-align:center">
    <div style="width:3rem;height:1px;margin:0 auto 1.75rem;background:linear-gradient(90deg,transparent,color-mix(in srgb, var(--color-gold) 30%, transparent),transparent)"></div>
    <a
      href={BRAND.discordUrl} target="_blank" rel="noreferrer"
      class="seq-apply-link"
    >
      Apply Now
    </a>
    <p style="margin-top:1rem;font-size:0.8rem;letter-spacing:0.04em;color:color-mix(in srgb, var(--color-text-secondary) 50%, transparent)">Join us on Discord</p>
  </div>
</section>
