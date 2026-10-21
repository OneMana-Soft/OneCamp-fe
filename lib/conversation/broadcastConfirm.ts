import type { Dispatch } from "@reduxjs/toolkit"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { confirmAction } from "@/hooks/useConfirm"
import { Megaphone } from "@/lib/icons"

// Asking before a broadcast (D-T12), loaded for a message with a broadcast
// chip (hooks/useBroadcastConfirm), never with the page.

/** The broadcasts a message's chips name, each once (business/Reach Parse). Pure. */
export function broadcastsIn(html: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of (html || "").matchAll(/data-id="broadcast:(channel|here|everyone)"/g)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** A channel's broadcast rules for the writer (GET …/broadcasts), as the question needs them. */
interface Rules {
  may: boolean
  members: number
  confirm_at: number
  reach?: Record<string, number>
}

/** The question's words for the people it notifies. Pure. */
export function broadcastQuestion(names: string[], reach: number, channel: string) {
  const who = names.includes("here") && names.length === 1 ? "everyone here now" : "everyone"
  return {
    title: `Notify ${reach.toLocaleString("en-GB")} ${reach === 1 ? "person" : "people"}?`,
    description: `@${names.join(" and @")} tells ${who} in ${channel ? `#${channel}` : "this channel"}, each by their notification settings.`,
  }
}

/**
 * Asks before a message notifies a whole channel: from the size the workspace
 * sets (chat.broadcast.confirm_at, 6), with how many it would notify now. A
 * message with no broadcast, a smaller channel, or a rules read that fails is
 * sent as it is; a broadcast the rules refuse is the server's to say.
 */
export async function askBeforeBroadcast(dispatch: Dispatch, channelId: string, channelName: string, html: string | null | undefined, send: () => void) {
  const names = broadcastsIn(html)
  if (!names.length || !channelId) return send()
  let rules: Rules | null = null
  try {
    const res = await axiosInstance.get<{ data: Rules }>(
      `/conversations/channel/${encodeURIComponent(channelId)}/broadcasts?reach=${names.join(",")}`,
      OWN_ERRORS,
    )
    rules = res.data?.data ?? null
  } catch {
    rules = null
  }
  if (!rules || !rules.may || rules.confirm_at <= 0 || rules.members < rules.confirm_at) return send()
  const reach = Math.max(0, ...names.map((n) => rules?.reach?.[n] ?? 0))
  dispatch(confirmAction({ ...broadcastQuestion(names, reach, channelName), confirmText: "Send", icon: Megaphone, onConfirm: send }))
}
