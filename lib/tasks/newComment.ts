/**
 * A comment as a task's comments list holds it, from what its composer sent.
 * One shape for the list's own copy (store/slice/createTaskCommentSlice) and
 * the Offline Store's answers for a comment made with no network.
 */

import type { CommentInfoInterface } from "@/types/comment"
import type { UserProfileDataInterface } from "@/types/user"
import type { AttachmentMediaReq } from "@/types/attachment"

export function commentFrom(c: {
  id: string
  text: string
  by: UserProfileDataInterface
  createdAt: string
  attachments?: AttachmentMediaReq[]
}): CommentInfoInterface {
  return {
    comment_updated_at: "",
    comment_by: c.by,
    comment_created_at: c.createdAt,
    comment_text: c.text,
    comment_uuid: c.id,
    comment_attachments: c.attachments,
  }
}
