export interface RafflePreviewEntrant {
  player_uuid: string;
  username: string;
  tickets: number;
  source: "roster" | "include";
  odds: number;
}

export interface RafflePreviewResponse {
  entrants: RafflePreviewEntrant[];
  totalTickets: number;
  error: string | null;
}
