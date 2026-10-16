"use client"

/**
 * A thread as the phone's comments page lists it (docs programme B7): the
 * words it is on, who started it and what they said, how many replies, and
 * whether there is news. The whole row opens the thread's own page, which is
 * live (N33).
 */
import Link from "next/link"
import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { plainText } from "@/lib/chat/pendingSend"
import { displayNameOf } from "@/lib/personName"
import { formatFullTimestamp, formatListTimestamp, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import type { ThreadView } from "@/components/threads/types"
import { onPage, quoteLine, threadLabel } from "./threadView"
import { UnreadDot } from "./UnreadDot"

export function ThreadRow({ docId, thread }: { docId: string; thread: ThreadView }) {
    const first = thread.comments[0]
    const last = thread.comments[thread.comments.length - 1]
    const replies = thread.comments.length - 1
    const by = first?.comment_by
    const name = displayNameOf(by) || "Someone"
    const said = plainText(first?.comment_text) || ((first?.comment_attachments?.length ?? 0) > 0 ? "Attached a file" : "")
    return (
        <Link
            href={`/app/doc/${docId}/comment/${encodeURIComponent(thread.id)}`}
            data-thread-row=""
            data-thread-id={thread.id}
            aria-label={threadLabel(thread)}
            className="content-rise flex flex-col gap-1.5 rounded-xl bg-sunken px-3.5 py-3 transition-colors duration-[140ms] ease-out active:bg-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
            {!onPage(thread) && (
                <span className="line-clamp-2 border-l-2 border-camp-sun pl-2 text-ui-sm text-ink-2">{quoteLine(thread.anchor.quote) || "This block"}</span>
            )}
            <span className="flex min-w-0 items-center gap-2">
                <span className="size-6 shrink-0">
                    <ChannelMessageAvatar userName={name} userProfileKey={by?.user_profile_object_key} isBot={!!by?.is_bot} userUUID={by?.user_uuid} />
                </span>
                <span className="truncate text-ui font-medium text-ink">{name}</span>
                {last && (
                    <time
                        dateTime={isoTimestamp(last.comment_created_at)}
                        title={formatFullTimestamp(last.comment_created_at)}
                        className="ml-auto shrink-0 text-meta tabular-nums text-ink-3"
                    >
                        {formatListTimestamp(last.comment_created_at)}
                    </time>
                )}
            </span>
            {said && <span className="line-clamp-2 text-body text-ink">{said}</span>}
            {(replies > 0 || thread.unread) && (
                <span className="flex items-center gap-1.5 text-meta text-ink-2">
                    {thread.unread && <UnreadDot />}
                    {replies > 0 ? (replies === 1 ? "1 reply" : `${replies} replies`) : "New"}
                </span>
            )}
        </Link>
    )
}
