<script lang="ts">
  import { getContext } from "svelte";

  import { GUILD_RANKS } from "$lib/api/guildStats";
  import ConfirmDialog from "$lib/design-system/components/forms/ConfirmDialog.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormSection from "$lib/design-system/components/forms/FormSection.svelte";
  import InstantField from "$lib/design-system/components/forms/InstantField.svelte";
  import Toggle from "$lib/design-system/components/forms/Toggle.svelte";

  import { EDITOR_KEY, EventDraft, RAFFLE_MAX_WINNERS, type ManualRow, type RaffleRow, type RuleType } from "../draft.svelte";
  import RafflePreview from "./RafflePreview.svelte";

  const draft = getContext<EventDraft>(EDITOR_KEY);

  const RULE_LABELS: Record<RuleType, string> = {
    guildRank: "Guild rank",
    seqRank: "Sequoia rank",
    stat: "Stat threshold",
    milestone: "Milestone",
  };

  const STAT_LABELS = { raids: "raids", playtime: "hours played", wars: "wars" } as const;

  // Manual picker drafts, keyed per raffle+list so typing stays local.
  let manualDrafts = $state<Record<string, string>>({});

  function manualKey(row: RaffleRow, list: "include" | "exclude") {
    return `${row.key}:${list}`;
  }

  /** Uuid identity tolerates spelling (case, hyphens): a stored pick and the
   * roster can format the same player differently, and a raw-equality dup
   * check would add both - which the validator then rejects as a duplicate. */
  function canonicalUuid(uuid: string): string {
    return uuid.replaceAll("-", "").toLowerCase();
  }

  function addManual(row: RaffleRow, list: "include" | "exclude") {
    const key = manualKey(row, list);
    const name = (manualDrafts[key] ?? "").trim();
    const member = draft.memberChoices.find(
      (choice) => choice.username.toLowerCase() === name.toLowerCase(),
    );
    if (!member?.uuid) return;
    const uuid = member.uuid;
    const target = list === "include" ? row.include : row.exclude;
    if (target.some((entry) => canonicalUuid(entry.player_uuid) === canonicalUuid(uuid))) {
      manualDrafts[key] = "";
      return;
    }
    target.push(draft.newManualRow(member.username, uuid));
    manualDrafts[key] = "";
  }

  function manualValid(row: RaffleRow, list: "include" | "exclude") {
    const name = (manualDrafts[manualKey(row, list)] ?? "").trim();
    if (!name) return false;
    return draft.memberChoices.some(
      (choice) => choice.uuid && choice.username.toLowerCase() === name.toLowerCase(),
    );
  }

  function removeManual(list: ManualRow[], entry: ManualRow) {
    const index = list.findIndex((candidate) => candidate.key === entry.key);
    if (index >= 0) list.splice(index, 1);
  }

  // Re-rolls replace a drawn winner - those go through a confirm dialog. The
  // click is intercepted before the submit; confirming re-dispatches it via
  // requestSubmit with the same button as submitter, so enhance still sees a
  // normal ?/rollRaffle submission.
  let confirmReroll = $state<ConfirmDialog | null>(null);
  let pendingReroll: HTMLButtonElement | null = null;

  /** The server's winner decides whether this is a re-roll: an undo can
   * clear the local row's copy while the stored slot is still won, and a
   * roll click must not silently replace that winner unconfirmed. */
  function slotHasStoredWinner(raffleId: string, slot: number): boolean {
    return (draft.liveInitial?.raffles ?? []).some(
      (raffle) =>
        raffle.id === raffleId &&
        (raffle.winners ?? []).some((winner) => winner.slot === slot),
    );
  }

  function maybeConfirmReroll(event: MouseEvent, raffleId: string, slot: number) {
    if (!slotHasStoredWinner(raffleId, slot)) return;
    event.preventDefault();
    pendingReroll = event.currentTarget as HTMLButtonElement;
    confirmReroll?.open();
  }

  function rerollConfirmed() {
    pendingReroll?.form?.requestSubmit(pendingReroll);
    pendingReroll = null;
  }

  function historyWhen(at: number): string {
    return new Date(at).toLocaleString("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
</script>

<FormSection id="raffles" title="Raffles">
  <p class="evf-hint">
    Each raffle defines who can enter and how tickets are weighted. Set it up,
    save, then roll each winner below - the preview shows the exact pool a
    roll would draw from.
  </p>
  {#if draft.raffles.length > 1}
    <Toggle
      bind:checked={draft.raffleExcludeWinners}
      label="Exclude winners from other raffles"
      hint="A member who wins any raffle is dropped from every other draw here."
    />
  {/if}
  {#each draft.raffles as raffle (raffle.key)}
    <div class="evf-raffle">
      <div class="evf-repeat-row evf-repeat-raffle">
        <input class="seq-input" placeholder="Prize" bind:value={raffle.prize} maxlength="300" />
        <Field label="Winners" tight>
          <input
            class="seq-input"
            type="number"
            min="1"
            max={RAFFLE_MAX_WINNERS}
            bind:value={raffle.winnerCount}
          />
        </Field>
        <button
          type="button"
          class="evf-remove focus-ring"
          onclick={() => (draft.raffles = draft.raffles.filter((entry) => entry.key !== raffle.key))}
          aria-label="Remove raffle"
        >✕</button>
      </div>

      <Field label="Tickets" element="div">
        <div class="evf-weight-row">
          <select class="seq-input evf-weight-mode" bind:value={raffle.weightMode}>
            <option value="perRaid">Per raid on the standings board</option>
            <option value="perStat">Per stat over a window</option>
            <option value="flat">One ticket each</option>
          </select>
          {#if raffle.weightMode === "perStat"}
            <select class="seq-input evf-weight-stat" bind:value={raffle.weightStat}>
              <option value="raids">raids</option>
              <option value="playtime">hours played</option>
              <option value="wars">wars</option>
            </select>
          {/if}
          {#if raffle.weightMode !== "flat"}
            <label class="evf-weight-per">
              <span class="evf-weight-per-label">
                1 ticket per
              </span>
              <input class="seq-input" type="number" min="1" bind:value={raffle.weightPer} />
              <span class="evf-weight-per-label">
                {raffle.weightMode === "perRaid" ? "raids" : STAT_LABELS[raffle.weightStat]}
              </span>
            </label>
          {/if}
        </div>
      </Field>
      {#if raffle.weightMode !== "flat"}
        <div class="evf-grid-2">
          <Field
            label={raffle.weightMode === "perRaid" ? "Ticket window start (UTC)" : "Counting window start (UTC)"}
            hint={raffle.weightMode === "perRaid" ? "Empty counts the tracker's full window." : undefined}
          >
            <InstantField bind:value={raffle.windowFrom} name="Ticket window start" />
          </Field>
          <Field
            label={raffle.weightMode === "perRaid" ? "Ticket window end (UTC)" : "Counting window end (UTC)"}
          >
            <InstantField bind:value={raffle.windowTo} name="Ticket window end" />
          </Field>
        </div>
      {/if}

      <Field label="Who can enter" element="div">
        {#if raffle.rules.length === 0}
          <p class="evf-hint">Everyone on the roster. Add rules to narrow it.</p>
        {/if}
        {#each raffle.rules as rule (rule.key)}
          <div class="evf-rule">
            <div class="evf-rule-head">
              <span class="evf-rule-type">{RULE_LABELS[rule.type]}</span>
              <button
                type="button"
                class="evf-remove focus-ring"
                onclick={() => (raffle.rules = raffle.rules.filter((entry) => entry.key !== rule.key))}
                aria-label="Remove {RULE_LABELS[rule.type]} rule"
              >✕</button>
            </div>
            {#if rule.type === "guildRank"}
              <div class="evf-chips" role="group" aria-label="Guild ranks that may enter">
                {#each GUILD_RANKS as rank (rank)}
                  <label class="evf-chip" class:evf-chip-selected={rule.ranks.includes(rank)}>
                    <input class="evf-chip-input" type="checkbox" value={rank} bind:group={rule.ranks} />
                    {rank}
                  </label>
                {/each}
              </div>
            {:else if rule.type === "seqRank"}
              {#if draft.seqRankChoices.length > 0}
                <div class="evf-chips" role="group" aria-label="Sequoia ranks that may enter">
                  {#each draft.seqRankChoices as rank (rank)}
                    <label class="evf-chip" class:evf-chip-selected={rule.ranks.includes(rank)}>
                      <input class="evf-chip-input" type="checkbox" value={rank} bind:group={rule.ranks} />
                      {rank}
                    </label>
                  {/each}
                </div>
              {:else}
                <p class="evf-hint">The rank ladder is unavailable right now - reload to retry.</p>
              {/if}
            {:else if rule.type === "stat"}
              <div class="evf-rule-stat">
                <select class="seq-input" bind:value={rule.stat} aria-label="Stat to threshold">
                  <option value="raids">raids</option>
                  <option value="playtime">hours played</option>
                  <option value="wars">wars</option>
                </select>
                <label class="evf-weight-per">
                  <span class="evf-weight-per-label">at least</span>
                  <input class="seq-input" type="number" min="1" bind:value={rule.min} aria-label="Minimum" />
                </label>
              </div>
              <div class="evf-grid-2">
                <Field label="From (UTC)" hint="Counts whole UTC days from the daily rollups.">
                  <InstantField bind:value={rule.windowFrom} name="Stat window start" />
                </Field>
                <Field label="To (UTC)">
                  <InstantField bind:value={rule.windowTo} name="Stat window end" />
                </Field>
              </div>
            {:else if rule.type === "milestone"}
              {#if draft.milestoneOptions.length > 0}
                <select class="seq-input" bind:value={rule.milestoneId} aria-label="Required milestone">
                  <option value="">Pick a milestone</option>
                  {#each draft.milestoneOptions as option (option.id)}
                    <option value={option.id}>{option.label}</option>
                  {/each}
                </select>
              {:else}
                <p class="evf-hint">Add a personal milestone above first.</p>
              {/if}
            {/if}
          </div>
        {/each}
        <div class="evf-rule-add">
          {#each Object.entries(RULE_LABELS) as [type, label] (type)}
            <button
              type="button"
              class="evf-add focus-ring"
              onclick={() => raffle.rules.push(draft.newRuleRow(type as RuleType))}
            >
              + {label}
            </button>
          {/each}
        </div>
      </Field>

      <div class="evf-grid-2">
        <Field label="Always include" element="div">
          {#each raffle.include as entry (entry.key)}
            <div class="evf-manual-row">
              <span class="evf-manual-name">{entry.username}</span>
              <label class="evf-weight-per">
                <span class="evf-weight-per-label">min tickets</span>
                <input class="seq-input" type="number" min="1" bind:value={entry.tickets} />
              </label>
              <button
                type="button"
                class="evf-remove focus-ring"
                onclick={() => removeManual(raffle.include, entry)}
                aria-label="Remove {entry.username} from the include list"
              >✕</button>
            </div>
          {/each}
          <div class="evf-manual-add">
            <input
              class="seq-input"
              placeholder="Member name"
              list="evf-member-list"
              spellcheck="false"
              bind:value={manualDrafts[manualKey(raffle, "include")]}
              aria-label="Member to always include"
            />
            <button
              type="button"
              class="evf-add focus-ring"
              disabled={!manualValid(raffle, "include")}
              onclick={() => addManual(raffle, "include")}
            >
              + Add
            </button>
          </div>
          <p class="evf-hint">Enter the pool even when the rules exclude them.</p>
        </Field>
        <Field label="Never include" element="div">
          {#each raffle.exclude as entry (entry.key)}
            <div class="evf-manual-row">
              <span class="evf-manual-name">{entry.username}</span>
              <button
                type="button"
                class="evf-remove focus-ring"
                onclick={() => removeManual(raffle.exclude, entry)}
                aria-label="Remove {entry.username} from the exclude list"
              >✕</button>
            </div>
          {/each}
          <div class="evf-manual-add">
            <input
              class="seq-input"
              placeholder="Member name"
              list="evf-member-list"
              spellcheck="false"
              bind:value={manualDrafts[manualKey(raffle, "exclude")]}
              aria-label="Member to never include"
            />
            <button
              type="button"
              class="evf-add focus-ring"
              disabled={!manualValid(raffle, "exclude")}
              onclick={() => addManual(raffle, "exclude")}
            >
              + Add
            </button>
          </div>
          <p class="evf-hint">Excluded even when picked or qualified.</p>
        </Field>
      </div>

      <RafflePreview raffleId={raffle.id} />
    </div>
  {/each}
  <button type="button" class="evf-add focus-ring" onclick={() => draft.raffles.push(draft.newRaffleRow())}>
    + Add raffle
  </button>

  {#if draft.raffleSlots.length > 0}
    {#if draft.mode === "edit"}
      <p class="evf-hint">
        <a
          class="evf-inline-link evf-inline-link-solo focus-ring"
          href={`/events/${draft.slug}/raffle`}
          target="_blank"
          rel="noreferrer"
        >
          ✦ Open the stage
        </a>
        Every open stage page watches each roll land live.
      </p>
    {/if}
    <div class="evf-raffle-results" role="table" aria-label="Raffle winners">
      <div class="evf-raffle-result evf-raffle-result-head" role="row">
        <span role="columnheader">Winner</span>
        <span role="columnheader">Prize</span>
        <span role="columnheader" class="evf-raffle-roll-head">Roll</span>
      </div>
      {#each draft.raffleSlots as row (row.key)}
        <div class="evf-raffle-result" role="row">
          <span
            class="evf-raffle-cell"
            class:evf-raffle-unrolled={!row.winner}
            role="cell"
          >{row.winner ? row.winner.username : "Not rolled"}</span>
          <span class="evf-raffle-cell" role="cell">{row.prize || "—"}</span>
          <span class="evf-raffle-roll-cell" role="cell">
            {#if row.saved}
              <button
                type="submit"
                formaction="?/rollRaffle"
                formnovalidate
                name="rollTarget"
                value={`${row.raffleId}:${row.slot}`}
                class="evf-roll-btn focus-ring"
                disabled={draft.rollingId !== null}
                onclick={(event) => maybeConfirmReroll(event, row.raffleId, row.slot)}
                aria-label={row.winner ? "Re-roll this winner" : "Roll this winner"}
                title={row.winner ? "Re-roll" : "Roll"}
              >↺</button>
            {:else}
              <span class="evf-raffle-savefirst">Save first</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}
  {#if draft.rollError}
    <span class="evf-error" role="alert">{draft.rollError}</span>
  {/if}

  {#if draft.rollHistory.length > 0}
    <details class="evf-roll-history">
      <summary class="evf-roll-history-summary">Roll history ({draft.rollHistory.length})</summary>
      <ul class="evf-roll-history-list">
        {#each draft.rollHistory as roll (roll.rollId)}
          <li class="evf-roll-history-row">
            <span class="evf-roll-history-when">{historyWhen(roll.startedAt)}</span>
            <span class="evf-roll-history-what">
              {roll.prize || "—"} · slot {roll.slot + 1} → {roll.winner.username}
              ({roll.winner.tickets} {roll.winner.tickets === 1 ? "ticket" : "tickets"},
              {roll.entrants.length} entrants)
            </span>
            {#if roll.superseded}
              <span class="evf-roll-history-superseded">re-rolled</span>
            {/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <ConfirmDialog
    bind:this={confirmReroll}
    title="Re-roll this winner"
    body="The drawn winner is replaced by a fresh draw. This can't be undone."
    confirmLabel="Re-roll"
    danger
    onconfirm={rerollConfirmed}
  />
</FormSection>
