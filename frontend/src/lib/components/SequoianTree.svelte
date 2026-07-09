<script lang="ts">
  const TREE_IMAGE = "/assets/images/nol_chibi_rush_all.avif";
  const STRIPS = Array.from({ length: 6 }, (_, index) => index);
</script>

<section class="seq-chibi-section" aria-labelledby="sequoian-tree-title">
  <div class="seq-chibi-divider divider-gold"></div>
  <p id="sequoian-tree-title" class="seq-chibi-kicker">The Sequoian Tree</p>
  <div class="seq-chibi-parade" aria-label="The Sequoian Tree guild art">
    <div class="seq-chibi-track">
      {#each STRIPS as strip (strip)}
        <img
          src={TREE_IMAGE}
          alt=""
          aria-hidden="true"
          class="seq-chibi-strip"
          draggable="false"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
        />
      {/each}
    </div>
  </div>
  <div class="seq-chibi-divider divider-gold"></div>
</section>
