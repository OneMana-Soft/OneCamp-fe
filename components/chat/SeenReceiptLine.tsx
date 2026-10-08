"use client"

// "Seen" under your latest message in a DM, "Seen by Maya and Jonas" in a
// group chat (lib/chat/readReceipts). It reads the receipts itself, so the
// memoised message list never re-renders for one, and marks the conversation
// seen while it's on screen. It gives way to the typing indicator.

import { memo, useEffect, useMemo, useState } from "react"
import { useChatReceipts, useMarkChatSeen } from "@/hooks/useChatReceipts"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { seenLine, type ChatTarget } from "@/lib/chat/readReceipts"
import { Eye } from "@/lib/icons"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ChatInfo } from "@/types/chat"
import type { RawUserDMInterface, UserProfileInterface } from "@/types/user"

export const SeenReceiptLine = memo(function SeenReceiptLine({
  target,
  latest,
  hidden,
}: {
  target: ChatTarget
  /** The conversation's newest message. */
  latest: ChatInfo | undefined
  /** Someone is typing: the typing indicator has the spot. */
  hidden: boolean
}) {
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

  if (!line || hidden) return null
  // Where the typing indicator sits (TypingIndicatorBar): under the list on a
  // desktop, just above the composer's drawer on a phone.
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[100] px-3 pb-1 md:pointer-events-auto md:static md:inset-x-auto md:z-auto md:shrink-0"
      style={{ bottom: "var(--mobile-drawer-h, 126px)" }}
    >
      <p className="flex items-center justify-end gap-1 px-1 text-2xs text-muted-foreground" title={line.title} aria-live="polite">
        <Eye className="h-3 w-3" aria-hidden />
        {line.text}
      </p>
    </div>
  )
})
