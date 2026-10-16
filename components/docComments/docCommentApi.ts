/**
 * A doc comment's own routes, by the comment's id (docs programme B7): an
 * edit, a removal, a reaction. Starting a thread and replying go through the
 * threads API (components/threads/threadsApi), never the old create route: a
 * reply sent there would become a page comment, and the whole doc would be
 * told about it (A6).
 *
 * Each call answers for itself and throws with the server's message for the
 * person, so a reaction on its way never stops a comment being sent (N45:
 * one shared "submitting" flag made Send do nothing).
 */
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import { uploadAttachment } from "@/lib/upload"

export async function editComment(commentId: string, html: string): Promise<void> {
    await axiosInstance.post(PostEndpointUrl.UpdateDocComment, { doc_comment_uuid: commentId, doc_comment_body: html })
}

/** Its author may remove it; so may the doc's owner, its full-access people and admins (A5). */
export async function removeComment(docId: string, commentId: string): Promise<void> {
    await axiosInstance.post(PostEndpointUrl.RemoveDocComment, { doc_uuid: docId, doc_comment_uuid: commentId })
}

/** Adds a reaction, or changes one's emoji (its id given). Answers the reaction's id. */
export async function reactToComment(commentId: string, emojiId: string, reactionId?: string): Promise<string> {
    const r = await axiosInstance.post<{ data?: { reaction_dgraph_id?: string } }>(PostEndpointUrl.CreateOrUpdateDocCommentReaction, {
        comment_id: commentId,
        reaction_emoji_id: emojiId,
        reaction_dgraph_id: reactionId || "",
    })
    return r.data?.data?.reaction_dgraph_id || reactionId || ""
}

export async function removeReaction(commentId: string, reactionId: string): Promise<void> {
    await axiosInstance.post(PostEndpointUrl.RemoveDocCommentReaction, { comment_id: commentId, reaction_dgraph_id: reactionId })
}

/** Stores a file for a comment on a doc, as the doc's attachments are stored; answers its id. */
export function uploadCommentFile(docId: string, file: File, progress: (pct: number) => void, signal: AbortSignal): Promise<string> {
    return uploadAttachment({ key: "doc", value: docId }, file, progress, signal)
}
