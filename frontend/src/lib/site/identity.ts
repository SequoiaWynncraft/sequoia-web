export function playercardUrl(player: string): string {
  return `/statistics/player/playercard?player=${encodeURIComponent(player)}`;
}
