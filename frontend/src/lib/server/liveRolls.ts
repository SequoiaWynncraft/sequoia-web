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

/** Registers a stage listener; the returned function removes it. */
export function subscribe(eventSlug: string, send: Send, end?: () => void): () => void {
  let room = rooms.get(eventSlug);
  if (!room) {
    room = new Set();
    rooms.set(eventSlug, room);
  }
  const subscriber: Subscriber = { send, end };
  room.add(subscriber);
  return () => {
    room.delete(subscriber);
    if (room.size === 0) rooms.delete(eventSlug);
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

/** Test hook: the number of live listeners for an event's stage. */
export function subscriberCount(eventSlug: string): number {
  return rooms.get(eventSlug)?.size ?? 0;
}
