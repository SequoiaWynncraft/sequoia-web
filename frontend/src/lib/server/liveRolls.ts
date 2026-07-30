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

const rooms = new Map<string, Set<Send>>();

export function publish(eventSlug: string, message: StageMessage): void {
  const room = rooms.get(eventSlug);
  if (!room) return;
  for (const send of room) {
    try {
      send(message);
    } catch {
      // A dead stream must not stop the fan-out; its own cancel cleans it up.
    }
  }
}

/** Registers a stage listener; the returned function removes it. */
export function subscribe(eventSlug: string, send: Send): () => void {
  let room = rooms.get(eventSlug);
  if (!room) {
    room = new Set();
    rooms.set(eventSlug, room);
  }
  room.add(send);
  return () => {
    room.delete(send);
    if (room.size === 0) rooms.delete(eventSlug);
  };
}

/** Test hook: the number of live listeners for an event's stage. */
export function subscriberCount(eventSlug: string): number {
  return rooms.get(eventSlug)?.size ?? 0;
}
