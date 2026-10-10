import type React from "react"
import { cn } from "@/lib/utils/helpers/cn"

interface SeparatorPillProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode
    pillClassName?: string
    lineClassName?: string
}

/**
 * A day's heading in a conversation: the date as quiet text between two
 * hairlines. It was a bordered pill, the same weight as a button, once per day
 * in every channel; a heading the eye reads past only when it needs to does not
 * need a box. The floating copy at the top of a scrolled list passes its own
 * ground in pillClassName, since it sits over moving text.
 */
export function SeparatorPill({ children, className, pillClassName, lineClassName, ...props }: SeparatorPillProps) {
    return (
        <div className={cn("relative flex items-center w-full px-4 py-2", className)} {...props}>
            <div className={cn("flex-grow h-px bg-border", lineClassName)} />
            <div className={cn("mx-3 text-2xs font-medium text-muted-foreground", pillClassName)}>
                {children}
            </div>
            <div className={cn("flex-grow h-px bg-border", lineClassName)} />
        </div>
    )
}
