/**
 * Workspace Memory service — wraps the /ai/memory endpoints.
 *
 * The memory layer is the structured complement to AI search: decisions,
 * commitments, and open questions the AI extracted from meetings/content,
 * each permission-scoped to the channels/projects/DMs the user can see.
 * This service powers the "what does my workspace know" surface.
 */

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

export type MemoryKind = "decision" | "commitment" | "question" | "glossary"
export type MemoryStatus = "open" | "resolved" | "superseded" | "dismissed"

export interface MemoryItem {
  id: string
  kind: MemoryKind
  content: string
  status: MemoryStatus
  owner_user_id?: string
  due_at?: string
  channel_uuid?: string
  project_uuid?: string
  chat_grp_id?: string
  source_type: string
  source_uuid?: string
  confidence: number
  created_at: string
  updated_at: string

  // Resolved scope display, populated server-side and permission-safe.
  // scope_type tells the UI how to render/route the backlink; scope_label
  // is the human name (channel/project name, group participants, or DM
  // peer). channel_name/project_name are the typed convenience fields.
  scope_type?: "channel" | "project" | "group" | "dm"
  scope_label?: string
  channel_name?: string
  project_name?: string
}

export interface MemoryListResult {
  items: MemoryItem[]
  counts: Record<string, number> // open count per kind
}

export async function listWorkspaceMemory(
  kinds?: MemoryKind[],
  statuses?: MemoryStatus[],
  channelUUID?: string,
): Promise<MemoryListResult> {
  const params = new URLSearchParams()
  if (kinds && kinds.length) params.set("kind", kinds.join(","))
  if (statuses && statuses.length) params.set("status", statuses.join(","))
  if (channelUUID) params.set("channel", channelUUID)
  const qs = params.toString()
  const url = qs ? `${GetEndpointUrl.GetWorkspaceMemory}?${qs}` : GetEndpointUrl.GetWorkspaceMemory
  const res = await axiosInstance.get(url)
  return res.data?.data ?? { items: [], counts: {} }
}

export async function updateMemoryStatus(id: string, status: MemoryStatus): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.UpdateMemoryStatus}/${encodeURIComponent(id)}/status`,
    { status },
  )
}

export interface CaptureMemoryInput {
  kind: Exclude<MemoryKind, "glossary">
  content: string
  source_type: string
  source_uuid: string
  channel_uuid?: string
  chat_grp_id?: string
  // Optional due date for a commitment ("YYYY-MM-DD"). Ignored for other kinds.
  due?: string
}

// captureMemory saves a message as a structured memory item (user-initiated).
export async function captureMemory(input: CaptureMemoryInput): Promise<MemoryItem> {
  const res = await axiosInstance.post(PostEndpointUrl.CaptureMemory, input)
  return res.data?.data
}

// updateMemoryDue sets (due = "YYYY-MM-DD") or clears (due = "") a commitment's
// due date. Only valid for commitments; the backend rejects other kinds.
export async function updateMemoryDue(id: string, due: string): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.UpdateMemoryStatus}/${encodeURIComponent(id)}/due`,
    { due },
  )
}

// ─── Agentic actions on memory ────────────────────────────────────────────

export interface MemoryActionResult {
  success: boolean
  message: string
  action_data?: Record<string, string>
}

export async function createTaskFromMemory(
  id: string,
  input: { project_uuid: string; assignee_uuid?: string; priority?: string },
): Promise<MemoryActionResult> {
  const res = await axiosInstance.post(
    `${PostEndpointUrl.MemoryCreateTask.replace("{id}", encodeURIComponent(id))}`,
    input,
  )
  return res.data?.data
}

export async function remindAboutMemory(id: string, startTime: string): Promise<MemoryActionResult> {
  const res = await axiosInstance.post(
    `${PostEndpointUrl.MemoryRemind.replace("{id}", encodeURIComponent(id))}`,
    { start_time: startTime },
  )
  return res.data?.data
}

// ─── Personal briefing ──────────────────────────────────────────────────

export interface BriefingHighlight {
  content_type: string
  content_uuid: string
  channel_uuid?: string
  channel_name?: string
  author_name?: string
  snippet: string
  chat_grp_id?: string
  chat_by_user_id?: string
  chat_to_user_id?: string
  post_uuid?: string
  task_uuid?: string
  doc_uuid?: string
}

export interface BriefingDayItem {
  source: string // "calendar" | "github" | "gmail"
  kind: string   // "event" | "pr" | "issue" | "email"
  title: string
  subtitle?: string
  url?: string
}

export interface BriefingResult {
  enabled: boolean
  open_items: MemoryItem[]
  highlights: BriefingHighlight[]
  day_items?: BriefingDayItem[]
}

export async function getBriefing(): Promise<BriefingResult> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAIBriefing)
  return res.data?.data ?? { enabled: false, open_items: [], highlights: [], day_items: [] }
}

// ─── Channel memory exclusion (trust control) ─────────────────────────────

export async function getChannelMemoryExclusion(channelUUID: string): Promise<boolean> {
  const res = await axiosInstance.get(
    `${GetEndpointUrl.GetChannelMemoryExclusion}?channel=${encodeURIComponent(channelUUID)}`,
    // silent: this read is access-gated to channel members/admins on the
    // backend. Callers (the memory panel) treat a 403/404 as "not an admin /
    // no access → just hide the toggle", so suppress the global error toast
    // and loading bar — a denied read here is an expected, benign outcome.
    { silent: true } as never,
  )
  return !!res.data?.data?.excluded
}

export async function setChannelMemoryExclusion(channelUUID: string, excluded: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetChannelMemoryExclusion, {
    channel_uuid: channelUUID,
    excluded,
  })
}

export async function deleteMemoryItem(id: string): Promise<void> {
  await axiosInstance.delete(`${PostEndpointUrl.DeleteMemoryItem}/${encodeURIComponent(id)}`)
}
