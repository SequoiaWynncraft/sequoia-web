<script lang="ts">
  import PlayerName from "$lib/design-system/components/PlayerName.svelte";
  import type { StageRoll } from "$lib/events/stageProtocol";
  import { nmsrFace } from "$lib/site/nmsr";

  import { finalRotationDeg, point, wedgeAtPointer, wedgePath, wheelWedges } from "./wheelMath";

  let { roll, clockOffset }: { roll: StageRoll; clockOffset: number | null } = $props();

  const SIZE = 640;
  const CENTER = SIZE / 2;
  const RADIUS = CENTER - 12;
  const HEAD_RADIUS = RADIUS * 0.84;
  const LABEL_RADIUS = RADIUS * 0.55;
  /** Hairlines on slim wedges melt into a solid fan - draw none below this. */
  const STROKE_MIN_DEG = 2.5;
  /** Names only where an arc can actually hold one; heads carry the rest. */
  const LABEL_MIN_DEG = 14;

  const wedges = $derived(wheelWedges(roll.entrants));
  const rotation = $derived(finalRotationDeg(wedges, roll.winnerIndex, roll.spin.turns));

  // Heads shrink as the rim crowds; ticket-proportional spacing means cheap
  // slots shingle slightly, which reads like a stack rather than a fault.
  const headSize = $derived(
    Math.max(
      13,
      Math.min(26, ((2 * Math.PI * HEAD_RADIUS) / Math.max(1, roll.entrants.length)) * 0.72),
    ),
  );

  let wheel: SVGGElement | undefined = $state();
  let landed = $state(false);
  /** Wedge currently under the pointer - the hub's live ticker. */
  let liveIndex = $state(-1);

  function setStatic(element: SVGGElement, deg: number) {
    element.style.transform = `rotate(${deg}deg)`;
    // Heads stay upright: each counter-rotates about its own center.
    for (const head of element.querySelectorAll<SVGGElement>(".wheel-head")) {
      head.style.transform = `rotate(${-deg}deg)`;
    }
  }

  // One rotation to the precomputed landing. The feed converts the server's
  // epochs to this viewer's clock, so skew cannot start or finish the reveal
  // early. Reduced-motion viewers hold a neutral wheel, then land discretely.
  $effect(() => {
    const element = wheel;
    if (!element) return;
    const finalDeg = rotation % 360;
    if (clockOffset === null) {
      setStatic(element, roll.state === "settled" ? finalDeg : 0);
      landed = roll.state === "settled";
      return;
    }

    const localNow = Date.now();
    const elapsed = Math.max(0, localNow - clockOffset - roll.startedAt);
    const settleDelay = Math.max(0, roll.settlesAt + clockOffset - localNow);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (settleDelay === 0) {
      setStatic(element, finalDeg);
      landed = true;
      return;
    }

    landed = false;
    let frame = 0;
    const settleTimer = setTimeout(() => {
      setStatic(element, finalDeg);
      landed = true;
      cancelAnimationFrame(frame);
    }, settleDelay);
    if (reduced) {
      setStatic(element, 0);
      return () => clearTimeout(settleTimer);
    }
    if (elapsed >= roll.spin.durationMs) {
      setStatic(element, finalDeg);
      return () => clearTimeout(settleTimer);
    }
    const timing = {
      duration: roll.spin.durationMs,
      delay: -elapsed,
      easing: "cubic-bezier(0.12, 0.8, 0.2, 1)",
      fill: "forwards" as const,
    };
    const animations = [
      element.animate(
        [{ transform: "rotate(0deg)" }, { transform: `rotate(${rotation}deg)` }],
        timing,
      ),
      ...[...element.querySelectorAll<SVGGElement>(".wheel-head")].map((head) =>
        head.animate(
          [{ transform: "rotate(0deg)" }, { transform: `rotate(${-rotation}deg)` }],
          timing,
        ),
      ),
    ];

    // The hub ticker reads the disc's actual rendered angle each frame, so
    // it can never drift from what the viewer sees. It lives exactly as long
    // as the spin: once landed, the hub shows the winner and polling a
    // static page would only burn battery.
    const tick = () => {
      if (landed) return;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      const deg = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
      liveIndex = wedgeAtPointer(wedges, deg);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      clearTimeout(settleTimer);
      for (const animation of animations) animation.cancel();
      cancelAnimationFrame(frame);
    };
  });

  const showWinner = $derived(landed);
  const hubEntrant = $derived(showWinner ? roll.winner : (roll.entrants[liveIndex] ?? null));
