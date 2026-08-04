<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidate, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";

  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import Card from "$lib/design-system/components/Card.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import Field from "$lib/design-system/components/forms/Field.svelte";
  import FormStatus from "$lib/design-system/components/forms/FormStatus.svelte";
  import TextArea from "$lib/design-system/components/forms/TextArea.svelte";
  import QueuePanel from "./QueuePanel.svelte";
  import { pageView } from "$lib/site/nav";
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import { MAX_TOME_REASON_LENGTH, queueStanding, requestedAgoLabel } from "$lib/rewardQueue";
  import type { RewardQueueEligibility, RewardRequestType } from "$lib/server/rewardQueue";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const view = pageView("/services/requests");

  // Which request is mid-flight, so the matching button can show a pending label.
  let submitting = $state<RewardRequestType | null>(null);
  let reason = $state("");
  // One focus target per card, so a submit lands on its own result rather than the other's.
  let statusRegions = $state<Record<RewardRequestType, HTMLElement | null>>({ aspect: null, tome: null });

  // One clock for the whole render, so two rows never disagree about "2d ago", re-read
  // whenever the queues themselves are refetched. Still not a ticking timer: the labels
  // only gain new information when the queue does, and a second-by-second rewrite of every
  // row would be motion without meaning. But it can't be a constant either - re-running
  // load leaves this component mounted, so a page left open would keep measuring waits
  // against the clock it was first opened at.
  let now = $state(Date.now());

  const REQUEST_LABEL: Record<RewardRequestType, string> = { aspect: "aspect", tome: "tome" };

  const queues = $derived(data.access === "member" && data.queues.status === "ok" ? data.queues.queues : null);

  /** The viewer's own place in one queue, or null when the queue couldn't be read. */
  function standingFor(type: RewardRequestType) {
    return queues ? queueStanding(queues[type]) : null;
  }

  const aspectStanding = $derived(standingFor("aspect"));
  const tomeStanding = $derived(standingFor("tome"));

  /** "11 waiting" for a queue we could read, or nothing when we couldn't. */
  function queueMeta(type: RewardRequestType): string | undefined {
    if (!queues) return undefined;
    const count = queues[type].length;
    return count === 1 ? "1 waiting" : `${count} waiting`;
  }

  /** Feedback for one request card, derived from the last action result for that `type`. */
  function noticeFor(type: RewardRequestType): { kind: "success" | "error"; text: string } | null {
    if (!form || form.type !== type) return null;
    if ("submitted" in form && form.submitted) {
      const label = REQUEST_LABEL[type];
      const place = typeof form.position === "number" ? ` You're #${form.position} in the ${label} queue.` : "";
      return { kind: "success", text: `Your ${label} request was submitted.${place}` };
    }
    return { kind: "error", text: errorText(type, "error" in form ? form.error : undefined, form) };
  }

  /** Maps an action error code to member-facing copy, preferring the backend message when present. */
  function errorText(type: RewardRequestType, code: string | undefined, result: NonNullable<ActionData>): string {
    const label = REQUEST_LABEL[type];
    switch (code) {
      case "duplicate":
        return `You already have a pending ${label} request in the queue.`;
      case "forbidden":
        return "message" in result && result.message ? result.message : "You're not eligible to make this request.";
      case "reason_required":
        return "Add a short reason for your tome request.";
      case "reason_too_long":
        return `Keep your reason under ${MAX_TOME_REASON_LENGTH} characters.`;
      case "invalid":
        return "message" in result && result.message ? result.message : "That request couldn't be submitted.";
      case "signin":
        return "Your session expired. Sign in again before requesting.";
      default:
        return "The reward queue isn't responding. Try again in a moment.";
    }
  }

  const aspectNotice = $derived(noticeFor("aspect"));
  const tomeNotice = $derived(noticeFor("tome"));

  /**
   * Spells out an eligibility failure with the viewer's own numbers. The backend's own
   * sentence states the rule but not how far off you are, which is the part that tells you
   * whether to wait a day or raid tonight.
   */
  function ineligibleText(eligibility: RewardQueueEligibility): string {
    const missing: string[] = [];
    if (eligibility.inGuildTimeInDays < eligibility.requiredDays) {
      missing.push(`${eligibility.requiredDays} days in the guild (you have ${eligibility.inGuildTimeInDays})`);
    }
    if (!eligibility.hasHqRole && eligibility.raidCountLast7Days < eligibility.requiredRaids) {
      missing.push(
        `${eligibility.requiredRaids} guild raids in the last 7 days (you have ${eligibility.raidCountLast7Days}), or the HQ Team role`,
      );
    }
    if (missing.length === 0) return eligibility.message ?? "You're not eligible to use this queue yet.";
    return `You need ${missing.join(" and ")}.`;
  }

  // The one sentence standing between the viewer and a request, or null when nothing is.
  //
  // This is state rather than an {#await} around the forms, and the distinction matters: the
  // check streams in after the page, so gating the markup on it would mean no forms until it
  // landed, and on a client with no JS to resolve the streamed promise, no forms at all. The
  // forms are server-rendered up front; this only ever turns the buttons off afterwards, and
  // a slow or failed check leaves them live with the submission as the authority.
  let gate = $state<string | null>(null);
  const blocked = $derived(gate !== null);

  $effect(() => {
    if (data.access !== "member") {
      gate = null;
      return;
    }

    let current = true;
    data.eligibility
      .then((result) => {
        if (!current) return;
        if (result.status === "notLinked" || result.status === "refused") {
          // A refusal that names the fix (link your account) or the reason (not a member of
          // the guild the backend checks). Worth surfacing rather than folding into the
          // soft-failure path: this viewer is refused on every attempt, so a live button
          // would only ever tell them the same thing one click later.
          gate = result.message;
        } else if (result.status === "ok" && !result.eligibility.eligible) {
          gate = ineligibleText(result.eligibility);
        } else {
          gate = null;
        }
      })
      .catch(() => {
        if (current) gate = null;
      });

    return () => {
      current = false;
    };
  });

  /**
   * Re-runs this route's load, which is what the queues live in. The membership check runs
   * again with it - `depends` can't scope a refresh to part of one load - but its roster read
   * is served from the server's cache. Reports finishing, so a refresh that changes nothing
   * still looks like it did something.
   */
  let refreshed = $state(false);
  let refreshing = $state(false);
  let refreshedTimer: ReturnType<typeof setTimeout> | undefined;

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    refreshed = false;
    clearTimeout(refreshedTimer);
    try {
      await invalidate("app:reward-queue");
      now = Date.now();
      refreshed = true;
      // Clears itself: a confirmation that never leaves stops reading as a confirmation
      // and starts reading as a claim that the data is still current, which it won't be.
      refreshedTimer = setTimeout(() => (refreshed = false), 4000);
    } finally {
      refreshing = false;
    }
  }

  $effect(() => () => clearTimeout(refreshedTimer));

  /**
   * Shared enhance handler: flags the in-flight type, then moves focus to the result so the
   * outcome is where the next keystroke lands rather than somewhere below the button.
   * `invalidateAll: false` keeps the refetch to this route's own load rather than every
   * load above it; that load still re-runs whole, which is where the fresh queues come from.
   */
  function submitHandler(type: RewardRequestType) {
    return ({ cancel }: { cancel: () => void }) => {
      // The buttons are aria-disabled rather than disabled, so they stay focusable and can
      // still be described to a screen reader; that means the guard against actually
      // submitting has to live here. Without JS neither runs and the backend refuses, which
      // is the same answer by a slower route.
      if (blocked || submitting !== null) {
        cancel();
        return;
      }

      submitting = type;
      return async ({ update }: { update: (opts?: { invalidateAll: boolean }) => Promise<void> }) => {
        try {
          await update({ invalidateAll: false });
          await invalidate("app:reward-queue");
          // The queues just came back, so wait labels measure against a fresh clock rather
          // than the one this page was opened at.
          now = Date.now();
          // An accepted reason is no longer editable copy. Leaving it in the box invites a
          // second identical request in the one case where the form stays on screen after a
          // success: a queue read that came back unavailable, so the standing can't replace it.
          if (type === "tome" && form && "submitted" in form && form.submitted) reason = "";
          // Only move focus where there is something to read: an empty region would take
          // focus and announce nothing, leaving the caret somewhere with no explanation.
          if (noticeFor(type)) statusRegions[type]?.focus();
        } finally {
          submitting = null;
        }
      };
    };
  }
