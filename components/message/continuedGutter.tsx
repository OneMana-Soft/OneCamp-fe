import { cn } from "@/lib/utils/helpers/cn"
import { FailedMark, SendingNote } from "@/components/message/sendStatus"
import { formatFullTimestamp, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { clockTime } from "@/lib/utils/date/clock"
import { TIME_TIP } from "@/components/MessageDesktopHover/actionTip"

/**
 * What sits in the avatar column of a message that continues the one above it
 * (lib/messageGrouping): nothing, until the row is hovered or holds focus, and
 * then its time in the reader's clock (design v3 chat, C08).
 *
 * Right-aligned to the 36px column at 11px tabular. The widest form a clock
 * writes, "12:59 PM", is about 47px: it runs left into the row's 20px margin,
 * which holds it with room to spare, so the column itself stays an avatar
 * wide and the text beside it never moves. The author and time stay in the
 * text for a screen reader, which does not see the group.
 *
 * While the message is on its way the pending clock stands here without a
 * hover; a message that was not sent shows its alert.
 *
 * It takes focus: a continued message has no name to Tab to, and focus inside
 * a message is what brings up its actions (BaseMessageCard).
 */
export function ContinuedGutter({
    createdAt,
    authorName,
    className,
    sending = false,
    failed = false,
}: {
    createdAt: string | number
    authorName: string
    className?: string
    /** Not yet confirmed: the pending clock shows where the time would. */
    sending?: boolean
    /** Not sent: the alert shows where the time would. */
    failed?: boolean
}) {
    return (
        <div
            tabIndex={0}
            data-gutter=""
            className={cn("group/gutter relative h-5 w-9 shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
        >
            <span className="sr-only">{authorName}, {formatFullTimestamp(createdAt)}</span>
            {failed ? (
                <FailedMark className="absolute right-0 top-[3px]" />
            ) : sending ? (
                <SendingNote compact className="absolute right-0 top-0 h-5" />
            ) : (
                <time
                    aria-hidden="true"
                    dateTime={isoTimestamp(createdAt)}
                    data-tip={formatFullTimestamp(createdAt)}
                    className={cn(
                        // Held to its left edge, so the date runs over the message, never off the row.
                        TIME_TIP,
                        "tip-start",
                        "pointer-events-none absolute right-0 top-0 whitespace-nowrap text-3xs leading-5 tabular-nums text-ink-3 opacity-0 transition-opacity duration-[140ms] ease-out settled:group-hover/row:pointer-events-auto settled:group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-0",
                    )}
                >
                    {clockTime(createdAt)}
                </time>
            )}
        </div>
    )
}
