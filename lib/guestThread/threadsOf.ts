/**
 * Comments with the replies under what they answer, oldest first: the one
 * grouping for a doc's guest conversation, on the team's side and on the
 * guest's page. Apart from guestThread.ts, so the guest page doesn't carry the
 * team's calls. Pure.
 */
export function threadsOf<T extends { id: string; parent_id?: string }>(comments: T[]): Array<{ comment: T; replies: T[] }> {
  const replies = new Map<string, T[]>()
  for (const c of comments) {
    if (c.parent_id) replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c])
  }
  return comments.filter((c) => !c.parent_id).map((comment) => ({ comment, replies: replies.get(comment.id) ?? [] }))
}
