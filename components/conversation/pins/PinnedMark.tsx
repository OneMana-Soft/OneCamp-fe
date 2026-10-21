"use client"

import { memo } from "react"
import { useComposerTarget } from "@/components/conversation/ComposerHost"
import { usePins } from "@/components/conversation/pins/usePins"
import { rowConversation } from "@/lib/conversation/pins"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { displayNameOf } from "@/lib/personName"
import { GetEndpointUrl } from "@/services/endPoints"
import { Pin } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { UserProfileInterface } from "@/types/user"

/**
 * "Pinned by Maya" on a pinned message (chat B25), in the sun hue at the
 * meta size: beside the time on a message's name line, or as its own line
 * on a message that continues a turn. Its own small component, so a pin
 * changing redraws this and not the row. Nothing outside a conversation.
 */
export const PinnedMark = memo(function PinnedMark({ messageId, line = false }: { messageId?: string; line?: boolean }) {
  const conversation = rowConversation(useComposerTarget(), messageId)
  const pin = usePins(conversation).byMessage.get(messageId ?? "")
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
  if (!pin) return null
  const by = pin.pinned_by.user_uuid && pin.pinned_by.user_uuid === self ? "you" : displayNameOf(pin.pinned_by) || "someone"
  return (
    <span
      data-pinned=""
      title={`Pinned by ${by}`}
      className={cn("flex min-w-0 shrink items-center gap-1 text-meta font-medium text-camp-sun-ink", line && "mb-0.5 h-5")}
    >
      <Pin className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        Pinned<span className="hidden sm:inline"> by {by}</span>
      </span>
    </span>
  )
})
