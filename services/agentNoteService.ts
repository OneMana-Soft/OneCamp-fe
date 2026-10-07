import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { browserTZ } from "@/lib/utils/timeZone"

/** What leaving today's note did. */
interface AgentNoteResult {
  posted: boolean
  /** The DM to open: /app/chat/{bot_uuid}. */
  bot_uuid?: string
  items: number
}

/** Leaves today's note; zone is the device's, so the note says due times as its clock shows them. */
export async function leaveDailyNote(day: string, zone: string = browserTZ()): Promise<AgentNoteResult> {
  const res = await axiosInstance.post(PostEndpointUrl.LeaveAgentNote, { day, zone })
  return res.data?.data as AgentNoteResult
}

export async function getAgentNoteEnabled(): Promise<boolean> {
  const res = await axiosInstance.get(GetEndpointUrl.AgentNotePreference)
  return !!res.data?.data?.enabled
}

export async function setAgentNoteEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAgentNotePreference, { enabled })
}
