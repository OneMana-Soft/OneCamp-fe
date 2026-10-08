"use client"

// "Seen" under your latest message in a DM, "Seen by Maya and Jonas" in a
// group chat (lib/chat/readReceipts). The message list renders it in the
// newest message's row, so it sits right under that message, and the
// conversation is marked seen only while that row is on screen: a message
// scrolled out of view hasn't been seen. It reads the receipts and the typing
// state itself, so the memoised list never re-renders for one, and gives way
// to the typing indicator.

import { memo, useEffect, useMemo, useState } from "react"
import { useSelector } from "react-redux"
import { useChatReceipts, useMarkChatSeen } from "@/hooks/useChatReceipts"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { seenLine, type ChatTarget } from "@/lib/chat/readReceipts"
import { Eye } from "@/lib/icons"
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
  useMarkChatSeen(target, arrived)
  const receipts = useChatReceipts(target)
  const group = target.kind === "group" ? target.grpId : ""
  const people = useFetchOnlyOnce<RawUserDMInterface>(group ? `${GetEndpointUrl.GetDmGroupParticipants}/${group}` : "")

  const line = useMemo(() => {
    const others = (people.data?.data.dm_participants ?? []).filter((p) => p.user_uuid !== me && !p.is_bot)
    const nameOf = (uuid: string) => {
      const p = others.find((o) => o.user_uuid === uuid)
      return p?.user_full_name || p?.user_name || "Someone"
    }
    return seenLine(receipts.data?.data, latest ? { mine, createdAt: latest.chat_created_at } : undefined, {
      dm: target.kind === "dm",
      others: others.length,
      nameOf,
    })
  }, [receipts.data, people.data, latest, mine, me, target.kind])

  if (!line || typing) return null
  return (
    <p className="flex items-center justify-end gap-1 px-4 pb-1 text-2xs text-muted-foreground" title={line.title} aria-live="polite">
      <Eye className="h-3 w-3" aria-hidden />
      {line.text}
    </p>
  )
})
