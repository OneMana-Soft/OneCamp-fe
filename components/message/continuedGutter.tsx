import { cn } from "@/lib/utils/helpers/cn"
import { SendingNote } from "@/components/message/sendStatus"
import { formatFullTimestamp, formatGutterClock, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"

/**
 * What sits in the avatar column of a message that continues the one above it
 * (lib/messageGrouping): nothing, until the row is hovered or holds focus, and
 * then its time ("3:10 PM"). The author and time stay in the text for a screen
 * reader, which does not see the group.
 *
 * The time is wider than the 36px column ("12:59 PM" is 52px): on one line,
 * it reaches 6px into the 12px gap before the message and runs the rest of
 * the way into the row's 16px margin, which the widest time leaves 4px of.
 * Its digits are proportional, not tabular: the tabular "12:59 PM" was 56px
 * and ran out of the margin, and one time shown at a time has no column to
 * line up with.
 *
 * It takes focus: a continued message has no name to Tab to, and focus inside
 * a message is what brings up its actions (BaseMessageCard).
 */
export function ContinuedGutter({
    createdAt,
    authorName,
    className,
    sending = false,
}: {
    createdAt: string | number
    authorName: string
    className?: string
    /** Not yet confirmed: "Sending…" shows where the time would, without a hover. */
    sending?: boolean
}) {
    return (
        <div
            tabIndex={0}
            className={cn("flex w-9 shrink-0 justify-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70", className)}
        >
            <span className="sr-only">{authorName}, {formatFullTimestamp(createdAt)}</span>
            {sending ? (
                <SendingNote compact className="flex h-5 items-center pt-0.5" />
            ) : (
            <time
                aria-hidden="true"
                dateTime={isoTimestamp(createdAt)}
                title={formatFullTimestamp(createdAt)}
                className="-mr-1.5 block whitespace-nowrap pt-0.5 text-2xs leading-5 text-muted-foreground opacity-0 pointer-events-none transition-opacity duration-100 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100"
            >
                {formatGutterClock(createdAt)}
            </time>
            )}
        </div>
    )
}

