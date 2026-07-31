/**
 * Wire types for the live raffle stage (client-safe). Every open stage page
 * receives identical roll data, so all viewers watch the same spin land on
 * the same winner at the same wall-clock time.
 */

export interface StageEntrant {
  player_uuid: string;
  username: string;
  tickets: number;
}

export interface StageRoll {
  rollId: string;
  raffleId: string;
  slot: number;
  prize: string;
  /** The exact drawable pool the winner was drawn from, in wheel order. */
  entrants: StageEntrant[];
  /** Index of the winner inside `entrants`. */
  winnerIndex: number;
  winner: StageEntrant;
  /** Deterministic spin choreography - identical on every screen. */
  spin: { turns: number; durationMs: number };
  state: "spinning" | "settled";
  /** Epoch ms; a late joiner starts the animation with a negative delay. */
  startedAt: number;
  settlesAt: number;
}

export type StageMessage =
  | { type: "snapshot"; now: number; rolls: StageRoll[] }
  | { type: "roll"; now: number; roll: StageRoll }
  | { type: "settled"; rollId: string; raffleId: string; slot: number }
  /** The named roll is gone (its replacement's record failed) - drop it
   * only if the feed still holds exactly that roll, and fall back to the
   * event data, which stays authoritative. A concurrent manager's newer
   * roll on the same slot must survive this message. */
  | { type: "retired"; raffleId: string; slot: number; rollId: string }
  | { type: "event-updated" };
