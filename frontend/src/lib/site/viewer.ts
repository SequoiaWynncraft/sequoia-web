/** Signed-in member identity carried by the seq_session cookie. */
export interface Viewer {
  discordId: string;
  minecraftUuid: string;
  minecraftUsername: string | null;
}
