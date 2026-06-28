<script lang="ts">
  import { onMount } from "svelte";
  import SectionHeading from "$lib/design-system/components/SectionHeading.svelte";
  import StatBlock from "$lib/design-system/components/StatBlock.svelte";
  import ServiceCard from "$lib/design-system/components/ServiceCard.svelte";
  import OfficerCard from "$lib/design-system/components/OfficerCard.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { homepageServices } from "$lib/site/nav";

  const IMG = "/assets/images/";
  const SERVICES = homepageServices();
  let heroImage: HTMLImageElement;
  let statsSection: HTMLElement;
  let statProgress = $state(1);
  const statEase = $derived(1 - Math.pow(1 - statProgress, 3));

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
      ctx.shadowColor = "rgba(245,197,66,0.6)";
      for (let i = 0; i < dots.length; i += 1) {
        const d = dots[i];
        d.y -= d.s; if (d.y < -0.02) d.y = 1.02;
        const a = 0.35 + 0.45 * Math.sin(t * 0.002 + d.p);
        ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, tau);
        ctx.fillStyle = `rgba(245,197,66,${a})`; ctx.fill();
      }
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
      statProgress = 0;
      raf = requestAnimationFrame(tick);
    };
    const tick = (t: number) => {
      if (!start) start = t;
      statProgress = Math.min((t - start) / dur, 1);
      if (statProgress < 1) raf = requestAnimationFrame(tick);
    };

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        observer?.disconnect();
        animate();
      }, { threshold: 0.35 });
      observer.observe(statsSection);
    } else {
      statProgress = 1;
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  });
  const statValue = (target: number) => Math.round(target * statEase).toLocaleString();

  // Officers
  const OFFICERS = [
    { username: "Amber", rank: "owner", online: true, stats: { XP: "4.1M", Wars: "612", Raids: "188", Joined: "Jan 2022" } },
    { username: "RaidKeeper", rank: "strategist", online: false, stats: { XP: "2.3M", Wars: "401", Raids: "240", Joined: "Mar 2023" } },
    { username: "Wisteria", rank: "chief", online: true, stats: { XP: "3.4M", Wars: "528", Raids: "201", Joined: "Feb 2022" } },
    { username: "Bramblewood", rank: "chief", online: false, stats: { XP: "2.9M", Wars: "470", Raids: "176", Joined: "May 2022" } },
    { username: "Thornbark", rank: "strategist", online: true, stats: { XP: "1.9M", Wars: "352", Raids: "159", Joined: "Aug 2023" } },
    { username: "Larkspur", rank: "captain", online: false, stats: { XP: "1.4M", Wars: "288", Raids: "121", Joined: "Nov 2023" } },
  ];
  const officerLoop = [...OFFICERS, ...OFFICERS];

  // Exhibition
  const ART = [
    { src: "fruma_banner.avif", title: "Fruma", desc: "Stained-glass guardian" },
    { src: "cozy_aspec.avif", title: "Cozy", desc: "A quiet evening in" },
    { src: "spirits_propaganda_chibis.avif", title: "Spirits", desc: "Chibi propaganda" },
    { src: "tcc_gloating_rights.avif", title: "Gloating Rights", desc: "Season victory" },
    { src: "nolers2.avif", title: "Nolers", desc: "Community piece" },
    { src: "nol_chibi_rush_all.avif", title: "Chibi Rush", desc: "The whole parade" },
    { src: "anni_july_page.avif", title: "July Anniversary", desc: "Guild milestone" },
    { src: "nolers3.avif", title: "Nolers III", desc: "Fan art" },
  ];
  let lightbox = $state<number | null>(null);

  // Recruitment hover
  let applyHover = $state(false);
</script>

