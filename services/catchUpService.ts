/**
 * Catch-up service — wraps POST /ai/catch-up.
 *
 * "Catch me up" answers "what did I miss" for a scope (a channel, a DM/group
 * conversation, or the whole workspace) since the user last looked. It's the
 * push counterpart to AskAI's pull: an AI recap of just the unread window,
 * permission-scoped on the server. The FE surfaces it as a calm, on-demand
 * action that self-hides when there's nothing unread.
 */

import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

export type CatchUpScope = "channel" | "chat" | "workspace"

export interface CatchUpRequest {
  scope_type: CatchUpScope
  channel_uuid?: string
  chat_grp_id?: string
  to_user_uuid?: string
  timezone?: string
  location?: string
  local_time?: string
}

export interface CatchUpResult {
  enabled: boolean
  has_unread: boolean
  summary: string
  message_count: number
  scope_type: CatchUpScope
  scope_name?: string
  since?: string
  provider?: string
}

const EMPTY: CatchUpResult = {
  enabled: false,
  has_unread: false,
  summary: "",
  message_count: 0,
  scope_type: "workspace",
}

// localizationFields mirrors the other AI calls so the recap can resolve
// relative times ("this morning") in the user's timezone.
function localizationFields(): Pick<CatchUpRequest, "timezone" | "location" | "local_time"> {
  try {
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      local_time: new Date().toISOString(),
    }
  } catch {
    return {}
  }
}

export async function getCatchUp(req: CatchUpRequest): Promise<CatchUpResult> {
  const res = await axiosInstance.post(PostEndpointUrl.AICatchUp, {
    ...localizationFields(),
    ...req,
  })
  return (res.data?.data as CatchUpResult) ?? EMPTY
}
