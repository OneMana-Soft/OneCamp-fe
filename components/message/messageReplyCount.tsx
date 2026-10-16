import { useMedia } from "@/context/MediaQueryContext"
import { ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ThreadParticipants, ThreadParticipant } from "@/components/message/threadParticipants"
import { RollingCount } from "@/components/message/rollingCount"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { clockTime } from "@/lib/utils/date/clock"

interface MessageReplyCountProps {
    replyCount?: number
    lastCommentCreatedAt?: string
    openDesktopThread?: () => void
    /** Reply authors, used to render a participant facepile (Slack parity). */
    participants?: ThreadParticipant[]
    /** This thread is the one open in the panel beside the conversation. */
    open?: boolean
}

/** "09:14" today, "Yesterday", "3 days ago": when the last reply came. */
function lastReplyLabel(at: string): string {
    const d = new Date(at)
    if (isNaN(d.getTime())) return ""
    if (d.toDateString() === new Date().toDateString()) return clockTime(d)
    const words = formatTimeForReplyCount(at)
    return words.startsWith("Yesterday") ? "yesterday" : words
}

/**
 * The thread under a message (design v3 chat, C35): the faces of who replied
 * (20px, overlapping 6px on a ring of the sheet), "2 replies" in the accent at
 * 590, and when the last one came. Under the pointer the row lifts into a pill
 * on the sheet at e1 and "View thread" shows; the thread that is open in the
 * panel keeps the pressed ground. A reply arriving rolls the count.
 */
export const MessageReplyCount = ({
    replyCount,
    lastCommentCreatedAt,
    openDesktopThread,
    participants,
    open = false,
}: MessageReplyCountProps) => {
    const { isDesktop } = useMedia()

    if (!replyCount || !lastCommentCreatedAt) return null
    const last = lastReplyLabel(lastCommentCreatedAt)

    const content = (
        <>
            {participants && participants.length > 0 && <ThreadParticipants participants={participants} />}
            <span className="font-semibold text-brand-text">
                <RollingCount value={replyCount} /> {replyCount === 1 ? "reply" : "replies"}
            </span>
            {last && <span className="text-meta tabular-nums text-ink-3">Last reply {last}</span>}
        </>
    )

    if (isDesktop) {
        return (
            <button
                type="button"
                data-thread-row=""
                aria-expanded={open}
                onClick={openDesktopThread}
                className={cn(
                    "group/thread -ml-1 mt-2 flex h-7 w-max max-w-full items-center gap-2 rounded-lg pl-1 pr-2 text-ui-sm",
                    "transition-[background-color,box-shadow] duration-[140ms] ease-out hover:bg-sheet hover:shadow-e1",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    open && "bg-press hover:bg-press hover:shadow-none",
                )}
            >
                {content}
                <span className="flex items-center gap-0.5 text-meta text-ink-3 opacity-0 transition-opacity duration-[140ms] group-hover/thread:opacity-100 group-focus-visible/thread:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
                    View thread <ChevronRight className="size-3.5" aria-hidden="true" />
                </span>
            </button>
        )
    }

    return <div data-thread-row="" className="mt-2 flex h-8 items-center gap-2 text-ui-sm">{content}</div>
}
