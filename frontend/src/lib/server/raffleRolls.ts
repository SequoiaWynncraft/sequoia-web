import type { Client, Row } from "@libsql/client";

import type { StageEntrant, StageRoll } from "#lib/events/stageProtocol.js";

import { database } from "./db";

export interface RaffleRoll extends StageRoll {
  eventSlug: string;
  createdBy: string;
  superseded: boolean;
  pending: boolean;
}

/**
 * Projects a persisted roll onto the public wire shape. Structural typing
 * would happily serialize the extra fields - `createdBy` is a manager's
 * Discord id and must never reach a viewer - so everything the stage sends
 * or returns goes through this explicit pick.
 */
export function toStageRoll(roll: RaffleRoll): StageRoll {
  return {
    rollId: roll.rollId,
    raffleId: roll.raffleId,
    slot: roll.slot,
    prize: roll.prize,
    entrants: roll.entrants,
    winnerIndex: roll.winnerIndex,
    winner: roll.winner,
    spin: roll.spin,
    state: roll.state,
    startedAt: roll.startedAt,
    settlesAt: roll.settlesAt,
  };
}

export interface RaffleRollStore {
  insert(roll: RaffleRoll): Promise<void>;
  latestForEvent(eventSlug: string): Promise<RaffleRoll[]>;
  listForEvent(eventSlug: string, limit?: number): Promise<RaffleRoll[]>;
  markSettled(id: string): Promise<void>;
  markLive(id: string): Promise<boolean>;
  markSuperseded(eventSlug: string, raffleId: string, slot: number): Promise<void>;
  markSupersededById(id: string): Promise<void>;
  removeForEvent(eventSlug: string): Promise<void>;
}

export function createRaffleRollStore(getClient: () => Promise<Client>): RaffleRollStore {
  let readyPromise: Promise<Client> | undefined;

  function ready(): Promise<Client> {
    readyPromise ??= init().catch((error: unknown) => {
      readyPromise = undefined;
      throw error;
    });
    return readyPromise;
  }

  async function init(): Promise<Client> {
    const db = await getClient();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS raffle_rolls (
        id TEXT PRIMARY KEY,
        event_slug TEXT NOT NULL,
        raffle_id TEXT NOT NULL,
        slot INTEGER NOT NULL,
        prize TEXT NOT NULL,
        entrants TEXT NOT NULL,
        winner_index INTEGER NOT NULL,
        spin TEXT NOT NULL,
        state TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        settles_at INTEGER NOT NULL,
        created_by TEXT NOT NULL
      )
    `);
    await db.execute(
      "CREATE INDEX IF NOT EXISTS raffle_rolls_event ON raffle_rolls (event_slug, raffle_id, slot, started_at)",
    );
    return db;
  }

  return {
    async insert(roll) {
      const db = await ready();
      await db.execute({
        sql: `
          INSERT INTO raffle_rolls
            (id, event_slug, raffle_id, slot, prize, entrants, winner_index, spin, state, started_at, settles_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          roll.rollId,
          roll.eventSlug,
          roll.raffleId,
          roll.slot,
          roll.prize,
          JSON.stringify(roll.entrants),
          roll.winnerIndex,
          JSON.stringify(roll.spin),
          roll.pending ? "pending" : roll.state,
          roll.startedAt,
          roll.settlesAt,
          roll.createdBy,
        ],
      });
    },

    async latestForEvent(eventSlug) {
      const db = await ready();
      const result = await db.execute({
        sql: `
          SELECT * FROM raffle_rolls
          WHERE event_slug = ? AND state != 'superseded'
          ORDER BY started_at DESC
        `,
        args: [eventSlug],
      });
      const latest = new Map<string, RaffleRoll>();
      for (const row of result.rows) {
        const roll = rowToRoll(row);
        if (!roll) continue;
        if (roll.pending && Date.now() >= roll.settlesAt) continue;
        const key = `${roll.raffleId}:${roll.slot}`;
        if (!latest.has(key)) latest.set(key, roll);
      }
      return [...latest.values()];
    },

    async listForEvent(eventSlug, limit = 100) {
      const db = await ready();
      const result = await db.execute({
        sql: "SELECT * FROM raffle_rolls WHERE event_slug = ? ORDER BY started_at DESC LIMIT ?",
        args: [eventSlug, limit],
      });
      return result.rows.map(rowToRoll).filter((roll) => roll !== null);
    },

    async markLive(id) {
      const db = await ready();
      const result = await db.execute({
        sql: "UPDATE raffle_rolls SET state = 'spinning' WHERE id = ? AND state = 'pending'",
        args: [id],
      });
      return result.rowsAffected > 0;
    },

    async markSettled(id) {
      const db = await ready();
      await db.execute({
        sql: "UPDATE raffle_rolls SET state = 'settled' WHERE id = ? AND state = 'spinning'",
        args: [id],
      });
    },

    async markSuperseded(eventSlug, raffleId, slot) {
      const db = await ready();
      await db.execute({
        sql: "UPDATE raffle_rolls SET state = 'superseded' WHERE event_slug = ? AND raffle_id = ? AND slot = ?",
        args: [eventSlug, raffleId, slot],
      });
    },

    async markSupersededById(id) {
      const db = await ready();
      await db.execute({
        sql: "UPDATE raffle_rolls SET state = 'superseded' WHERE id = ?",
        args: [id],
      });
    },

    async removeForEvent(eventSlug) {
      const db = await ready();
      await db.execute({
        sql: "DELETE FROM raffle_rolls WHERE event_slug = ?",
        args: [eventSlug],
      });
    },
  };
}

function rowToRoll(row: Row): RaffleRoll | null {
  try {
    const entrants = JSON.parse(String(row.entrants)) as StageEntrant[];
    const spin = JSON.parse(String(row.spin)) as { turns: number; durationMs: number };
    const winnerIndex = Number(row.winner_index);
    const winner = entrants[winnerIndex];
    if (!winner) return null;
    const settlesAt = Number(row.settles_at);
    return {
      rollId: String(row.id),
      eventSlug: String(row.event_slug),
      raffleId: String(row.raffle_id),
      slot: Number(row.slot),
      prize: String(row.prize),
      entrants,
      winnerIndex,
      winner,
      spin,
      state: row.state === "spinning" && Date.now() < settlesAt ? "spinning" : "settled",
      superseded: row.state === "superseded",
      pending: row.state === "pending",
      startedAt: Number(row.started_at),
      settlesAt,
      createdBy: String(row.created_by),
    };
  } catch {
    return null;
  }
}

export const raffleRollStore = createRaffleRollStore(database);
