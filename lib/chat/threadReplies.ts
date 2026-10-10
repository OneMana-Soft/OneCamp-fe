import { reconcileLatestWindow } from "@/lib/utils/deletionTombstone"
import type { CommentInfoInterface } from "@/types/comment"

const time = (c: CommentInfoInterface) => Date.parse(c.comment_created_at)

const reactionsOf = (c: CommentInfoInterface) => JSON.stringify(c.comment_reactions ?? [])

/**
 * A thread's replies once the server has answered: the answer is the truth for
 * the replies it covers (an edit shows, a reply deleted elsewhere goes), and a
 * reply the store holds that the answer cannot know about, because it arrived
 * live or was sent after the request began (`askedAt`), stays. Oldest first,
 * as the thread reads. The store's own array comes back when nothing changed,
 * so an answer that only confirms what is on screen re-draws nothing.
 */
export function reconcileReplies(
    stored: CommentInfoInterface[],
    answer: CommentInfoInterface[],
    askedAt?: number,
): CommentInfoInterface[] {
    return reconcileLatestWindow({
        existing: stored,
        incoming: answer,
        getId: (c) => c.comment_uuid,
        getCreatedAt: (c) => c.comment_created_at,
        contentDiffers: (current, server) =>
            current.comment_text !== server.comment_text ||
            (current.comment_updated_at ?? "") !== (server.comment_updated_at ?? "") ||
            (current.comment_attachments?.length ?? 0) !== (server.comment_attachments?.length ?? 0) ||
            reactionsOf(current) !== reactionsOf(server),
        sort: (a, b) => time(a) - time(b),
        authoritativeThrough: askedAt,
    })
}
