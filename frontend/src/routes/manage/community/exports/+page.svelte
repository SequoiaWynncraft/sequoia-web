<script lang="ts">
  import AreaGate from "#lib/manage/AreaGate.svelte";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";
  import Button from "#lib/design-system/components/Button.svelte";
  import SectionLabel from "#lib/design-system/components/SectionLabel.svelte";
  import Select from "#lib/design-system/components/forms/Select.svelte";
  import Toggle from "#lib/design-system/components/forms/Toggle.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Stats exports - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <ManageHeader
    area="Community"
    title="Stats exports"
    lead="Download guild data as CSV. Ranges before the tracking start undercount."
  />

  {#if data.access !== "granted"}
    <AreaGate area="community" access={data.access} returnTo="/manage/community/exports" />
  {:else if data.datasets}
    {#each data.datasets as dataset (dataset.id)}
      <section class="export-section">
        <SectionLabel>
          {#snippet children()}{dataset.label}{/snippet}
        </SectionLabel>
        <p class="export-lead">{dataset.description}</p>
        <form method="GET" action={`/manage/community/exports/${dataset.id}`} class="export-form">
          {#if dataset.filters.dateRange}
            <label class="export-field">
              <span class="seq-field-label">From</span>
              <input class="seq-input" type="date" name="from" required value={data.defaultFrom} />
            </label>
            <label class="export-field">
              <span class="seq-field-label">To</span>
              <input class="seq-input" type="date" name="to" required value={data.defaultTo} />
            </label>
          {/if}
          {#if dataset.filters.raid && data.raids}
            <label class="export-field">
              <span class="seq-field-label">Raid</span>
              <Select name="raid">
                <option value="">All raids</option>
                {#each data.raids as raid (raid.key)}
                  <option value={raid.key}>{raid.short}</option>
                {/each}
              </Select>
            </label>
          {/if}
          {#if dataset.filters.rosterOnly}
            <Toggle name="rosterOnly" value="1" label="Current members only" />
          {/if}
          <Button type="submit" variant="secondary" size="sm">Download CSV</Button>
        </form>
      </section>
    {/each}
  {/if}
</div>

<style>
  .export-section {
    margin-bottom: 2.5rem;
  }

  .export-lead {
    margin: 0.5rem 0 1rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .export-form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 1rem;
  }

  .export-field {
    display: grid;
    gap: 0.35rem;
  }
</style>
