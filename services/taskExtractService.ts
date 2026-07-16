/**
 * Action-item extraction — wraps /ai/extract-tasks(/create).
 *
 * extract: the assistant reads a conversation (channel/dm/group) or pasted
 * text and proposes candidate tasks (owner/due/priority). create: the user
 * batch-approves and the chosen tasks are created in a target project AS them
 * (project-admin enforced server-side). Read-then-approve: nothing is created
 * until the user confirms.
 */

import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

export type ExtractSourceType = "channel" | "dm" | "group" | "meeting" | "text"

export interface ProposedTask {
  title: string
  description?: string
  assignee_name?: string
  assignee_uuid?: string
  due?: string // RFC3339
  priority?: string // low | medium | high
}

export interface ExtractTasksResult {
  enabled: boolean
  tasks: ProposedTask[]
  note?: string
  // How many recent messages / transcript lines the assistant scanned to
  // produce this proposal. Powers a transparent "scanned N recent messages"
  // caption. 0 (or absent) for pasted-text sources.
  scanned_count?: number
}

export interface ExtractTasksInput {
  source_type: ExtractSourceType
  source_id?: string
  text?: string
}

export async function extractTasks(input: ExtractTasksInput): Promise<ExtractTasksResult> {
  const res = await axiosInstance.post(PostEndpointUrl.AIExtractTasks, input)
  return res.data?.data ?? { enabled: false, tasks: [] }
}

export interface CreateTasksResult {
  created: number
  failed: number
}

export async function createTasksFromExtraction(
  projectUUID: string,
  tasks: ProposedTask[],
): Promise<CreateTasksResult> {
  const res = await axiosInstance.post(PostEndpointUrl.AIExtractTasksCreate, {
    project_uuid: projectUUID,
    tasks,
  })
  return res.data?.data ?? { created: 0, failed: 0 }
}
