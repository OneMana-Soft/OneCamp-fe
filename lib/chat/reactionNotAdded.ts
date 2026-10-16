/**
 * What a reaction that couldn't be added says, in a channel, a DM or a group
 * (QA F-14): a failure, so the error tile, never the success check. A refused
 * request says it in its own toast, under this title with the server's reason;
 * an answer that came back without the new reaction's id says all of this.
 */
export const REACTION_NOT_ADDED = {
  title: "Couldn't add the reaction",
  description: "Try again in a moment.",
  variant: "destructive" as const,
}

/** The title a refused removal's toast leads with. */
export const REACTION_NOT_REMOVED = "Couldn't remove the reaction"
