/**
 * Where a notice about a channel or a conversation opens (an agent's moment,
 * a mention a message gained): at its message, while its reader can open the
 * place. A leaf, so Home's "needs me" takes it without the Inbox's words.
 */
import type { NoticeItem } from "@/types/activity"
import { route } from "@/lib/conversation/route"
import { chatPath } from "@/lib/routes/conversationRoute"

/** A channel's or a conversation's notice's path, or null: another kind's, or a place its reader can't open now. Pure. */
export function messageNoticeHref(n: NoticeItem | undefined, viewer?: string): string | null {
  if (n?.resource_kind === "channel") {
    return n.can_open && n.resource_uuid ? route({ conversation: { kind: "channel", id: n.resource_uuid }, ...(n.data?.post_id ? { message: n.data.post_id } : {}) }) : null
  }
  if (n?.resource_kind === "conversation") return n.can_open ? chatPath(n.resource_uuid, viewer, n.data?.message_id) : null
  return null
}
