import { memo } from "react"
import type React from "react"
import { cn } from "@/lib/utils/helpers/cn"

interface SeparatorPillProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode
    pillClassName?: string
    lineClassName?: string
}

/**
 * A day's heading in a conversation (design v3 chat, C15): a hairline 20px in
 * from each side with the day in a 24px pill on the sheet at e1, r12, 12/510
 * in ink-2. The floating copy at the top of a scrolled list is the same pill
 * (MessageListVirtua's DayPill), so the two can't drift apart.
 */
export const SeparatorPill = memo(function SeparatorPill({ children, className, pillClassName, lineClassName, ...props }: SeparatorPillProps) {
    return (
        <div data-day-divider="" className={cn("relative flex w-full justify-center pb-1.5 pt-2.5", className)} {...props}>
            <div aria-hidden="true" className={cn("absolute inset-x-5 top-[calc(50%+2px)] h-px bg-line", lineClassName)} />
            <div className={cn("relative flex h-6 items-center rounded-xl bg-sheet px-2.5 text-meta font-medium text-ink-2 shadow-e1", pillClassName)}>
                {children}
            </div>
        </div>
    )
})
