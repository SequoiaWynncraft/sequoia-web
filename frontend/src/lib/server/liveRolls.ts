import type { StageMessage } from "$lib/events/stageProtocol";

/**
 * In-process fan-out for the live raffle stage: the roll action publishes,
 * every open SSE stream for that event's stage receives the message.
 *
 * SINGLE-REPLICA CONSTRAINT: subscribers live in this module's memory, which
 * works because the frontend deploys as one adapter-node process behind the
 * proxy (like eventStore's and serverCache's module singletons). Scaling to
 * multiple replicas would silently split viewers into disjoint rooms - move
 * to an external pub/sub before doing that.
 */

type Send = (message: StageMessage) => void;

interface Subscriber {
  send: Send;
  /** Called when the room is torn down (event deleted): close the stream. */
  end?: () => void;
}

const rooms = new Map<string, Set<Subscriber>>();
let retiring = false;

/**
 * Each teardown advances the slug's epoch. A stream handler captures the
 * epoch BEFORE its access checks and hands it to `subscribe`: a teardown
 * that lands while those checks await (deletion, visibility tightening)
 * would otherwise miss the not-yet-registered subscriber, attaching stale
 * authorization to whatever lives at the slug next.
 */
const epochs = new Map<string, number>();

export function roomEpoch(eventSlug: string): number {
  return epochs.get(eventSlug) ?? 0;
}

export function publish(eventSlug: string, message: StageMessage): void {
  const room = rooms.get(eventSlug);
  if (!room) return;
  for (const subscriber of room) {
    try {
      subscriber.send(message);
    } catch {
      // A dead stream must not stop the fan-out; its own cancel cleans it up.
    }
  }
}

/**
 * Registers a stage listener; the returned function removes it. When
 * `expectedEpoch` is given and a teardown has advanced the room since it was
 * captured, the registration is refused (null) - the caller's authorization
 * predates the teardown and must be re-established on a fresh connect.
 */
export function subscribe(
  eventSlug: string,
  send: Send,
  end?: () => void,
  expectedEpoch?: number,
): (() => void) | null {
  if (retiring) return null;
  if (expectedEpoch !== undefined && expectedEpoch !== roomEpoch(eventSlug)) return null;
  let room = rooms.get(eventSlug);
  if (!room) {
    room = new Set();
    rooms.set(eventSlug, room);
  }
  const subscriber: Subscriber = { send, end };
  room.add(subscriber);
  return () => {
    room.delete(subscriber);
    // Only drop the map entry while it still points at OUR set: a teardown
    // may already have replaced the room, and a straggling unsubscribe from
    // the old one must not delete the replacement out from under its
    // subscribers.
    if (room.size === 0 && rooms.get(eventSlug) === room) rooms.delete(eventSlug);
  };
}

/**
 * Tears the room down, closing every open stream. Deleting an event calls
 * this: an authorization decision belongs to the connect-time check, and a
 * closed EventSource reconnects into that check - where a deleted (or
 * recreated, differently-gated) event is judged afresh instead of an old
 * subscriber silently receiving the successor's rolls.
 */
export function endRoom(eventSlug: string): void {
  epochs.set(eventSlug, roomEpoch(eventSlug) + 1);
  const room = rooms.get(eventSlug);
  if (!room) return;
  rooms.delete(eventSlug);
  for (const subscriber of room) {
    try {
      subscriber.end?.();
    } catch {
      // Best-effort: one broken stream must not keep others open.
    }
  }
}

/** Closes every reconnectable stream before a retiring process exits. */
export function retireAllRooms(): void {
  retiring = true;
  for (const eventSlug of [...rooms.keys()]) endRoom(eventSlug);
}

/** Test hook: the number of live listeners for an event's stage. */
export function subscriberCount(eventSlug: string): number {
  return rooms.get(eventSlug)?.size ?? 0;
}
