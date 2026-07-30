import type { Client, Row } from "@libsql/client";

import type { StageEntrant, StageRoll } from "$lib/events/stageProtocol";

import { database } from "./db";

/** A persisted draw: the snapshot the stage replays, and the audit anchor. */
export interface RaffleRoll extends StageRoll {
  eventSlug: string;
  createdBy: string;
  /** A later re-roll of the same slot retired this record. */
  superseded: boolean;
}

export interface RaffleRollStore {
  insert(roll: RaffleRoll): Promise<void>;
  /**
   * The latest non-superseded roll per raffle:slot of an event - the stage's
   * catch-up snapshot. A roll past its settle time reads as settled even if
   * the settle timer died with the process.
   */
  latestForEvent(eventSlug: string): Promise<RaffleRoll[]>;
  /** Every roll of an event, newest first - the manage-side history. */
  listForEvent(eventSlug: string, limit?: number): Promise<RaffleRoll[]>;
  markSettled(id: string): Promise<void>;
  /** Re-rolling a slot retires its previous roll from the stage snapshot. */
  markSuperseded(eventSlug: string, raffleId: string, slot: number): Promise<void>;
}

/**
 * Rolls are event-sourced separately from the event JSON: the winner grafted
 * into the event stays authoritative for display, while these rows carry
 * what a live wheel needs (entrant snapshot, spin, timing) and a history the
 * document overwrites on re-roll.
 */
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
          roll.state,
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
  };
}

/** Rows that fail to parse are dropped rather than crashing the stage. */
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
      // The settle timer lives in one process's memory; wall clock is the
      // durable authority on whether a spin has finished.
      state: row.state === "spinning" && Date.now() < settlesAt ? "spinning" : "settled",
      superseded: row.state === "superseded",
      startedAt: Number(row.started_at),
      settlesAt,
      createdBy: String(row.created_by),
    };
  } catch {
    return null;
  }
}

export const raffleRollStore = createRaffleRollStore(database);
