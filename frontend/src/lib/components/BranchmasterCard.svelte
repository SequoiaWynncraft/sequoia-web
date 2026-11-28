<script lang="ts" module>
  export type BranchmasterCardData = {
    username: string;
    rank: string;
    rankColor: string | null;
    online: boolean;
    avatarUrl: string;
    stats: ReadonlyArray<readonly [label: string, value: string]>;
  };
</script>

<script lang="ts">
  let { member }: { member: BranchmasterCardData } = $props();

  let avatarFailed = $state(false);
  const color = $derived(
    member.rankColor && /^#[0-9a-f]{6}$/i.test(member.rankColor) ? member.rankColor : null,
  );
</script>

<article class="card" style:--rank={color}>
  <div class="face">
    {#if member.online}
      <span class="online" title="Online now"><span class="seq-visually-hidden">Online now</span></span>
    {/if}
    <div class="lift">
    <div class="figure">
      {#if !avatarFailed}
        <img
          src={member.avatarUrl}
          alt=""
          width="128"
          height="128"
          loading="lazy"
          decoding="async"
          draggable="false"
          onerror={() => (avatarFailed = true)}
        />
      {:else}
        <span class="initial" aria-hidden="true">{member.username.charAt(0).toUpperCase()}</span>
      {/if}
    </div>
    <h3 class="name">{member.username}</h3>
    <p class="rank">{member.rank}</p>
    </div>
  </div>
  <dl class="stats">
    {#each member.stats as [label, value] (label)}
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    {/each}
  </dl>
</article>

<style>
  /* Stepped corners, like Minecraft's own panels. --step is one pixel step. */
  .card {
    --rank: var(--color-gold);
    --step: 3px;
    --notch: polygon(
      0 calc(var(--step) * 2), var(--step) calc(var(--step) * 2), var(--step) var(--step),
      calc(var(--step) * 2) var(--step), calc(var(--step) * 2) 0,
      calc(100% - var(--step) * 2) 0, calc(100% - var(--step) * 2) var(--step),
      calc(100% - var(--step)) var(--step), calc(100% - var(--step)) calc(var(--step) * 2),
      100% calc(var(--step) * 2),
      100% calc(100% - var(--step) * 2), calc(100% - var(--step)) calc(100% - var(--step) * 2),
      calc(100% - var(--step)) calc(100% - var(--step)), calc(100% - var(--step) * 2) calc(100% - var(--step)),
      calc(100% - var(--step) * 2) 100%,
      calc(var(--step) * 2) 100%, calc(var(--step) * 2) calc(100% - var(--step)),
      var(--step) calc(100% - var(--step)), var(--step) calc(100% - var(--step) * 2),
      0 calc(100% - var(--step) * 2)
    );
    position: relative;
    height: 15.25rem;
    padding: 2px;
    clip-path: var(--notch);
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--rank) 34%, var(--color-border-subtle)),
      color-mix(in srgb, var(--rank) 10%, var(--color-border-subtle))
    );
    contain: layout paint style;
  }

  .face {
    position: absolute;
    inset: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 1rem 1.6rem;
    clip-path: var(--notch);
    background: linear-gradient(to bottom, var(--color-surface), color-mix(in srgb, var(--color-surface) 55%, var(--color-abyss)));
  }

  .lift {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    transition: transform var(--dur-slow) var(--ease-out-soft);
  }

  .online {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 6px;
    height: 6px;
    background: var(--color-emerald);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--color-emerald) 40%, var(--color-abyss)),
      0 0 8px color-mix(in srgb, var(--color-emerald) 60%, transparent);
  }

  .figure {
    position: relative;
    display: grid;
    place-items: center;
    width: 5.7rem;
    height: 5.7rem;
  }

  /* A soft glow of the rank's colour from behind the head; it rises with the head. */
  .figure::before {
    content: "";
    position: absolute;
    inset: -2.6rem;
    background: radial-gradient(
      closest-side,
      color-mix(in srgb, var(--rank) 13%, transparent),
      color-mix(in srgb, var(--rank) 5%, transparent) 55%,
      transparent
    );
    pointer-events: none;
  }

  img {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
    user-select: none;
    -webkit-user-drag: none;
    transition: translate var(--dur-slow) var(--ease-out-soft);
  }

  .initial {
    position: relative;
    font-family: var(--font-display);
    font-size: 1.6rem;
    color: var(--color-text-secondary);
  }

  .name {
    margin: 1.05rem 0 0;
    max-width: 100%;
    font-family: var(--font-display);
    font-size: 1.02rem;
    font-weight: 400;
    letter-spacing: 0.03em;
    line-height: 1.2;
    color: var(--color-text-primary);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .rank {
    margin: 0.3rem 0 0;
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    color: color-mix(in srgb, var(--rank) 82%, var(--color-text-primary));
  }

  .stats {
    position: absolute;
    right: 1.2rem;
    bottom: 0.9rem;
    left: 1.2rem;
    display: grid;
    grid-template-columns: repeat(4, auto);
    justify-content: space-between;
    margin: 0;
    opacity: 0;
    translate: 0 0.35rem;
    transition:
      opacity var(--dur-base) ease,
      translate var(--dur-base) var(--ease-out-soft);
  }

  .stats div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
  }

  dt {
    font-size: 0.66rem;
    line-height: 1.1;
    color: var(--color-text-dim);
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.74rem;
    line-height: 1.1;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  /* Pointer hover, the card being dragged, or a tapped card shows its numbers. */
  @media (hover: hover) {
    .card:hover .lift {
      transform: translateY(-1.3rem);
    }
    .card:hover img {
      translate: 0 -0.2rem;
    }
    .card:hover .stats {
      opacity: 1;
      translate: 0 0;
    }
  }

  :global(:is(.held, .open)) > .card .lift {
    transform: translateY(-1.3rem);
  }

  :global(:is(.held, .open)) > .card .stats {
    opacity: 1;
    translate: 0 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .lift,
    img,
    .stats {
      transition: none;
    }
  }
</style>
