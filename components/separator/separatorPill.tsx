import type React from "react"
import { cn } from "@/lib/utils/helpers/cn"

interface SeparatorPillProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode
    pillClassName?: string
    lineClassName?: string
}

export function SeparatorPill({ children, className, pillClassName, lineClassName, ...props }: SeparatorPillProps) {
    return (
        <div className={cn("relative flex items-center w-full", className)} {...props}>
    <div className={cn("flex-grow h-px bg-border", lineClassName)} />
    <div
    className={cn("px-2.5 py-0.5 mx-2 text-xs font-medium rounded-full border border-border bg-background text-muted-foreground", pillClassName)}
>
    {children}
    </div>
    <div className={cn("flex-grow h-px bg-border", lineClassName)} />
    </div>
)
}