<!-- Hero -->
<section class="seq-hero seq-home-page">
  <div class="seq-hero-bg-wrap">
    <img
      src={IMG + "fruma_banner.avif"}
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
      Sequoia
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
      <StatBlock value={statValue(128)} label="Members">{#snippet icon()}<Icon name="users" />{/snippet}</StatBlock>
      <StatBlock value={statValue(142)} label="Guild Level">{#snippet icon()}<Icon name="level" />{/snippet}</StatBlock>
      <StatBlock value={statValue(312)} label="Territories">{#snippet icon()}<Icon name="territory" />{/snippet}</StatBlock>
      <StatBlock value={statValue(18472)} label="Total Wars">{#snippet icon()}<Icon name="war" />{/snippet}</StatBlock>
      <StatBlock value={statValue(9043)} label="Raids">{#snippet icon()}<Icon name="raid" />{/snippet}</StatBlock>
      <StatBlock value={statValue(7)} label="Online Now">{#snippet icon()}<Icon name="online" />{/snippet}</StatBlock>
    </div>
    <div class="divider-gold" style="margin-top:3rem"></div>
  </div>
</section>

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

<!-- Members -->
<section id="members" style="padding:5rem 0">
  <div style="max-width:80rem;margin:0 auto">
    <SectionHeading kicker="The Guild" style="margin-bottom:2.5rem;padding:0 1.5rem">The Branchmasters</SectionHeading>
    <div style="overflow:hidden;-webkit-mask-image:linear-gradient(to right,transparent,black 6%,black 94%,transparent);mask-image:linear-gradient(to right,transparent,black 6%,black 94%,transparent)">
      <div style="display:flex;gap:1.25rem;width:max-content;animation:seq-officer-scroll 48s linear infinite;padding:0.5rem 0">
        {#each officerLoop as o}
          <OfficerCard username={o.username} rank={o.rank} online={o.online} stats={o.stats} />
        {/each}
      </div>
    </div>
  </div>
</section>

<!-- Exhibition -->
<section style="padding:5rem 1.5rem;background:var(--color-deep)">
  <div style="max-width:80rem;margin:0 auto">
    <SectionHeading kicker="Community" gradient="enchant" style="margin-bottom:2.5rem">Exhibition</SectionHeading>
    <div style="columns:auto 260px;column-gap:1rem">
      {#each ART as a, i}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div onclick={() => lightbox = i} class="seq-art-frame" style="break-inside:avoid;margin-bottom:1rem;border-radius:0.75rem;overflow:hidden;border:1px solid rgba(40,44,62,0.6);cursor:pointer;position:relative" role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') lightbox = i; }}>
          <img src={IMG + a.src} alt={a.title} loading="lazy" decoding="async" style="width:100%;display:block;filter:brightness(0.92) saturate(0.95)" />
          <div class="seq-art-cap" style="position:absolute;bottom:0;left:0;right:0;padding:0.7rem 0.85rem;background:linear-gradient(to top,rgba(12,14,23,0.9),transparent)">
            <div style="font-family:var(--font-display);font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(245,197,66,0.9)">{a.title}</div>
            <div style="font-size:0.72rem;color:rgba(154,149,144,0.8)">{a.desc}</div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if lightbox !== null}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div onclick={() => lightbox = null} style="position:fixed;inset:0;z-index:1000;background:rgba(12,14,23,0.92);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:2rem;animation:seq-fade-in 0.2s ease both" role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Escape') lightbox = null; }}>
      <img src={IMG + ART[lightbox].src} alt={ART[lightbox].title} style="max-width:90vw;max-height:85vh;object-fit:contain;border-radius:4px;box-shadow:var(--shadow-lg)" />
    </div>
  {/if}
</section>

<!-- Recruitment -->
<section id="join" style="background:var(--color-deep);padding:1rem 0 3rem">
  <div style="max-width:36rem;margin:0 auto;padding:3rem 2rem;text-align:center">
    <div style="width:3rem;height:1px;margin:0 auto 1.75rem;background:linear-gradient(90deg,transparent,rgba(245,197,66,0.3),transparent)"></div>
    <a
      href="https://discord.gg/seq" target="_blank" rel="noreferrer"
      onmouseenter={() => applyHover = true}
      onmouseleave={() => applyHover = false}
      style="display:inline-block;font-family:var(--font-display);font-size:clamp(1.35rem,4vw,2rem);letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;color:{applyHover ? 'var(--color-enchant)' : 'var(--color-gold)'};padding:0.75em 1.6em;text-shadow:{applyHover ? '0 0 16px rgba(168,85,247,0.3)' : '0 1px 0 rgba(0,0,0,0.3)'};transform:{applyHover ? 'translateY(-1px)' : 'none'};transition:color 0.3s ease,text-shadow 0.3s ease,transform 0.2s ease"
    >
      Apply Now
    </a>
    <p style="margin-top:1rem;font-size:0.8rem;letter-spacing:0.04em;color:rgba(154,149,144,0.5)">Join us on Discord</p>
  </div>
</section>
