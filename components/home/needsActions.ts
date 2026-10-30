/**
 * The acts "What needs me now" can do without AI (hub.md H9): tick a task done
 * and answer a mention in its thread, through the same endpoints the task list
 * and the thread's composer use.
 */
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import type { NeedsActions } from "@/components/home/NeedsMeSection"
import type { NeedsItem } from "@/components/home/needsMe"

/** Sets a task's status, as the task list does. */
export async function setTaskStatus(item: NeedsItem, status: string): Promise<void> {
  if (!item.taskUuid) throw new Error("the task is gone")
  await axiosInstance.post(PostEndpointUrl.UpdateTaskStatus, {
    task_status: status,
    task_uuid: item.taskUuid,
    task_project_uuid: item.projectUuid,
  })
}

/** Ticks a task done. */
export const markTaskDone = (item: NeedsItem) => setTaskStatus(item, "done")

/** Done's Undo: the task back in the status it had. */
export const markTaskUndone = (item: NeedsItem) => setTaskStatus(item, item.statusValue || "todo")

/** Answers a mention in its thread, as the thread's own composer does. */
export async function replyInThread(item: NeedsItem, text: string): Promise<void> {
  if (!item.postUuid) throw new Error("nothing to reply to")
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  await axiosInstance.post(PostEndpointUrl.CreatePostComment, {
    post_id: item.postUuid,
    comment_text_html: `<p>${esc}</p>`,
    comment_attachments: [],
  })
}

export const SHARED_ACTIONS: NeedsActions = { onDone: markTaskDone, onUndoDone: markTaskUndone, onReply: replyInThread }

