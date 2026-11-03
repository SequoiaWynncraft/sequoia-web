<script lang="ts">
  import { onMount, tick } from "svelte";
  import OfficerCard from "./OfficerCard.svelte";

  type Officer = {
    username: string;
    rank?: string;
    rankColor?: string | null;
    online?: boolean;
    avatarUrl?: string;
    stats?: Record<string, string>;
  };

  let {
    officers,
    direction = "ltr",
  }: {
    officers: Officer[];
    direction?: "ltr" | "rtl";
  } = $props();

  const stripCopies = [0, 1, 2];
  const speedPxPerMs = 42 / 1000;
  const priorityCopy = 1;

  let container: HTMLElement;
  let track: HTMLElement;
  let dragging = $state(false);
  let hoverPaused = false;
  let visible = true;
  let pageVisible = true;
  let unitWidth = 0;
  let position = 0;
  let dragStartX = 0;
  let dragStartPosition = 0;
  let dragActiveItems: HTMLElement[] = [];
  let initialized = false;

  const wrapPosition = (next: number) => {
    if (unitWidth <= 0) return 0;
    let wrapped = next % unitWidth;
    if (wrapped < 0) wrapped += unitWidth;
    return wrapped;
  };

  function measureUnitWidth() {
    const first = track?.querySelector<HTMLElement>('[data-branchmasters-copy="0"][data-branchmasters-index="0"]');
    const second = track?.querySelector<HTMLElement>('[data-branchmasters-copy="1"][data-branchmasters-index="0"]');
    if (!first || !second) return;

    unitWidth = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    if (!initialized && unitWidth > 0) {
      initialized = true;
    } else {
      position = wrapPosition(position);
    }
    applyPosition();
  }

  function applyPosition() {
    if (!track) return;
    const dpr = window.devicePixelRatio || 1;
    const snapped = Math.round(position * dpr) / dpr;
    track.style.transform = `translate3d(${-(unitWidth + snapped)}px, 0, 0)`;
  }

  function startedOnInteractiveTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest("a,button,input,select,textarea,label,[data-no-drag]") !== null
    );
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || startedOnInteractiveTarget(event.target)) return;
    measureUnitWidth();
    if (unitWidth <= 0) return;

    event.preventDefault();
    const activeItem = event.target instanceof Element
      ? event.target.closest<HTMLElement>(".seq-branchmasters-item")
      : null;
    setDragActiveItems(activeItem);
    dragging = true;
    dragStartX = event.clientX;
    dragStartPosition = position;
    container.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragging) return;
    event.preventDefault();
    position = wrapPosition(dragStartPosition - (event.clientX - dragStartX));
    applyPosition();
  }

  function handlePointerEnd(event: PointerEvent) {
    dragging = false;
    hoverPaused = container?.matches(":hover") ?? false;
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
    clearDragActiveItems();
  }

  function setDragActiveItems(activeItem: HTMLElement | null) {
    clearDragActiveItems();
    const index = activeItem?.dataset.branchmastersIndex;
    if (index === undefined) return;

    dragActiveItems = Array.from(
      track.querySelectorAll<HTMLElement>(`.seq-branchmasters-item[data-branchmasters-index="${index}"]`),
    );
    for (const item of dragActiveItems) item.classList.add("seq-branchmasters-item--drag-active");
  }

  function clearDragActiveItems() {
    for (const item of dragActiveItems) item.classList.remove("seq-branchmasters-item--drag-active");
    dragActiveItems = [];
  }

  $effect(() => {
    const count = officers.length;
    if (count === 0 || !track) return;
    tick().then(measureUnitWidth);
  });

  onMount(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let lastTime = 0;
    let observer: IntersectionObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const velocity = direction === "ltr" ? speedPxPerMs : -speedPxPerMs;

    const tick = (time: number) => {
      if (!lastTime) lastTime = time;
      const delta = Math.min(time - lastTime, 64);
      lastTime = time;

      if (!dragging && !hoverPaused && visible && pageVisible && unitWidth > 0) {
        position = wrapPosition(position + delta * velocity);
        applyPosition();
      }

      raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      lastTime = 0;
      measureUnitWidth();
    };

    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      lastTime = 0;
    };

    measureUnitWidth();
    requestAnimationFrame(measureUnitWidth);
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => measureUnitWidth());
      resizeObserver.observe(container);
      const firstItem = track?.querySelector<HTMLElement>(".seq-branchmasters-item");
      if (firstItem) resizeObserver.observe(firstItem);
    }

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        lastTime = 0;
      }, { threshold: 0.04 });
      observer.observe(container);
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!reducedMotion) raf = requestAnimationFrame(tick);

    return () => {
      clearDragActiveItems();
      if (raf) cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={container}
  class="seq-branchmasters-strip"
  class:seq-branchmasters-strip--dragging={dragging}
  onpointerenter={() => hoverPaused = true}
  onpointerleave={() => hoverPaused = dragging}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerEnd}
  onpointercancel={handlePointerEnd}
  onlostpointercapture={() => {
    dragging = false;
    hoverPaused = container?.matches(":hover") ?? false;
    clearDragActiveItems();
  }}
>
  <div bind:this={track} class="seq-branchmasters-track">
    {#each stripCopies as copy}
      {#each officers as officer, index (`${copy}-${index}-${officer.username}`)}
        <div
          class="seq-branchmasters-item"
          data-branchmasters-copy={copy}
          data-branchmasters-index={index}
          aria-hidden={copy !== priorityCopy}
        >
          <OfficerCard
            username={officer.username}
            rank={officer.rank}
            rankColor={officer.rankColor}
            online={officer.online}
            avatarUrl={officer.avatarUrl}
            avatarLoading="eager"
            stats={officer.stats}
          />
        </div>
      {/each}
    {/each}
  </div>
</div>
