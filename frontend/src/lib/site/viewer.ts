/** Signed-in identity and server-resolved website access carried by the session. */
export interface Viewer {
  discordId: string;
  discordUsername: string | null;
  minecraftUuid: string;
  minecraftUsername: string | null;
  websiteAdmin: boolean;
}
