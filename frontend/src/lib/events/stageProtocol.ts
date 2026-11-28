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
  entrants: StageEntrant[];
  winnerIndex: number;
  winner: StageEntrant;
  spin: { turns: number; durationMs: number };
  state: "spinning" | "settled";
  startedAt: number;
  settlesAt: number;
}

export type StageMessage =
  | { type: "snapshot"; now: number; rolls: StageRoll[] }
  | { type: "roll"; now: number; roll: StageRoll }
  | { type: "settled"; rollId: string; raffleId: string; slot: number }
  | { type: "retired"; raffleId: string; slot: number; rollId: string }
  | { type: "event-updated" };
