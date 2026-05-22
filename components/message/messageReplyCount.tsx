import { Button } from "@/components/ui/button"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { useMedia } from "@/context/MediaQueryContext"
import { ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

interface MessageReplyCountProps {
    replyCount?: number
    lastCommentCreatedAt?: string
    openDesktopThread?: () => void
}

/**
 * MessageReplyCount — shows "N replies" + last-reply time below a message.
 *
 * On desktop, the row is a clickable Button that opens the thread panel.
 * On mobile, it's a static row (the parent message handles tap-to-open).
 *
 * Uses Tailwind responsive utilities for the desktop-only "Last reply" label
 * and chevron, instead of `ConditionalWrap` indirection.
 */
export const MessageReplyCount = ({
    replyCount,
    lastCommentCreatedAt,
    openDesktopThread,
}: MessageReplyCountProps) => {
    const { isDesktop } = useMedia()

    if (!replyCount || !lastCommentCreatedAt) return null

    const content = (
        <div className="group flex items-center gap-2 text-xs">
            <span className="font-semibold text-primary hover:underline">
                {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-1">
                <span className="hidden md:inline">Last reply</span>
                <span>{formatTimeForReplyCount(lastCommentCreatedAt)}</span>
            </span>
            <ChevronRight
                className={cn(
                    "ml-auto hidden h-3.5 w-3.5 text-muted-foreground transition-opacity",
                    "md:inline opacity-0 group-hover:opacity-100",
                )}
            />
        </div>
    )

    if (isDesktop) {
        return (
            <Button
                variant="ghost"
                className="flex w-full justify-start px-2 py-1 h-auto"
                onClick={openDesktopThread}
            >
                {content}
            </Button>
        )
    }

    return content
}
