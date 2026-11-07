import type { ManagedMessage } from "./types";

/**
 * What the editor can offer for a message. A reviewed webhook original that Sierra edits in place
 * carries text, embeds and images only. Sierra never deletes it, and never re-creates it once it
 * was deleted outside Sierra; only the record of a released original can be removed.
 */
export function capabilities(message: ManagedMessage | null) {
  const inPlace = message?.source?.webhook_edit === true;
  const bound = !!message?.message_id;
  return {
    inPlace,
    /** Buttons and Components V2 layouts. */
    controls: !inPlace,
    deletable: !inPlace || !bound,
    publishable: !inPlace || bound,
  };
}
