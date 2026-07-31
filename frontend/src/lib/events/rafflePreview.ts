/** Wire types for the editor's raffle entrant preview (client-safe). */

export interface RafflePreviewEntrant {
  player_uuid: string;
  username: string;
  tickets: number;
  source: "roster" | "include";
  /** Share of the total ticket pool, 0..1. */
  odds: number;
}

export interface RafflePreviewResponse {
  entrants: RafflePreviewEntrant[];
  totalTickets: number;
  error: string | null;
}
