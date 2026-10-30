/**
 * A task a create makes, as the screens show it until the server's answer
 * says otherwise. Pure, so the create form's own row and the Offline Store's
 * answers for a task made with no network (lib/offline) are one shape.
 */

import type { TaskInfoInterface } from "@/types/task"
import { isBuiltInStatus } from "@/lib/taskStatus"

const text = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * A task from its create's payload (createTask's, or createSubTask's, which
 * names its parent as task_uuid) under id. A project's own status is sent as
 * its id: the task carries it as its own status too, so it reads as picked.
 */
export function taskFromCreate(id: string, body: Record<string, unknown>, at: number = Date.now()): TaskInfoInterface {
  const status = text(body.task_status) || "todo"
  const assignee = text(body.task_assignee_uuid)
  return {
    task_uuid: id,
    task_name: text(body.task_name),
    task_description: text(body.task_description),
    task_status: status,
    task_custom_status: isBuiltInStatus(status) ? "" : status,
    task_priority: text(body.task_priority) || "medium",
    task_label: text(body.task_label),
    task_project: { project_uuid: text(body.task_project_uuid) },
    task_assignee: assignee ? { user_uuid: assignee } : undefined,
    task_due_date: text(body.task_due_date),
    task_start_date: text(body.task_start_date),
    task_created_at: new Date(at).toISOString(),
    task_sub_tasks: [],
    task_comments: [],
    task_attachments: Array.isArray(body.task_attachments) ? body.task_attachments : [],
  } as unknown as TaskInfoInterface
}
