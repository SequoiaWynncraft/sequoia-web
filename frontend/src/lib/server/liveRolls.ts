import type { StageMessage } from "#lib/events/stageProtocol.js";

type Send = (message: StageMessage) => void;

interface Subscriber {
  send: Send;
  end?: () => void;
}

const rooms = new Map<string, Set<Subscriber>>();
let retiring = false;

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
    } catch {}
  }
}

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
    if (room.size === 0 && rooms.get(eventSlug) === room) rooms.delete(eventSlug);
  };
}

export function endRoom(eventSlug: string): void {
  epochs.set(eventSlug, roomEpoch(eventSlug) + 1);
  const room = rooms.get(eventSlug);
  if (!room) return;
  rooms.delete(eventSlug);
  for (const subscriber of room) {
    try {
      subscriber.end?.();
    } catch {}
  }
}

export function retireAllRooms(): void {
  retiring = true;
  for (const eventSlug of [...rooms.keys()]) endRoom(eventSlug);
}

export function subscriberCount(eventSlug: string): number {
  return rooms.get(eventSlug)?.size ?? 0;
}
