"use client"

import { useCallback, useState } from "react"
import { useDispatch } from "react-redux"

import { WelcomeCard } from "@/components/onboarding/WelcomeCard"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { displayNameOf } from "@/lib/personName"
import { GetEndpointUrl } from "@/services/endPoints"
import { updateChannelInputText } from "@/store/slice/channelSlice"
import type { ChannelInfoInterfaceResp } from "@/types/channel"
import type { UserProfileInterface } from "@/types/user"

/**
 * A channel's send, watched for the welcome card (admin E5): the card
 * collapses once the new member's first message goes.
 */
export function useWelcomeSend<T>(send: (latestContent?: string) => T): [(latestContent?: string) => T, boolean] {
  const [sent, setSent] = useState(false)
  const wrapped = useCallback(
    (latestContent?: string) => {
      const result = send(latestContent)
      if (result !== false) setSent(true)
      return result
    },
    [send],
  )
  return [wrapped, sent]
}

/**
 * The welcome card in a channel's feed, on a new member's first landing
 * (useComposeOnArrival), on a computer and a phone alike: the channel's
 * people, and chips that fill this channel's message box.
 */
export function ChannelWelcome({
  channelId,
  channelName,
  info,
  show,
  sent,
  className,
}: {
  channelId: string
  channelName: string
  info?: ChannelInfoInterfaceResp["channel_info"]
  show?: boolean
  sent: boolean
  className?: string
}) {
  const dispatch = useDispatch()
  const self = useFetchOnlyOnce<UserProfileInterface>(show ? GetEndpointUrl.SelfProfile : "")
  if (!show || !info?.ch_is_member) return null
  return (
    <div className={className}>
      <WelcomeCard
        channelName={channelName}
        me={displayNameOf(self.data?.data)}
        people={(info.ch_members || []).filter((m) => !m.is_bot).map((m) => ({ id: m.user_uuid, name: displayNameOf(m) }))}
        total={info.ch_member_count}
        sent={sent}
        onSuggest={(text) => dispatch(updateChannelInputText({ channelId, inputTextHTML: `<p>${text}</p>` }))}
      />
    </div>
  )
}
