import { openUI } from "@/store/slice/uiSlice"
import { messageLink } from "@/lib/utils/later"
import { taskDraftFromMessage, type TaskSource } from "@/lib/task/messageToTask"

/** A message a task can be made from, as each surface knows it. */
export interface MessageRef {
  html?: string
  authorName?: string
  channelUUID?: string
  postUUID?: string
  chatUUID?: string
  groupUUID?: string
  chatMessageID?: string
}

/**
 * The action that opens the task form drafted from a message: one path for the
 * desktop menu and every mobile long-press drawer. Null when the message has no
 * link to come back to (it cannot be quoted as a source then).
 */
export function makeTaskAction(msg: MessageRef, origin: string) {
  const path = messageLink(msg)
  if (!path) return null
  const source: TaskSource = {
    postUUID: msg.postUUID || undefined,
    chatMessageID: msg.postUUID ? undefined : msg.chatMessageID || undefined,
    link: origin + path,
    authorName: msg.authorName,
  }
  return openUI({ key: "createTask", data: { draft: taskDraftFromMessage(msg.html, source), source } })
}