</script>

<PageScaffold crumbs={view.crumbs} tabs={view.tabs} width="lg">
  {#snippet children()}
    <PageHeader kicker={view.kicker} title={view.title} lead={view.lead} />

    {#if data.access === "signin"}
      <Card hoverEffect={false}>
        <p class="req-notice">Sign in with Discord to request Aspects and Tomes from the guild reward queue.</p>
        <Button href={webAuthStartUrl(page.url.href)}>Sign in with Discord</Button>
      </Card>
    {:else if data.access === "unverified"}
      <Card hoverEffect={false}>
        <p class="req-notice req-notice-error">
          We couldn't verify your guild membership. Nothing was submitted.
        </p>
        <!-- Full invalidation, deliberately: this state is a failed roster check, and the
             targeted key isn't even registered on this branch - load returns before it. -->
        <Button variant="secondary" onclick={() => invalidateAll()}>Try again</Button>
      </Card>
    {:else if data.access === "notMember"}
      <Card hoverEffect={false}>
        <p class="req-notice req-notice-error">
          The reward queue is for Sequoia guild members. Join the guild in game to request Aspects and Tomes.
        </p>
      </Card>
    {:else}
      <p class="req-lead">
        One pending request per queue. Staff hand them out in order, front of the queue first.
      </p>

      {#if queues}
        <section class="req-block">
          <SectionLabel>
            Your standing
            {#snippet actions()}
              <!-- The confirmation sits beside the control rather than replacing its label:
                   the button is always "Refresh", and a button that renames itself to
                   "Updated" is a different control as far as a screen reader is concerned. -->
              <span class="req-refresh-status" role="status">
                {refreshing ? "Refreshing" : refreshed ? "Updated" : ""}
              </span>
              <button type="button" class="req-refresh focus-ring" onclick={refresh} aria-disabled={refreshing}>
                Refresh
              </button>
            {/snippet}
          </SectionLabel>

          <QueuePanel title="Aspects" entries={queues.aspect} {now} />
          <QueuePanel title="Tome" entries={queues.tome} {now} />
        </section>
      {/if}

      <!-- The eligibility check streams in behind the page and only ever turns the buttons
           off; it never gates this markup. The forms are server-rendered whether or not the
           check ever lands, so a slow Discord lookup - or a client with no JS to resolve the
           streamed promise - still gets a working page, with the submission as the authority. -->
      {#if gate}
        <p class="req-gate" id="req-gate" role="status">{gate}</p>
      {/if}

      <section class="req-block" aria-label="Make a request">
        <div class="req-grid">
          <!-- ─── Aspects ─────────────────────────────────────────────────── -->
          <Card hoverEffect={false}>
            <SectionLabel meta={queueMeta("aspect")}>Aspects</SectionLabel>

            {#if aspectStanding}
              <p class="req-card-lead">
                You're already in this queue, #{aspectStanding.position} of {aspectStanding.total}, requested
                {requestedAgoLabel(aspectStanding.entry.createdAtMs, now)}.
              </p>
            {:else}
              <p class="req-card-lead">Join the aspect queue. No reason needed.</p>
              <form method="POST" action="?/aspect" use:enhance={submitHandler("aspect")}>
                <!-- aria-disabled, not disabled: a disabled button leaves the tab order, so
                     a keyboard or screen-reader user would never reach it and never hear the
                     reason it can't be used. use:enhance cancels the submit instead, and it
                     cancels on any request in flight - so both buttons read as unavailable
                     while either one is submitting, which is what the guard does. -->
                <Button
                  type="submit"
                  aria-disabled={submitting !== null || blocked}
                  aria-describedby={blocked ? "req-gate" : undefined}
                >
                  {submitting === "aspect" ? "Requesting" : "Request aspects"}
                </Button>
              </form>
            {/if}

            <!-- Focusable so a submit lands on its own outcome. Focus is what announces the
                 result here, so the status line drops its live role rather than saying the
                 same sentence a second time. -->
            <div class="req-status" bind:this={statusRegions.aspect} tabindex="-1">
              {#if aspectNotice}
                <FormStatus
                  live={false}
                  error={aspectNotice.kind === "error" ? aspectNotice.text : null}
                  saved={aspectNotice.kind === "success"}
                  savedText={aspectNotice.text}
                />
              {/if}
            </div>
          </Card>

          <!-- ─── Tomes ───────────────────────────────────────────────────── -->
          <Card hoverEffect={false}>
            <SectionLabel meta={queueMeta("tome")}>Tome</SectionLabel>

            {#if tomeStanding}
              <p class="req-card-lead">
                You're already in this queue, #{tomeStanding.position} of {tomeStanding.total}, requested
                {requestedAgoLabel(tomeStanding.entry.createdAtMs, now)}.
              </p>
            {:else}
              <p class="req-card-lead">Tell staff which tome you need and why.</p>
              <form method="POST" action="?/tome" use:enhance={submitHandler("tome")}>
                <Field
                  label="Reason"
                  hint={reason.length > MAX_TOME_REASON_LENGTH * 0.8
                    ? `${MAX_TOME_REASON_LENGTH - reason.length} characters left`
                    : undefined}
                >
                  <TextArea
                    name="reason"
                    rows={3}
                    maxlength={MAX_TOME_REASON_LENGTH}
                    required
                    placeholder="Guild Tome, for the war grind"
                    bind:value={reason}
                  />
                </Field>
                <div class="req-submit">
                  <Button
                    type="submit"
                    aria-disabled={submitting !== null || blocked}
                    aria-describedby={blocked ? "req-gate" : undefined}
                  >
                    {submitting === "tome" ? "Requesting" : "Request tome"}
                  </Button>
                </div>
              </form>
            {/if}

            <div class="req-status" bind:this={statusRegions.tome} tabindex="-1">
              {#if tomeNotice}
                <FormStatus
                  live={false}
                  error={tomeNotice.kind === "error" ? tomeNotice.text : null}
                  saved={tomeNotice.kind === "success"}
                  savedText={tomeNotice.text}
                />
              {/if}
            </div>
          </Card>
        </div>
      </section>
    {/if}
  {/snippet}
</PageScaffold>

<style>
  .req-lead,
  .req-card-lead {
    color: var(--color-text-secondary);
    line-height: var(--leading-normal, 1.6);
  }
  .req-lead {
    max-width: 60ch;
    margin: 1.5rem 0 2rem;
  }
  .req-card-lead {
    margin: 0.5rem 0 1.25rem;
    font-size: 0.9rem;
  }

  .req-block {
    margin-bottom: 2.5rem;
  }

  .req-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 1.25rem;
  }

  .req-submit {
    margin-top: 1rem;
  }

  /* The requirement, stated before the request rather than after the refusal. */
  .req-gate {
    max-width: 60ch;
    margin: 0 0 1.5rem;
    color: var(--color-gold-dark);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .req-refresh {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }
  .req-refresh:hover {
    color: var(--accent-hover);
  }

  .req-refresh[aria-disabled="true"] {
    cursor: default;
    opacity: 0.55;
  }

  .req-refresh-status {
    color: var(--text-dim);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .req-notice {
    color: var(--color-text-secondary);
    margin: 0 0 0.75rem;
    line-height: var(--leading-normal, 1.6);
  }
  .req-notice-error {
    color: var(--color-nether);
  }

</style>
