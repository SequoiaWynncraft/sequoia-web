/**
 * The one way an IGN becomes a link: member names across the site resolve
 * to the playercard through here, so identity navigation never drifts
 * page by page.
 */
export function playercardUrl(player: string): string {
  return `/statistics/player/playercard?player=${encodeURIComponent(player)}`;
}
