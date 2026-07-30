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
  }

  private apply(message: StageMessage) {
    switch (message.type) {
      case "snapshot": {
        const rolls: Record<string, StageRoll> = {};
        for (const roll of message.rolls) rolls[`${roll.raffleId}:${roll.slot}`] = roll;
        this.rolls = rolls;
        break;
      }
      case "roll":
        this.rolls[`${message.roll.raffleId}:${message.roll.slot}`] = message.roll;
        break;
      case "settled": {
        const roll = this.rolls[`${message.raffleId}:${message.slot}`];
        if (roll && roll.rollId === message.rollId) roll.state = "settled";
        break;
      }
      case "event-updated":
        // Raffle config changed - refetch the page data underneath the feed.
        void invalidateAll();
        break;
    }
  }

  /** The roll to put on the wheel: a live spin, else the most recent one. */
  readonly current = $derived.by(() => {
    const rolls = Object.values(this.rolls);
    if (rolls.length === 0) return null;
    const spinning = rolls
      .filter((roll) => roll.state === "spinning")
      .sort((left, right) => right.startedAt - left.startedAt);
    if (spinning.length > 0) return spinning[0];
    return rolls.sort((left, right) => right.startedAt - left.startedAt)[0];
  });
}
