import { cn } from "@/lib/utils/helpers/cn"

/**
 * News since you last read it (docs programme B7): a 6 px dot in the accent,
 * as the new-messages line is, with its word for a screen reader. One dot for
 * the thread card, the phone's row and the margin's marker.
 */
export function UnreadDot({ className }: { className?: string }) {
    return (
        <span data-unread-dot="" title="New since you last read it" className={cn("size-1.5 shrink-0 rounded-full bg-brand", className)}>
            <span className="sr-only">Unread</span>
        </span>
    )
}
