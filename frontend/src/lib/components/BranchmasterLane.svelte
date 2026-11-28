<script lang="ts">
  import { onMount } from "svelte";
  import BranchmasterCard, { type BranchmasterCardData } from "./BranchmasterCard.svelte";

  let {
    members,
    direction,
    label,
  }: {
    members: readonly BranchmasterCardData[];
    direction: "left" | "right";
    label: string;
  } = $props();

  /** Cards drift this fast, in CSS pixels a second. */
  const SPEED = 42;

  let lane: HTMLElement;
  let track: HTMLElement;
  /** Width of one full set of cards, gap included; the animation moves exactly this far. */
  let unit = $state(0);
  /**
   * Enough sets that the lane never shows an empty edge. The first is the real one;
   * the rest are hidden from screen readers but stay hoverable and draggable.
   */
  let copies = $state(2);
  let offscreen = $state(false);
  let dragging = $state(false);
  /** Where the animation resumes after a drag, as a negative delay in seconds. */
  let resumeAt = $state(0);
  const duration = $derived(unit / SPEED);

  let dragX = 0;
  let dragFrom = 0;
  let offset = 0;
  let held: HTMLElement[] = [];
  let reducedMotion = false;

  function measure() {
    const set = track.firstElementChild as HTMLElement | null;
    if (!set) return;
    unit = set.offsetWidth;
    if (unit > 0) copies = Math.max(2, Math.ceil(lane.clientWidth / unit) + 1);
  }

  const wrap = (value: number) => ((value % unit) + unit) % unit;

  function currentOffset(): number {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    return wrap(-matrix.m41);
  }

  function place() {
    track.style.transform = `translate3d(${-offset}px,0,0)`;
  }

  function onpointerdown(event: PointerEvent) {
    if (event.button !== 0 || unit <= 0 || reducedMotion) return;
    event.preventDefault();
    offset = currentOffset();
    dragX = event.clientX;
    dragFrom = offset;
    dragging = true;
    place();
    lane.setPointerCapture(event.pointerId);
    const item = (event.target as Element).closest<HTMLElement>("[data-card]");
    if (item) {
      held = [...track.querySelectorAll<HTMLElement>(`[data-card="${CSS.escape(item.dataset.card ?? "")}"]`)];
      for (const card of held) card.classList.add("held");
    }
  }

  function onpointermove(event: PointerEvent) {
    if (!dragging) return;
    offset = wrap(dragFrom - (event.clientX - dragX));
    place();
  }

  function release() {
    if (!dragging) return;
    dragging = false;
    for (const card of held) card.classList.remove("held");
    held = [];
    // Hand the position back to the animation: a negative delay starts it part way.
    const progress = offset / unit;
    resumeAt = -(direction === "left" ? progress : 1 - progress) * duration;
    track.style.transform = "";
  }

  onMount(() => {
    reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(lane);
    resize.observe(track.firstElementChild as Element);
    const seen = new IntersectionObserver(([entry]) => (offscreen = !entry.isIntersecting));
    seen.observe(lane);
    return () => {
      resize.disconnect();
      seen.disconnect();
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  bind:this={lane}
  class="lane"
  class:moving={unit > 0}
  class:paused={offscreen}
  class:dragging
  aria-label={label}
  style:--unit="{unit}px"
  style:--duration="{duration}s"
  style:--resume="{resumeAt}s"
  data-direction={direction}
  {onpointerdown}
  {onpointermove}
  onpointerup={release}
  onpointercancel={release}
  onlostpointercapture={release}
>
  <div bind:this={track} class="track">
    {#each { length: copies }, copy (copy)}
      <ul class="set" aria-hidden={copy > 0 ? "true" : undefined}>
        {#each members as member (member.username)}
          <li data-card={member.username}><BranchmasterCard {member} /></li>
        {/each}
      </ul>
    {/each}
  </div>
</section>

<style>
  .lane {
    --gap: 1.65rem;
    position: relative;
    overflow: hidden;
    cursor: grab;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent);
  }

  .dragging {
    cursor: grabbing;
  }

  .track {
    display: flex;
    width: max-content;
  }

  .moving .track {
    animation: drift var(--duration) linear var(--resume) infinite;
  }

  .moving[data-direction="right"] .track {
    animation-direction: reverse;
  }

  .paused .track,
  .dragging .track {
    animation-play-state: paused;
  }

  .dragging .track {
    animation: none;
  }

  @media (hover: hover) {
    .lane:hover .track {
      animation-play-state: paused;
    }
  }

  @keyframes drift {
    to {
      transform: translate3d(calc(-1 * var(--unit)), 0, 0);
    }
  }

  .set {
    display: flex;
    gap: var(--gap);
    margin: 0;
    padding: 0 var(--gap) 0 0;
    list-style: none;
  }

  li {
    flex: 0 0 clamp(15.25rem, 13.5vw, 17.25rem);
  }

  @media (max-width: 720px) {
    .lane {
      --gap: 0.85rem;
    }
    li {
      flex-basis: clamp(11.5rem, 60vw, 13.75rem);
    }
  }

  /* No drift: one set the reader scrolls by hand. */
  @media (prefers-reduced-motion: reduce) {
    .lane {
      overflow-x: auto;
      touch-action: auto;
      cursor: auto;
      mask-image: none;
      scroll-snap-type: x proximity;
    }
    .moving .track {
      animation: none;
    }
    .set:not(:first-child) {
      display: none;
    }
    li {
      scroll-snap-align: start;
    }
  }
</style>
