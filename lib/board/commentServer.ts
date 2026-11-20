import { BoardsPost } from "@/services/endpoints/boards"

/**
 * What the server keeps of a board's comments (components/board/boardComments),
 * a chunk of its own: fetched as someone places a comment or opens one, so the
 * board's first load carries none of it, and handed the board's post (usePost's),
 * so it reaches none of the shared core.
 */
/** The people a comment mentions (components/board/boardMentionInput), each told once. */
type Mentioned = { uuid: string }[]
const uuidsOf = (m: Mentioned) => Array.from(new Set((m || []).map((u) => u.uuid))).filter(Boolean)

type Post = (o: { apiEndpoint: string; payload: Record<string, unknown>; showErrorToast: boolean; failureTitle?: string }) => Promise<unknown>

/**
 * An editor's comment, written on the live board, mirrored to the server's
 * stores (activity, search, the AI assistant), keyed by the pin's id so an
 * edit upserts the same record; the people it mentions are told. Best-effort:
 * the comment is on the board already.
 */
export function mirrorComment(post: Post, board: string, c: { id: string; messages?: { body: string }[] }, mentioned: Mentioned) {
  const text = (c.messages || []).map((m) => m.body).join("\n").trim()
  if (!text) return
  return post({ apiEndpoint: BoardsPost.BoardCommentMention, payload: { board_uuid: board, board_comment_id: c.id, comment_text: text, mentioned_user_uuids: uuidsOf(mentioned) }, showErrorToast: false })
}

/** An editor's deleted comment taken out of those stores, so it stops turning up there. Best-effort. */
export function unmirrorComment(post: Post, board: string, id: string) {
  return post({ apiEndpoint: BoardsPost.BoardCommentDelete, payload: { board_uuid: board, board_comment_id: id }, showErrorToast: false })
}

/**
 * A commenter's comment (miro-32 Can comment): a pin, a reply, or deleting a
 * message of their own. The live board is read-only for them, so the server
 * writes it there as theirs (POST /board/comment) and keeps its record itself;
 * the pin comes back over the board's socket.
 */
export type CommentAsk =
  | { action: "add"; x: number; y: number; text: string; mentioned: Mentioned }
  | { action: "reply"; id: string; text: string; mentioned: Mentioned }
  | { action: "delete"; id: string; message: string }

/**
 * Asks the server for the change: the pin's id as it now is, nothing once it
 * went. A refusal (403 in words, a gone pin's 404, a full thread's 409) is the
 * post's own toast under `failureTitle`, in the server's words, and rejects.
 */
export async function askComment(post: Post, board: string, c: CommentAsk, failureTitle: string): Promise<string | undefined> {
  const answer = (await post({
    apiEndpoint: BoardsPost.BoardComment,
    payload: {
      board_uuid: board,
      action: c.action,
      ...(c.action === "add" ? { x: c.x, y: c.y } : { board_comment_id: c.id }),
      ...(c.action === "delete" ? { message_id: c.message } : { comment_text: c.text, mentioned_user_uuids: uuidsOf(c.mentioned) }),
    },
    showErrorToast: true,
    failureTitle,
  })) as { comment?: { id?: string } } | undefined
  return answer?.comment?.id
}
