<script lang="ts">
  import { onMount } from "svelte";

  type Spark = { x: number; size: number; rise: number; start: number; twinkle: number };

  /** Added after hydration: decoration has no place in the first paint's bytes. */
  let sparks = $state<Spark[]>([]);
  let resting = $state(false);
  let field: HTMLElement;

  onMount(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    sparks = Array.from({ length: 36 }, () => {
      const rise = 17 + Math.random() * 66;
      return {
        x: Math.random() * 100,
        size: 0.8 + Math.random() * 3.2,
        rise,
        // A negative delay starts each spark part way up, so the field begins full.
        start: -Math.random() * rise,
        twinkle: -Math.random() * 3.2,
      };
    });
    const seen = new IntersectionObserver(([entry]) => (resting = !entry.isIntersecting));
    seen.observe(field);
    return () => seen.disconnect();
  });
</script>

<div bind:this={field} class="field" class:resting aria-hidden="true">
  {#each sparks as spark, index (index)}
    <span
      style:left="{spark.x}%"
      style:--size="{spark.size}px"
      style:--rise="{spark.rise}s"
      style:--start="{spark.start}s"
      style:--twinkle="{spark.twinkle}s"
    ></span>
  {/each}
</div>

<style>
  .field {
    position: absolute;
    inset: 0;
    z-index: 10;
    overflow: hidden;
    pointer-events: none;
    container-type: size;
  }

  /* Transform and opacity only, so the compositor runs them off the main thread. */
  span {
    position: absolute;
    top: 100%;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--color-gold);
    box-shadow: 0 0 6px var(--color-gold);
    opacity: 0;
    animation:
      rise var(--rise) linear var(--start) infinite,
      twinkle 1.6s ease-in-out var(--twinkle) infinite alternate;
  }

  .resting span {
    animation-play-state: paused;
  }

  @keyframes rise {
    to {
      transform: translateY(-104cqh);
    }
  }

  @keyframes twinkle {
    to {
      opacity: 0.8;
    }
  }
</style>
