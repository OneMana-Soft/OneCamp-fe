"use client"

import { memo } from "react"
import { displayNameOf } from "@/lib/personName"
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor"
import { getLastMessagePreview } from "@/lib/utils/lastMessagePreview"
import { ChatFace } from "@/components/message/chatFace"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * The line above a reply naming what it answers (design v3 chat, C23): a
 * curved connector out of the avatar column, the parent's 16px face, its
 * author at 13/510 and the start of what they said. The face carries the
 * person's hue, so the 2px hued bar it had is gone (Discord's pattern, and
 * quieter). A click jumps to the parent and lights it.
 */
export const ReplyLine = memo(function ReplyLine({
    by,
    text,
    onJump,
    prefix,
}: {
    by?: UserProfileDataInterface
    text?: string
    onJump: () => void
    /** "replied to a thread:" when a thread reply was also sent to the channel (C37). */
    prefix?: string
}) {
    const relayed = useRelayedAuthor(by, text)
    const name = relayed ? relayed.name : displayNameOf(by) || "Someone"
    const body = relayed ? relayed.body : text
    return (
        <button
            type="button"
            data-reply-line=""
            onClick={onJump}
            aria-label={`Replying to ${name}. Jump to their message`}
            className="group/reply relative mb-0.5 flex h-5 max-w-full items-center gap-1.5 rounded-[5px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
            {/* The connector: a small curve out of the gutter's edge into the
                line, ink-4, as a reply hangs off what it answers. */}
            <span aria-hidden="true" className="pointer-events-none absolute -left-[13px] top-[10px] h-[9px] w-[10px] rounded-tl-[5px] border-l-[1.5px] border-t-[1.5px] border-ink-4" />
            <ChatFace name={name} profileKey={by?.user_profile_object_key} userUUID={by?.user_uuid} isBot={!!by?.is_bot && !relayed} relayed={!!relayed} size={16} />
            <span className="shrink-0 text-ui-sm font-medium text-ink-2 group-hover/reply:text-ink">{name}</span>
            {prefix && <span className="shrink-0 text-ui-sm text-ink-3">{prefix}</span>}
            <span className="min-w-0 truncate text-ui-sm text-ink-3 group-hover/reply:text-ink-2">{getLastMessagePreview(body)}</span>
        </button>
    )
})
