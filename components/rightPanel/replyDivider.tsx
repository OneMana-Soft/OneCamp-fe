"use client"

interface ReplyDividerProps {
    replyCount: number
}

/** "2 replies" at 12/510 in ink-3, with a hairline running to the right (C36). */
export const ReplyDivider = ({ replyCount }: ReplyDividerProps) => {
    return (
        <div data-reply-divider="" className="mx-4 mb-1 mt-3 flex items-center gap-3" role="separator" aria-label={`${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}>
            <span className="shrink-0 text-meta font-medium tabular-nums text-ink-3">
                {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </div>
    )
}
