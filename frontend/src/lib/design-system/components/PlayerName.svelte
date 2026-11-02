<script lang="ts">
  import { playercardUrl } from "#lib/site/identity.js";
  import { nmsrFace } from "#lib/site/nmsr.js";

  let {
    username,
    uuid = null,
    player = null,
    size = 22,
    link = true,
  }: {
    username: string;
    /** Prefer the uuid when known - faces and links survive renames. */
    uuid?: string | null;
    /** Canonical IGN when the display name differs from it (e.g. a donor
     * credited under a nickname) - drives the link and face fallback. */
    player?: string | null;
    /** Face size in px. */
    size?: number;
    link?: boolean;
  } = $props();
</script>

<!-- The standard member identity: pixel face + IGN, linked to the
     playercard. Font size inherits so tables, lists, and banners keep
     their own scale. -->
{#snippet inner()}
  <img
    class="pn-face"
    src={nmsrFace(uuid ?? player ?? username, size)}
    alt=""
    loading="lazy"
    width={size}
    height={size}
  />
  <span class="pn-name">{username}</span>
{/snippet}

{#if link}
  <!-- uuid-first like the face: the playercard resolves roster uuids, and a
       stored username may be stale after a rename. -->
  <a class="pn focus-ring" href={playercardUrl(player ?? uuid ?? username)}>{@render inner()}</a>
{:else}
  <span class="pn">{@render inner()}</span>
{/if}

<style>
  .pn {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
    color: var(--text-body);
    text-decoration: none;
  }

  a.pn:hover .pn-name,
  a.pn:focus-visible .pn-name {
    color: var(--accent-hover);
  }

  .pn-face {
    flex: 0 0 auto;
    image-rendering: pixelated;
  }

  .pn-name {
    overflow: hidden;
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
