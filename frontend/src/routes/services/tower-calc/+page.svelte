<script lang="ts">
  import PageScaffold from "#lib/components/PageScaffold.svelte";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import Card from "#lib/design-system/components/Card.svelte";
  import SectionLabel from "#lib/design-system/components/SectionLabel.svelte";
  import { pageView } from "#lib/site/nav.js";
  import {
    ATTACK_RATES,
    AURA_LABELS,
    CONNECTION_BONUS,
    DAMAGES,
    DEFENSES,
    HEALTHS,
    HQ_EXTERNAL_BASE,
    HQ_EXTERNAL_BONUS,
    MAX_AURA_LEVEL,
    MAX_STAT_LEVEL,
    VOLLEY_LABELS,
    calcDefenseIndex,
    calcDpsRange,
    calcEhp,
    calcStat,
    defenseRating,
    formatStat,
  } from "#lib/site/tower.js";
  import StatRow from "./StatRow.svelte";

  const view = pageView("/services/tower-calc");

  const MAX_CONNECTIONS = 20;
  const MAX_EXTERNALS = 50;

  let damageLvl = $state(0);
  let attackLvl = $state(0);
  let healthLvl = $state(0);
  let defenseLvl = $state(0);
  let auraLvl = $state(0);
  let volleyLvl = $state(0);
  let isHq = $state(false);
  let connections = $state(0);
  let externalsBase = $state(0);

  const externals = $derived(Math.min(Math.max(externalsBase + connections, 0), MAX_EXTERNALS));

  interface LevelSnapshot {
    damageLvl: number;
    attackLvl: number;
    healthLvl: number;
    defenseLvl: number;
  }

  let presetSnapshot = $state<LevelSnapshot | null>(null);

  function toggleMaxPreset() {
    if (presetSnapshot) {
      ({ damageLvl, attackLvl, healthLvl, defenseLvl } = presetSnapshot);
      presetSnapshot = null;
      return;
    }

    presetSnapshot = { damageLvl, attackLvl, healthLvl, defenseLvl };
    damageLvl = MAX_STAT_LEVEL;
    attackLvl = MAX_STAT_LEVEL;
    healthLvl = MAX_STAT_LEVEL;
    defenseLvl = MAX_STAT_LEVEL;
  }

  const setPresetStat = (assign: (next: number) => void) => (next: number) => {
    assign(next);
    presetSnapshot = null;
  };

  const setDamageLvl = setPresetStat((next) => (damageLvl = next));
  const setAttackLvl = setPresetStat((next) => (attackLvl = next));
  const setHealthLvl = setPresetStat((next) => (healthLvl = next));
  const setDefenseLvl = setPresetStat((next) => (defenseLvl = next));

  const setExternals = (next: number) => (externalsBase = next - connections);

  function resetAll() {
    damageLvl = 0;
    attackLvl = 0;
    healthLvl = 0;
    defenseLvl = 0;
    auraLvl = 0;
    volleyLvl = 0;
    isHq = false;
    connections = 0;
    externalsBase = 0;
    presetSnapshot = null;
  }

  const statMultiplier = $derived(calcStat(1, isHq, connections, externals));
  const damageDetail = $derived.by(() => {
    const [lo, hi] = DAMAGES[damageLvl];
    return `${formatStat(lo * statMultiplier)}-${formatStat(hi * statMultiplier)}`;
  });
  const attackDetail = $derived(`${ATTACK_RATES[attackLvl].toFixed(2)}x`);
  const healthDetail = $derived(formatStat(calcStat(HEALTHS[healthLvl], isHq, connections, externals)));
  const defenseDetail = $derived(`${DEFENSES[defenseLvl]}%`);

  const dpsRange = $derived(calcDpsRange(damageLvl, attackLvl, isHq, connections, externals));
  const ehp = $derived(calcEhp(healthLvl, defenseLvl, isHq, connections, externals));
  const defenseIndex = $derived(
    calcDefenseIndex(
      damageLvl,
      attackLvl,
      healthLvl,
      defenseLvl,
      auraLvl,
      volleyLvl,
      isHq,
      connections,
      externals,
    ),
  );
  const rating = $derived(defenseRating(defenseIndex));
</script>

