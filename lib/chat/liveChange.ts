/**
 * Live changes to a message, and the answers asked for before them.
 *
 * A message on screen changes live: an edit, a reaction, a reply, through the
 * realtime stream or the person's own action. A page of messages asked for
 * before that change can land after it, with the message as it was then, and
 * merged in, the server's copy put the change back (FE-BUG-4). So a message
 * records when it last changed live, by this client's clock (post_live_at,
 * chat_live_at), and an answer asked for before then leaves those fields as
 * they are. Answers carry the time they were asked for (useFetch's
 * lastRequestStartedAt, as authoritativeThrough).
 */

/** Whether a change made live at liveAt is newer than an answer asked for at askedAt. */
export function newerThanAnswer(liveAt: number | undefined, askedAt: number | undefined): boolean {
  return liveAt !== undefined && askedAt !== undefined && Number.isFinite(askedAt) && liveAt >= askedAt
}
