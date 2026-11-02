import { invalidateAll } from "$app/navigation";

import type { StageMessage, StageRoll } from "#lib/events/stageProtocol.js";

/**
 * The stage's live connection: an EventSource over the event's roll stream,
 * mirrored into reactive state. Reconnects are the browser's own; every
 * (re)connect starts with a snapshot, which is the whole catch-up story.
 */
export class StageFeed {
  /** Latest roll per `${raffleId}:${slot}`. */
  rolls = $state<Record<string, StageRoll>>({});
  connected = $state(false);
  /** Local epoch minus server epoch, refreshed by every timed SSE message. */
  clockOffset = $state<number | null>(null);

  private source: EventSource | undefined;
  /** Client-side settle timers per roll key - the server's own settle timer
   * dies with its process, and a snapshot can replay a "spinning" roll whose
   * settle broadcast will never come. Wall clock is the durable authority. */
  private settleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly slug: string) {}

  /** Server-rendered snapshot, shown until the stream's own arrives. */
  seed(rolls: StageRoll[]) {
    if (Object.keys(this.rolls).length > 0) return;
    const seeded: Record<string, StageRoll> = {};
    for (const roll of rolls) seeded[`${roll.raffleId}:${roll.slot}`] = roll;
    this.rolls = seeded;
  }

  connect() {
    if (this.source) return;
    const source = new EventSource(`/events/${encodeURIComponent(this.slug)}/raffle/stream`);
    this.source = source;
    source.onopen = () => (this.connected = true);
    source.onerror = () => (this.connected = false);
    source.onmessage = (event) => {
      const receivedAt = Date.now();
      let message: StageMessage;
      try {
        message = JSON.parse(event.data as string) as StageMessage;
      } catch {
        return;
      }
      this.apply(message, receivedAt);
    };
  }

  close() {
    this.source?.close();
    this.source = undefined;
    this.connected = false;
    for (const timer of this.settleTimers.values()) clearTimeout(timer);
    this.settleTimers.clear();
  }

  /** Marks the roll settled once its own settle time passes, whether or not
   * the server's broadcast ever arrives. */
  private scheduleSettle(roll: StageRoll) {
    const key = `${roll.raffleId}:${roll.slot}`;
    const pending = this.settleTimers.get(key);
    if (pending) clearTimeout(pending);
    if (roll.state !== "spinning" || this.clockOffset === null) return;
    const timer = setTimeout(
      () => {
        const current = this.rolls[key];
        if (current && current.rollId === roll.rollId) current.state = "settled";
        this.settleTimers.delete(key);
      },
      Math.max(0, roll.settlesAt + this.clockOffset - Date.now()),
    );
    this.settleTimers.set(key, timer);
  }

  private rescheduleSettles() {
    for (const timer of this.settleTimers.values()) clearTimeout(timer);
    this.settleTimers.clear();
    for (const roll of Object.values(this.rolls)) this.scheduleSettle(roll);
  }

  private apply(message: StageMessage, receivedAt: number) {
    if (
      (message.type === "snapshot" || message.type === "roll") &&
      Number.isFinite(message.now)
    ) {
      this.clockOffset = receivedAt - message.now;
    }
    switch (message.type) {
      case "snapshot": {
        const rolls: Record<string, StageRoll> = {};
        for (const roll of message.rolls) rolls[`${roll.raffleId}:${roll.slot}`] = roll;
        this.rolls = rolls;
        this.rescheduleSettles();
        break;
      }
      case "roll": {
        const key = `${message.roll.raffleId}:${message.roll.slot}`;
        // A delayed publish must never roll the slot backward: when two
        // draws race, the one that started later is the one that won the
        // event's version guard.
        const existing = this.rolls[key];
        if (existing && existing.startedAt > message.roll.startedAt) {
          this.rescheduleSettles();
          break;
        }
        this.rolls[key] = message.roll;
        this.rescheduleSettles();
        break;
      }
      case "settled": {
        const key = `${message.raffleId}:${message.slot}`;
        const roll = this.rolls[key];
        if (roll && roll.rollId === message.rollId) {
          if (
            this.clockOffset === null ||
            Date.now() >= roll.settlesAt + this.clockOffset
          ) {
            roll.state = "settled";
            const pending = this.settleTimers.get(key);
            if (pending) clearTimeout(pending);
            this.settleTimers.delete(key);
          } else {
            // Even an unexpectedly early server broadcast must not unmask
            // the committed winner before the shared settle epoch.
            this.scheduleSettle(roll);
          }
        }
        break;
      }
      case "retired": {
        const key = `${message.raffleId}:${message.slot}`;
        // Only the named roll retires - a newer roll occupying the slot by
        // now is exactly the thing this message must not destroy.
        if (this.rolls[key]?.rollId !== message.rollId) break;
        const pending = this.settleTimers.get(key);
        if (pending) clearTimeout(pending);
        this.settleTimers.delete(key);
        delete this.rolls[key];
        break;
      }
      case "event-updated":
        // Raffle config changed - refetch the page data underneath the feed.
        void invalidateAll();
        break;
    }
  }
}
