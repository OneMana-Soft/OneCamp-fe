import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

/** What leaving today's note did. */
export interface AgentNoteResult {
  posted: boolean
  /** The DM to open: /app/chat/{bot_uuid}. */
  bot_uuid?: string
  items: number
}

/** The member's calendar day as their device sees it: YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function leaveDailyNote(day: string): Promise<AgentNoteResult> {
  const res = await axiosInstance.post(PostEndpointUrl.LeaveAgentNote, { day })
  return res.data?.data as AgentNoteResult
}

export async function getAgentNoteEnabled(): Promise<boolean> {
  const res = await axiosInstance.get(GetEndpointUrl.AgentNotePreference)
  return !!res.data?.data?.enabled
}

export async function setAgentNoteEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAgentNotePreference, { enabled })
}
