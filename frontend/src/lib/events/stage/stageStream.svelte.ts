import { invalidateAll } from "$app/navigation";

import type { StageMessage, StageRoll } from "$lib/events/stageProtocol";

/**
 * The stage's live connection: an EventSource over the event's roll stream,
 * mirrored into reactive state. Reconnects are the browser's own; every
 * (re)connect starts with a snapshot, which is the whole catch-up story.
 */
export class StageFeed {
  /** Latest roll per `${raffleId}:${slot}`. */
  rolls = $state<Record<string, StageRoll>>({});
  connected = $state(false);

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
      let message: StageMessage;
      try {
        message = JSON.parse(event.data as string) as StageMessage;
      } catch {
        return;
      }
      this.apply(message);
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
    if (roll.state !== "spinning") return;
    const timer = setTimeout(
      () => {
        const current = this.rolls[key];
        if (current && current.rollId === roll.rollId) current.state = "settled";
        this.settleTimers.delete(key);
      },
      Math.max(0, roll.settlesAt - Date.now()),
    );
    this.settleTimers.set(key, timer);
  }

  private apply(message: StageMessage) {
    switch (message.type) {
      case "snapshot": {
        const rolls: Record<string, StageRoll> = {};
        for (const roll of message.rolls) rolls[`${roll.raffleId}:${roll.slot}`] = roll;
        this.rolls = rolls;
        for (const roll of message.rolls) this.scheduleSettle(roll);
        break;
      }
      case "roll":
        this.rolls[`${message.roll.raffleId}:${message.roll.slot}`] = message.roll;
        this.scheduleSettle(message.roll);
        break;
      case "settled": {
        const roll = this.rolls[`${message.raffleId}:${message.slot}`];
        if (roll && roll.rollId === message.rollId) roll.state = "settled";
        break;
      }
      case "retired": {
        const key = `${message.raffleId}:${message.slot}`;
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