</script>

<div class="wheel">
  <div class="wheel-frame">
    <svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="Raffle wheel">
      <g bind:this={wheel} class="wheel-disc" style="transform-origin: {CENTER}px {CENTER}px">
        {#each roll.entrants as entrant, index (entrant.player_uuid)}
          {@const wedge = wedges[index]}
          {@const span = wedge.endDeg - wedge.startDeg}
          <path
            d={wedgePath(CENTER, CENTER, RADIUS, wedge.startDeg, wedge.endDeg)}
            class="wheel-wedge"
            class:wheel-wedge-alt={index % 2 === 1}
            class:wheel-wedge-quiet={span < STROKE_MIN_DEG}
            class:wheel-wedge-winner={showWinner && index === roll.winnerIndex}
          />
          {#if span >= LABEL_MIN_DEG}
            {@const anchor = point(CENTER, CENTER, LABEL_RADIUS, wedge.midDeg)}
            <text
              x={anchor.x}
              y={anchor.y}
              class="wheel-label"
              transform="rotate({wedge.midDeg - 90} {anchor.x} {anchor.y})"
            >
              {entrant.username}
            </text>
          {/if}
        {/each}
        {#each roll.entrants as entrant, index (entrant.player_uuid)}
          {@const anchor = point(CENTER, CENTER, HEAD_RADIUS, wedges[index].midDeg)}
          <g
            class="wheel-head"
            class:wheel-head-winner={showWinner && index === roll.winnerIndex}
            style="transform-origin: {anchor.x}px {anchor.y}px"
          >
            <image
              href={nmsrFace(entrant.player_uuid, 32)}
              x={anchor.x - headSize / 2}
              y={anchor.y - headSize / 2}
              width={headSize}
              height={headSize}
            />
          </g>
        {/each}
      </g>
      <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.21} class="wheel-hub" />
      <path
        d="M {CENTER - 14} 4 L {CENTER + 14} 4 L {CENTER} 34 Z"
        class="wheel-pointer"
        aria-hidden="true"
      />
    </svg>

    <!-- Live hub: whoever is passing the pointer, then the winner. -->
    <div class="wheel-center" aria-hidden="true">
      {#if hubEntrant}
        <img
          class="wheel-center-face"
          class:wheel-center-face-won={showWinner}
          src={nmsrFace(hubEntrant.player_uuid, 64)}
          alt=""
        />
        <span class="wheel-center-name">{hubEntrant.username}</span>
      {:else}
        <span class="wheel-center-name wheel-center-waiting">Rolling…</span>
      {/if}
    </div>

    {#if showWinner}
      <!-- One-shot landing moment: an expanding gold ring and a scatter of
           sparks. Plays once, settles still - never loops, never pulses. -->
      <div class="wheel-burst" aria-hidden="true">
        <span class="wheel-burst-ring"></span>
        {#each Array.from({ length: 10 }, (_unused, spark) => spark) as spark (spark)}
          <span
            class="wheel-burst-spark"
            style="--spark-angle: {spark * 36}deg; --spark-delay: {spark % 3}">✦</span
          >
        {/each}
      </div>
    {/if}
  </div>

  <div class="wheel-under" aria-live="polite">
    {#if showWinner}
      <span class="wheel-winner">
        <span class="wheel-winner-spark" aria-hidden="true">✦</span>
        <PlayerName username={roll.winner.username} uuid={roll.winner.player_uuid} size={26} />
      </span>
      <span class="wheel-winner-meta">
        wins {roll.prize || "the prize"} · {roll.winner.tickets}
        {roll.winner.tickets === 1 ? "ticket" : "tickets"}
      </span>
    {:else}
      <span class="wheel-rolling">Rolling…</span>
    {/if}
  </div>
</div>

<style>
  .wheel {
    display: grid;
    justify-items: center;
    gap: 18px;
  }

  .wheel-frame {
    position: relative;
  }

  svg {
    width: min(640px, 82vw, 66vh);
    height: auto;
  }

  .wheel-disc {
    will-change: transform;
  }

  .wheel-wedge {
    fill: color-mix(in srgb, var(--ev-sky-1, #251b38) 72%, #000000);
    stroke: color-mix(in srgb, var(--color-gold) 26%, transparent);
    stroke-width: 1;
  }

  .wheel-wedge-alt {
    fill: color-mix(in srgb, var(--ev-sky-0, #171120) 82%, #000000);
  }

  /* Slim wedges keep their fill contrast but drop the hairline - a hundred
     strokes over a few degrees each reads as a solid fan, not a wheel. */
  .wheel-wedge-quiet {
    stroke: none;
  }

  .wheel-wedge-winner {
    fill: color-mix(in srgb, var(--color-gold) 30%, var(--ev-sky-1, #251b38));
    stroke: var(--color-gold);
    stroke-width: 2;
  }

  .wheel-label {
    fill: var(--text-body);
    font-family: var(--font-display);
    font-size: 14px;
    letter-spacing: 0.04em;
    dominant-baseline: middle;
    text-anchor: middle;
    pointer-events: none;
    user-select: none;
  }

  .wheel-head {
    will-change: transform;
  }

  .wheel-head image {
    image-rendering: pixelated;
  }

  .wheel-head-winner image {
    outline: 2px solid var(--color-gold);
    outline-offset: 1px;
  }

  .wheel-hub {
    fill: color-mix(in srgb, var(--color-abyss) 92%, transparent);
    stroke: var(--color-gold);
    stroke-width: 1.5;
  }

  .wheel-pointer {
    fill: var(--color-gold);
  }

  .wheel-center {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    gap: 6px;
    justify-items: center;
    width: 26%;
    text-align: center;
    pointer-events: none;
    translate: -50% -50%;
  }

  .wheel-center-face {
    width: clamp(36px, 34%, 56px);
    aspect-ratio: 1;
    image-rendering: pixelated;
  }

  .wheel-center-face-won {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .wheel-center-name {
    overflow: hidden;
    max-width: 100%;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wheel-center-waiting {
    color: var(--text-muted);
  }

  /* ── The landing moment: one shot, then stillness ── */

  .wheel-burst {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .wheel-burst-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120px;
    height: 120px;
    border: 1px solid var(--color-gold);
    border-radius: 50%;
    opacity: 0;
    translate: -50% -50%;
    animation: wheel-ring 900ms ease-out forwards;
  }

  .wheel-burst-spark {
    position: absolute;
    color: var(--color-gold);
    font-size: 14px;
    opacity: 0;
    rotate: var(--spark-angle);
    animation: wheel-spark 800ms ease-out forwards;
    animation-delay: calc(var(--spark-delay) * 70ms);
  }

  @keyframes wheel-ring {
    from {
      opacity: 0.9;
      scale: 0.35;
    }

    to {
      opacity: 0;
      scale: 2.1;
    }
  }

  @keyframes wheel-spark {
    0% {
      opacity: 0;
      transform: translateY(-40px);
    }

    25% {
      opacity: 1;
    }

    100% {
      opacity: 0;
      transform: translateY(-150px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wheel-burst {
      display: none;
    }
  }

  .wheel-under {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-height: 64px;
    text-align: center;
  }

  .wheel-winner {
    display: inline-flex;
    gap: 12px;
    align-items: center;
    padding: 8px 22px;
    border: 1px solid var(--color-gold);
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .wheel-winner-spark {
    margin-right: 10px;
    color: var(--color-gold);
  }

  .wheel-winner-meta,
  .wheel-rolling {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-sm);
  }
</style>
