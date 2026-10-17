"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { FEATURE_AI, useFeature } from "@/hooks/useClientConfig"

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