<PageScaffold crumbs={view.crumbs} tabs={view.tabs} width="lg">
  {#snippet children()}
    <PageHeader kicker={view.kicker} title={view.title} lead={view.lead} />

    <div class="tc-grid">
      <Card hoverEffect={false}>
        {#snippet children()}
          <SectionLabel>Tower</SectionLabel>

          <StatRow
            label="Damage"
            level={damageLvl}
            max={MAX_STAT_LEVEL}
            detail={damageDetail}
            onchange={setDamageLvl}
          />
          <StatRow
            label="Attack"
            level={attackLvl}
            max={MAX_STAT_LEVEL}
            detail={attackDetail}
            onchange={setAttackLvl}
          />
          <StatRow
            label="Health"
            level={healthLvl}
            max={MAX_STAT_LEVEL}
            detail={healthDetail}
            onchange={setHealthLvl}
          />
          <StatRow
            label="Defence"
            level={defenseLvl}
            max={MAX_STAT_LEVEL}
            detail={defenseDetail}
            onchange={setDefenseLvl}
          />
          <StatRow
            label="Aura"
            bind:level={auraLvl}
            max={MAX_AURA_LEVEL}
            detail={AURA_LABELS[auraLvl]}
          />
          <StatRow
            label="Volley"
            bind:level={volleyLvl}
            max={MAX_AURA_LEVEL}
            detail={VOLLEY_LABELS[volleyLvl]}
          />

          <div class="tc-toggles">
            <button
              type="button"
              class="tc-toggle"
              class:tc-toggle-on={isHq}
              aria-pressed={isHq}
              onclick={() => (isHq = !isHq)}>HQ</button
            >
            <button
              type="button"
              class="tc-toggle"
              class:tc-toggle-on={presetSnapshot !== null}
              aria-pressed={presetSnapshot !== null}
              title="Set damage, attack, health and defence to 11"
              onclick={toggleMaxPreset}>11x4</button
            >
            <button type="button" class="tc-toggle" onclick={resetAll}>Reset</button>
          </div>
        {/snippet}
      </Card>

      <div class="tc-side">
        <Card hoverEffect={false}>
          {#snippet children()}
            <SectionLabel meta={isHq ? "HQ" : "Non-HQ"}>Network</SectionLabel>

            <StatRow
              label="Conn"
              bind:level={connections}
              max={MAX_CONNECTIONS}
              detail="+{(connections * CONNECTION_BONUS * 100).toFixed(0)}%"
            />
            <StatRow
              label="Ext"
              level={externals}
              max={MAX_EXTERNALS}
              detail={isHq
                ? `x${(HQ_EXTERNAL_BASE + externals * HQ_EXTERNAL_BONUS).toFixed(2)}`
                : "HQ only"}
              onchange={setExternals}
            />
            <p class="tc-note">
              Connections are allied territories directly bordering this one. Externals are
              allied territories within three hops, and only count while the tower is an HQ.
            </p>
          {/snippet}
        </Card>

        <Card hoverEffect={false}>
          {#snippet children()}
            <SectionLabel>Result</SectionLabel>

            <div class="tc-result">
              <span class="tc-result-label">DPS</span>
              <span class="tc-result-value tc-gold">
                {formatStat(dpsRange[0])}-{formatStat(dpsRange[1])}
              </span>
            </div>
            <div class="tc-result">
              <span class="tc-result-label">EHP</span>
              <span class="tc-result-value tc-emerald">{formatStat(ehp)}</span>
            </div>
            <div class="tc-result">
              <span class="tc-result-label">Rating</span>
              <span class="tc-result-value" style="color: {rating.color}">
                {rating.label} ({defenseIndex})
              </span>
            </div>
          {/snippet}
        </Card>
      </div>
    </div>
  {/snippet}
</PageScaffold>

<style>
  .tc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
    gap: 1.25rem;
    margin-bottom: 3rem;
  }

  .tc-side {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .tc-toggles {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .tc-toggle {
    flex: 1;
    min-height: 2.75rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition:
      border-color var(--dur-fast) ease,
      color var(--dur-fast) ease,
      background var(--dur-fast) ease;
  }

  .tc-toggle:hover {
    border-color: var(--color-gold);
    color: var(--color-gold);
  }

  .tc-toggle-on {
    border-color: var(--color-gold);
    background: color-mix(in srgb, var(--color-gold) 8%, transparent);
    color: var(--color-gold);
  }

  .tc-note {
    margin: 1rem 0 0;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    line-height: var(--leading-normal, 1.6);
  }

  .tc-result {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .tc-result + .tc-result {
    border-top: 1px solid var(--color-border-subtle);
  }

  .tc-result-label {
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .tc-result-value {
    font-family: var(--font-data);
    font-size: var(--text-xl);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    text-align: right;
  }

  .tc-gold {
    color: var(--color-gold);
  }

  .tc-emerald {
    color: var(--color-emerald);
  }
</style>
