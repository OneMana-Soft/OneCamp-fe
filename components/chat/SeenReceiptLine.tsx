"use client"

// "Seen" under your latest message in a DM, "Seen by Maya and Jonas" in a
// group chat (lib/chat/readReceipts). The message list renders it in the
// newest message's row, so it sits right under that message, and the
// conversation is marked seen only while that row is on screen: a message
// scrolled out of view hasn't been seen. It reads the receipts and the typing
// state itself, so the memoised list never re-renders for one, and gives way
// to the typing indicator.

import { displayNameOf } from "@/lib/personName"
import { memo, useEffect, useMemo, useState } from "react"
import { useSelector } from "react-redux"
import { useChatReceipts, useMarkChatSeen } from "@/hooks/useChatReceipts"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { groupingIdOf, type ChatTarget } from "@/lib/chat/conversation"
import { seenLine } from "@/lib/chat/readReceipts"
import { Eye } from "@/lib/icons"
import { ChatFace } from "@/components/message/chatFace"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ChatInfo } from "@/types/chat"
import type { RootState } from "@/store/store"
import type { RawUserDMInterface, UserProfileInterface } from "@/types/user"

export const SeenReceiptLine = memo(function SeenReceiptLine({
  target,
  latest,
}: {
  target: ChatTarget
  /** The conversation's newest message, the one whose row this is in. */
  latest: ChatInfo | undefined
}) {
  const typing = useSelector((state: RootState) =>
    target.kind === "dm" ? (state.typing.chatTyping[target.otherUUID]?.length ?? 0) > 0 : (state.typing.groupChatTyping[target.grpId]?.length ?? 0) > 0,
  )
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data.user_uuid
  const mine = !!latest && !!me && latest.chat_from?.user_uuid === me
  // The newest message from someone else: when it changes, the conversation is marked seen again.
  const [arrived, setArrived] = useState("")
  useEffect(() => {
    if (latest && me && !mine) setArrived(latest.chat_uuid)
  }, [latest, me, mine])
  // Your own message is the newest: sending it marked the conversation seen.
  useMarkChatSeen(me && !mine ? target : null, arrived, me ? groupingIdOf(target, me) : "")
  const receipts = useChatReceipts(target)
  const group = target.kind === "group" ? target.grpId : ""
  const people = useFetchOnlyOnce<RawUserDMInterface>(group ? `${GetEndpointUrl.GetDmGroupParticipants}/${group}` : "")

  const line = useMemo(() => {
    const others = (people.data?.data.dm_participants ?? []).filter((p) => p.user_uuid !== me && !p.is_bot)
    const nameOf = (uuid: string) => {
      const p = others.find((o) => o.user_uuid === uuid)
      return displayNameOf(p) || "Someone"
    }
    return seenLine(receipts.data?.data, latest ? { mine, createdAt: latest.chat_created_at } : undefined, {
      dm: target.kind === "dm",
      others: others.length,
      nameOf,
    })
  }, [receipts.data, people.data, latest, mine, me, target.kind])

  const other = useFetchOnlyOnce<UserProfileInterface>(target.kind === "dm" ? `${GetEndpointUrl.SelfProfile}/${target.otherUUID}` : "").data?.data
  if (!line || typing) return null
  // Under your last message, where its words start (design v3 chat, C32):
  // in a DM the other person's 14px face and "Seen 10:42" at 12px ink-3; a
  // group keeps the eye and its names. Messages here read from the left, so
  // the spec's right edge put it a sheet's width from the message it is about
  // (700px away on a short one at 1440); on the text column it reads as that
  // message's own status. It fades in where it now belongs, never travels.
  return (
    <p data-seen-receipt="" className="flex animate-fade-in items-center gap-1.5 pb-1 pl-[68px] pr-6 text-meta text-ink-3" title={line.title} aria-live="polite">
      {target.kind === "dm" && other ? (
        <ChatFace name={displayNameOf(other)} profileKey={other.user_profile_object_key} userUUID={other.user_uuid} size={14} />
      ) : (
        <Eye className="size-3" aria-hidden />
      )}
      {line.text}
    </p>
  )
})
