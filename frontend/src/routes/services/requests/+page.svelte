<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";

  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Card from "$lib/design-system/components/Card.svelte";
  import SectionHeading from "$lib/design-system/components/SectionHeading.svelte";
  import { pageView } from "$lib/site/nav";
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import { MAX_TOME_REASON_LENGTH } from "$lib/rewardQueue";
  import type { RewardRequestType } from "$lib/server/rewardQueue";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const view = pageView("/services/requests");

  // Which request is mid-flight, so the matching button can show a pending label.
  let submitting = $state<RewardRequestType | null>(null);

  const REQUEST_LABEL: Record<RewardRequestType, string> = { aspect: "aspect", tome: "tome" };

  /** Feedback for one request card, derived from the last action result for that `type`. */
  function noticeFor(type: RewardRequestType): { kind: "success" | "error"; text: string } | null {
    if (!form || form.type !== type) return null;
    if ("submitted" in form && form.submitted) {
      const label = REQUEST_LABEL[type];
      const place =
        typeof form.position === "number" ? ` You're #${form.position} in the ${label} queue.` : "";
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
        return "The reward queue is briefly unavailable. Please try again in a moment.";
    }
  }

  const aspectNotice = $derived(noticeFor("aspect"));
  const tomeNotice = $derived(noticeFor("tome"));

  /** Shared enhance handler: flags the in-flight type and clears it once the result is applied. */
  function submitHandler(type: RewardRequestType) {
    return () => {
      submitting = type;
      return async ({ update }: { update: () => Promise<void> }) => {
        try {
          await update();
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
        <a class="seq-button seq-button-primary seq-button-md" href={webAuthStartUrl(page.url.href)}>
          Sign in with Discord
        </a>
      </Card>
    {:else if data.access === "unverified"}
      <Card hoverEffect={false}>
        <p class="req-notice req-notice-error">
          We couldn't verify your guild membership right now. Nothing was submitted — refresh in a moment to try again.
        </p>
        <a class="seq-button seq-button-secondary seq-button-md" href="/services/requests">Retry</a>
      </Card>
    {:else if data.access === "notMember"}
      <Card hoverEffect={false}>
        <p class="req-notice req-notice-error">
          Reward queue requests are for Sequoia guild members. Join the guild in game to request Aspects and Tomes.
        </p>
      </Card>
    {:else}
      <p class="req-lead">
        Requests join the guild reward queue and are reviewed by staff on Discord. Eligibility is checked
        automatically — you can hold one pending request per queue at a time.
      </p>

      <div class="req-grid">
        <!-- ─── Aspects ─────────────────────────────────────────────────── -->
        <Card hoverEffect={false}>
          <SectionHeading kicker="Reward queue" align="left">Request Aspects</SectionHeading>
          <p class="req-card-lead">Join the aspect queue. Staff hand out aspects in order.</p>

          <form method="POST" action="?/aspect" use:enhance={submitHandler("aspect")}>
            <button type="submit" class="seq-button seq-button-primary seq-button-md" disabled={submitting !== null}>
              {submitting === "aspect" ? "Requesting…" : "Request Aspects"}
            </button>
          </form>

          {#if aspectNotice}
            <p class="req-notice req-result" class:req-notice-error={aspectNotice.kind === "error"} aria-live="polite">
              {aspectNotice.text}
            </p>
          {/if}
        </Card>

        <!-- ─── Tomes ───────────────────────────────────────────────────── -->
        <Card hoverEffect={false}>
          <SectionHeading kicker="Reward queue" align="left">Request a Tome</SectionHeading>
          <p class="req-card-lead">Tell staff which tome you need and why, then join the tome queue.</p>

          <form method="POST" action="?/tome" use:enhance={submitHandler("tome")}>
            <label class="req-field">
              <span class="req-field-label">Reason</span>
              <textarea
                name="reason"
                class="req-textarea"
                rows="3"
                maxlength={MAX_TOME_REASON_LENGTH}
                required
                placeholder="Which tome, and why you need it"
              ></textarea>
            </label>
            <button type="submit" class="seq-button seq-button-primary seq-button-md" disabled={submitting !== null}>
              {submitting === "tome" ? "Requesting…" : "Request Tome"}
            </button>
          </form>

          {#if tomeNotice}
            <p class="req-notice req-result" class:req-notice-error={tomeNotice.kind === "error"} aria-live="polite">
              {tomeNotice.text}
            </p>
          {/if}
        </Card>
      </div>
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

  .req-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 1.25rem;
  }

  .req-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }
  .req-field-label {
    font-family: var(--font-display);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-dim);
  }
  .req-textarea {
    padding: 0.55rem 0.7rem;
    background: var(--color-abyss);
    border: 1px solid var(--color-border-subtle);
    border-radius: 0.4rem;
    color: var(--color-text-primary);
    font: inherit;
    resize: vertical;
    min-height: 3.5rem;
  }
  .req-textarea:focus {
    outline: none;
    border-color: var(--color-gold);
  }

  .req-notice {
    color: var(--color-text-secondary);
    margin: 0 0 0.75rem;
    line-height: var(--leading-normal, 1.6);
  }
  .req-result {
    margin: 1rem 0 0;
  }
  .req-notice-error {
    color: var(--color-nether);
  }
</style>
