<script lang="ts">
  import type { StageRoll } from "$lib/events/stageProtocol";

  import { finalRotationDeg, point, wedgePath, wheelWedges } from "./wheelMath";

  let { roll, clockOffset }: { roll: StageRoll; clockOffset: number | null } = $props();

  const SIZE = 640;
  const CENTER = SIZE / 2;
  const RADIUS = CENTER - 12;
  const LABEL_RADIUS = RADIUS * 0.68;
  /** Wedges thinner than this carry no label; the entrant list names them. */
  const LABEL_MIN_DEG = 4;

  const wedges = $derived(wheelWedges(roll.entrants));
  const rotation = $derived(finalRotationDeg(wedges, roll.winnerIndex, roll.spin.turns));

  let wheel: SVGGElement | undefined = $state();
  let landed = $state(false);

  // One rotation to the precomputed landing. The feed converts the server's
  // epochs to this viewer's clock, so skew cannot start or finish the reveal
  // early. Reduced-motion viewers hold a neutral wheel, then land discretely.
  $effect(() => {
    const element = wheel;
    if (!element) return;
    const finalTransform = `rotate(${rotation % 360}deg)`;
    if (clockOffset === null) {
      element.style.transform = roll.state === "settled" ? finalTransform : "rotate(0deg)";
      landed = roll.state === "settled";
      return;
    }

    const localNow = Date.now();
    const elapsed = Math.max(0, localNow - clockOffset - roll.startedAt);
    const settleDelay = Math.max(0, roll.settlesAt + clockOffset - localNow);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (settleDelay === 0) {
      element.style.transform = finalTransform;
      landed = true;
      return;
    }

    landed = false;
    const settleTimer = setTimeout(() => {
      element.style.transform = finalTransform;
      landed = true;
    }, settleDelay);
    if (reduced) {
      element.style.transform = "rotate(0deg)";
      return () => clearTimeout(settleTimer);
    }
    if (elapsed >= roll.spin.durationMs) {
      element.style.transform = finalTransform;
      return () => clearTimeout(settleTimer);
    }
    const animation = element.animate(
      [{ transform: "rotate(0deg)" }, { transform: `rotate(${rotation}deg)` }],
      {
        duration: roll.spin.durationMs,
        delay: -elapsed,
        easing: "cubic-bezier(0.12, 0.8, 0.2, 1)",
        fill: "forwards",
      },
    );
    return () => {
      clearTimeout(settleTimer);
      animation.cancel();
    };
  });

  const showWinner = $derived(landed);
</script>

<div class="wheel">
  <svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="Raffle wheel">
    <g bind:this={wheel} class="wheel-disc" style="transform-origin: {CENTER}px {CENTER}px">
      {#each roll.entrants as entrant, index (entrant.player_uuid)}
        {@const wedge = wedges[index]}
        <path
          d={wedgePath(CENTER, CENTER, RADIUS, wedge.startDeg, wedge.endDeg)}
          class="wheel-wedge"
          class:wheel-wedge-alt={index % 2 === 1}
          class:wheel-wedge-winner={showWinner && index === roll.winnerIndex}
        />
        {#if wedge.endDeg - wedge.startDeg >= LABEL_MIN_DEG}
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
      <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.16} class="wheel-hub" />
    </g>
    <path
      d="M {CENTER - 14} 4 L {CENTER + 14} 4 L {CENTER} 34 Z"
      class="wheel-pointer"
      aria-hidden="true"
    />
  </svg>

  <div class="wheel-under" aria-live="polite">
    {#if showWinner}
      <span class="wheel-winner">
        <span class="wheel-winner-spark" aria-hidden="true">✦</span>
        {roll.winner.username}
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

  svg {
    width: min(640px, 82vw, 66vh);
    height: auto;
  }

  .wheel-disc {
    will-change: transform;
  }

  .wheel-wedge {
    fill: color-mix(in srgb, var(--ev-sky-1, #251b38) 72%, #000000);
    stroke: color-mix(in srgb, var(--color-gold) 40%, transparent);
    stroke-width: 1;
  }

  .wheel-wedge-alt {
    fill: color-mix(in srgb, var(--ev-sky-0, #171120) 82%, #000000);
  }

  .wheel-wedge-winner {
    fill: color-mix(in srgb, var(--color-gold) 30%, var(--ev-sky-1, #251b38));
    stroke: var(--color-gold);
    stroke-width: 2;
  }

  .wheel-label {
    fill: var(--text-body);
    font-family: var(--font-data);
    font-size: 15px;
    dominant-baseline: middle;
    text-anchor: middle;
    pointer-events: none;
    user-select: none;
  }

  .wheel-hub {
    fill: color-mix(in srgb, var(--color-abyss) 85%, transparent);
    stroke: var(--color-gold);
    stroke-width: 1.5;
  }

  .wheel-pointer {
    fill: var(--color-gold);
  }

  .wheel-under {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-height: 64px;
    text-align: center;
  }

  .wheel-winner {
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
