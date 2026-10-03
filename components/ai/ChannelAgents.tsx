"use client"

import { useDispatch } from "react-redux"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { withAI } from "@/components/common/withFeature"
import { FEATURE_AI, useFeature } from "@/hooks/useClientConfig"
import { Sparkles } from "@/lib/icons"

export interface ChannelAgent {
  bot_user_id: string
  name: string
  description?: string
}

/**
 * The active agents in a channel, for its members. One cached request shared by
 * the header and the composer. Empty when AI is off, so callers need no gate.
 */
export function useChannelAgents(channelId: string, isMember: boolean): ChannelAgent[] {
  const aiAvailable = useFeature(FEATURE_AI)
  const { data } = useFetch<{ data: ChannelAgent[] }>(
    aiAvailable && channelId && isMember ? `${GetEndpointUrl.GetChannelAgents}/${channelId}` : "",
    undefined,
    { revalidateOnFocus: false },
    { suppressErrorToast: true } as never,
  )
  return data?.data ?? []
}

/** How many agents are named before the rest fold into "+N". */
const SHOWN = 2

/**
 * The agents in a channel, on the header's second line: "4 members · ✦ Release
 * Captain". Each name opens the agent's card (who it acts for, what it may do,
 * whether it was stopped). An agent nobody knows is there is an agent nobody
 * asks; this is where people already look when they open a channel.
 */
function ChannelAgents({ channelId, isMember }: { channelId: string; isMember: boolean }) {
  const dispatch = useDispatch()
  const agents = useChannelAgents(channelId, isMember)
  if (agents.length === 0) return null

  const open = (userUUID: string) => dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
  const rest = agents.length - SHOWN

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {/* Margins, not spaces: a flex row drops the whitespace around the dot. */}
      <span aria-hidden="true" className="mx-1">·</span>
      <Sparkles className="h-3 w-3 shrink-0 text-agent" aria-hidden="true" />
      {agents.slice(0, SHOWN).map((a, i) => (
        <span key={a.bot_user_id} className="inline-flex min-w-0 items-center">
          {i > 0 && <span aria-hidden="true" className="mr-1">,</span>}
          <button
            type="button"
            onClick={() => open(a.bot_user_id)}
            title={a.description || `About ${a.name}`}
            className="truncate rounded-sm text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {a.name}
          </button>
        </span>
      ))}
      {rest > 0 && <span className="ml-1 shrink-0">+{rest}</span>}
    </span>
  )
}

export default withAI(ChannelAgents)
