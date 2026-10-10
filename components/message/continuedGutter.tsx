import { cn } from "@/lib/utils/helpers/cn"
import { formatFullTimestamp, formatGutterClock, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"

/**
 * What sits in the avatar column of a message that continues the one above it
 * (lib/messageGrouping): nothing, until the row is hovered or holds focus, and
 * then its time. The author and time stay in the text for a screen reader,
 * which does not see the group.
 */
export function ContinuedGutter({ createdAt, authorName, className }: { createdAt: string | number; authorName: string; className?: string }) {
    return (
        <div className={cn("w-9 shrink-0 text-right", className)}>
            <span className="sr-only">{authorName}, {formatFullTimestamp(createdAt)}</span>
            <time
                aria-hidden="true"
                dateTime={isoTimestamp(createdAt)}
                title={formatFullTimestamp(createdAt)}
                className="block pt-0.5 text-2xs leading-5 tabular-nums text-muted-foreground opacity-0 pointer-events-none transition-opacity duration-100 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100"
            >
                {formatGutterClock(createdAt)}
            </time>
        </div>
    )
}

