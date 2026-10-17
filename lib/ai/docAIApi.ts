/**
 * Doc AI's routes beside the bar's stream (docs programme B9; router/docsAI.go
 * on the API). The paths live here, not in services/endPoints.ts, which every
 * route loads: this module loads with the bar.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { DocAIActionId, DocAIModel } from "@/lib/ai/docAIActions"

export const DOC_AI_PATHS = {
  model: "/doc/ai/model",
  starters: "/doc/ai/starters",
  applied: "/doc/ai/applied",
  activity: "/doc/ai/activity",
  tasks: "/doc/ai/tasks",
  tasksCreate: "/doc/ai/tasks/create",
  agentEdits: "/doc/ai/agent-edits",
  revert: "/doc/ai/agent-edits/revert",
} as const

export async function getDocAIModel(): Promise<DocAIModel | null> {
  const res = await axiosInstance.get(DOC_AI_PATHS.model, OWN_ERRORS)
  const data = res.data?.data as { enabled?: boolean; model?: DocAIModel } | undefined
  return data?.enabled && data.model ? data.model : null
}

export interface DocProject {
  uuid: string
  name: string
  open_tasks: number
}

export async function getDocAIStarters(docId: string): Promise<DocProject | null> {
  const res = await axiosInstance.get(`${DOC_AI_PATHS.starters}?doc_uuid=${encodeURIComponent(docId)}`, OWN_ERRORS)
  return (res.data?.data?.project as DocProject | null) ?? null
}

/** An accepted AI edit, as the record keeps it: never its text. */
interface AppliedEdit {
  doc_uuid: string
  action: DocAIActionId
  model: string
  local: boolean
  changes: number
  of: number
  inserted: boolean
  before_hash: string
  after_hash: string
  chars: number
}

export async function recordAppliedEdit(edit: AppliedEdit): Promise<void> {
  await axiosInstance.post(DOC_AI_PATHS.applied, edit, OWN_ERRORS)
}

export interface DocAIActivityItem {
  at: string
  action: string
  status?: "allowed" | "refused" | ""
  summary: string
  actor?: string
  actor_kind?: string
  agent_id?: string
  agent_name?: string
  run_id?: string
  model?: string
  local?: boolean
  seq: number
  prev_hash?: string
  entry_hash?: string
}

export async function getDocAIActivity(docId: string): Promise<DocAIActivityItem[]> {
  const res = await axiosInstance.get(`${DOC_AI_PATHS.activity}?doc_uuid=${encodeURIComponent(docId)}`, OWN_ERRORS)
  return (res.data?.data as DocAIActivityItem[] | null) ?? []
}

export interface DocTask {
  title: string
  description?: string
  assignee_name?: string
  assignee_uuid?: string
  due?: string
  priority?: string
  block_id?: string
  quote?: string
}

interface DocTasksFound {
  enabled: boolean
  tasks: DocTask[]
  note?: string
  lines?: number
  project?: DocProject | null
}

export async function findDocTasks(docId: string): Promise<DocTasksFound> {
  const res = await axiosInstance.post(DOC_AI_PATHS.tasks, { doc_uuid: docId }, OWN_ERRORS)
  return res.data?.data as DocTasksFound
}

export interface DocTasksMade {
  created: number
  failed: number
  tasks: Array<{ task_uuid: string; title: string; block_id?: string }>
  project: { uuid: string; name: string }
}

export async function makeDocTasks(docId: string, projectId: string, tasks: DocTask[]): Promise<DocTasksMade> {
  const res = await axiosInstance.post(DOC_AI_PATHS.tasksCreate, { doc_uuid: docId, project_uuid: projectId, tasks }, OWN_ERRORS)
  return res.data?.data as DocTasksMade
}

export interface AgentEdit {
  edit_id: string
  run_id?: string
  agent_id?: string
  agent_name: string
  asker_uuid?: string
  asker_name?: string
  op: string
  block_ids: string[]
  at: string
  reverted: boolean
  can_revert: boolean
}

export async function getAgentEdits(docId: string): Promise<AgentEdit[]> {
  const res = await axiosInstance.get(`${DOC_AI_PATHS.agentEdits}?doc_uuid=${encodeURIComponent(docId)}`, OWN_ERRORS)
  return (res.data?.data as AgentEdit[] | null) ?? []
}

/** The answer to a revert: done, or edited since (ask first), or a reason. */
type RevertAnswer = { ok: true; reverted: number } | { ok: false; editedSince: boolean; message: string }

export async function revertAgentEdit(docId: string, which: { edit_id?: string; run_id?: string }, force = false): Promise<RevertAnswer> {
  try {
    const res = await axiosInstance.post(DOC_AI_PATHS.revert, { doc_uuid: docId, ...which, force }, OWN_ERRORS)
    return { ok: true, reverted: Number(res.data?.data?.reverted ?? 0) }
  } catch (e) {
    const data = (e as { response?: { status?: number; data?: { msg?: string; edited_since?: boolean } } })?.response
    return {
      ok: false,
      editedSince: data?.status === 409 && !!data.data?.edited_since,
      message: apiErrorMessage(e, "The revert couldn't be made just now. Try again in a moment."),
    }
  }
}
