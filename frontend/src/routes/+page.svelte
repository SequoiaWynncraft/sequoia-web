<script lang="ts">
  import { BRAND } from "#lib/site/brand.js";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import SectionHeading from "#lib/design-system/components/SectionHeading.svelte";
  import StatBlock from "#lib/design-system/components/StatBlock.svelte";
  import ServiceCard from "#lib/design-system/components/ServiceCard.svelte";
  import OfficerStrip from "#lib/design-system/components/OfficerStrip.svelte";
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
  import { homepageServices, homepageStatistics } from "#lib/site/nav.js";
  import { themeById } from "#lib/site/themePreferences.js";

  const IMG = "/assets/images/";
  const SERVICES = homepageServices();
  const STATISTICS = homepageStatistics();
  let { data } = $props();
  // The hero art belongs to the theme; the id comes from the root layout load,
  // so it is already resolved on the first server render.
  const theme = $derived(themeById(page.data.theme));
  let heroImage: HTMLImageElement;
  let statsSection: HTMLElement;
  let refreshedHomepageStats = $state<HomepageStats | null>(null);
  const homepageStats = $derived(refreshedHomepageStats ?? data.homepageStats);
  let pendingHomepageStats: HomepageStats | null = null;
  let statProgress = $state(1);
  const statEase = $derived(1 - Math.pow(1 - statProgress, 3));

  onMount(() => {
    const client = createSequoiaApiClient({ fetch: window.fetch.bind(window) });
    let cancelled = false;

    client.getGuildOverview()
      .then((result) => {
        if (cancelled || !result.ok) return;
        applyHomepageStats(result.data.stats);
        branchmasters.members = result.data.branchmasters.map(branchmasterCard);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) branchmastersLoaded = true;
      });

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

  // Fireflies
  let canvas: HTMLCanvasElement;
  onMount(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas cannot resolve var(), so the theme's gold is read off the root
    // once and the per-dot fade rides globalAlpha instead of an rgba string.
    const gold =
      getComputedStyle(document.documentElement).getPropertyValue("--color-gold").trim() ||
      "#e8a33d";
    let raf = 0, w = 0, h = 0;
    let visible = true;
    let pageVisible = !document.hidden;
    const tau = Math.PI * 2;
    const dots = Array.from({ length: 36 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4,
      p: Math.random() * Math.PI * 2, s: Math.random() * 0.0008 + 0.0002,
    }));
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.floor(w * ratio));
      canvas.height = Math.max(1, Math.floor(h * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const start = () => {
      if (!raf && visible && pageVisible) raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const draw = (t: number) => {
      if (!visible || !pageVisible) {
        raf = 0;
        return;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.shadowBlur = 6;
      ctx.shadowColor = gold;
      ctx.fillStyle = gold;
      for (let i = 0; i < dots.length; i += 1) {
        const d = dots[i];
        d.y -= d.s; if (d.y < -0.02) d.y = 1.02;
        const a = 0.35 + 0.45 * Math.sin(t * 0.002 + d.p);
        ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, tau);
        ctx.globalAlpha = a; ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) start(); else stop();
    };

    let observer: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start(); else stop();
      });
      observer.observe(canvas);
    }

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    start();
    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer?.disconnect();
    };
  });

  // Count-up
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

  type BranchmasterCard = {
    username: string;
    role: BranchmasterMember["rank"];
    rank: string;
    rankColor: string | null;
    online: boolean;
    avatarUrl: string;
    stats: Record<string, string>;
  };
  const branchmasters = $state<{ members: BranchmasterCard[] }>({ members: [] });
  let branchmastersLoaded = $state(false);
  const branchmasterTopLane = $derived(
    branchmasters.members.filter((member) => member.role === "branchmaster"),
  );
  const branchmasterBottomLane = $derived(
    branchmasters.members.filter((member) => member.role === "branch_novice"),
  );

  function branchmasterCard(member: BranchmasterMember): BranchmasterCard {
    const badge = branchLeadershipBadge(member);
    return {
      username: member.username,
      role: member.rank,
      rank: badge.label,
      rankColor: badge.color,
      online: member.online === true,
      avatarUrl: nmsrHeadIsoUrl(member.username),
      stats: {
        XP: compactNumber(member.contributed),
        Wars: formattedNumber(member.wars),
        Raids: formattedNumber(member.raids),
        Joined: joinedMonth(member.joined),
      },
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

  // Exhibition. The intrinsic size of each piece travels with it: the frames sit
  // in a CSS multi-column flow, where a lazy image with no dimensions lays out at
  // zero height, never intersects the viewport, and so never loads - a deadlock
  // that leaves the whole section blank. Width and height give the placeholder a
  // real box, which both breaks the deadlock and holds the column against reflow
  // as each piece arrives.
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
  // Where focus sat before the lightbox opened, so closing returns it there
  // instead of dumping the keyboard user back at the top of the page.
  let lightboxOpener: HTMLElement | null = null;

  // A modal dialog makes the rest of the page inert and turns Escape into a
  // native close, so keyboard focus cannot wander behind the open image.
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

  /** Every dismissal (button, scrim, Escape) ends here through the dialog's close event. */
  function onLightboxClosed() {
    lightbox = null;
    lightboxOpener?.focus();
    lightboxOpener = null;
  }

</script>

<!-- Hero -->
<section class="seq-hero seq-home-page">
  <div class="seq-hero-bg-wrap">
    <img
      src={IMG + theme.heroImage}
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
  <canvas bind:this={canvas} class="seq-hero-particles"></canvas>
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

<!-- Stats -->
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

<!-- Latest: running/next-day events and the newest fresh post, streamed after first paint; absent when empty. -->
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

<!-- Services -->
<section id="services" style="padding:5rem 1.5rem;max-width:72rem;margin:0 auto">
  <SectionHeading style="margin-bottom:3rem">Services</SectionHeading>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem">
    {#each SERVICES as service}
      <ServiceCard
        flagship={service.flagship}
        title={service.label}
        description={service.description ?? ""}
        cta={service.cta ?? "Visit"}
        href={service.to}
      >
        {#snippet icon()}{#if service.icon}<Icon name={service.icon} />{/if}{/snippet}
      </ServiceCard>
    {/each}
  </div>
</section>

<!-- Statistics -->
<section id="statistics" style="padding:0 1.5rem 5rem;max-width:72rem;margin:0 auto">
  <SectionHeading style="margin-bottom:3rem">Statistics</SectionHeading>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem">
    {#each STATISTICS as stat}
      <ServiceCard
        title={stat.label}
        description={stat.description ?? ""}
        cta={stat.cta ?? "View"}
        href={stat.to}
      >
        {#snippet icon()}{#if stat.icon}<Icon name={stat.icon} />{/if}{/snippet}
      </ServiceCard>
    {/each}
  </div>
</section>

<SequoianTree />

<!-- Members -->
<section id="members" class="seq-branchmasters-section">
  <div class="seq-branchmasters-heading">
    <SectionHeading kicker="The Guild">The Branchmasters</SectionHeading>
  </div>
  <div class="seq-branchmasters-marquee" role="region" aria-label="Branchmasters roster">
    {#if branchmasters.members.length > 0}
      <OfficerStrip officers={branchmasterTopLane} direction="ltr" />
      <OfficerStrip officers={branchmasterBottomLane} direction="rtl" />
    {:else if !branchmastersLoaded}
      <div class="seq-branchmasters-loading" aria-hidden="true"></div>
    {/if}
  </div>
</section>

<!-- Exhibition -->
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
      <!-- The scrim is the click-anywhere-to-close target, so it has to be a real control. -->
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

<!-- Recruitment -->
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
