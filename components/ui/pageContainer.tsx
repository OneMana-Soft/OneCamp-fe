"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * PageContainer — unified content width for list & detail pages.
 *
 * Use a single max width across chat / channel / activity so that the
 * three lists feel like the same surface: 880px, wide enough for two-line
 * rows with timestamps, narrow enough to read on an ultra-wide display.
 *
 * A list starts at the panel's left edge, under its search field and tabs.
 * Centred, a 690px column floated in a 1,190px panel with a gutter of nothing
 * on either side. An empty or loading state, which is one message on its own,
 * is still centred (align="center").
 */

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Limit max width — defaults to 880px. Pass `false` for full width. */
    bounded?: boolean
    /** Where the column sits in the panel: lists start left, a lone message centres. */
    align?: "start" | "center"
}

export function PageContainer({
    bounded = true,
    align = "start",
    className,
    children,
    ...props
}: PageContainerProps) {
    return (
        <div
            className={cn(
                "w-full h-full px-2 md:px-4",
                align === "center" && "mx-auto",
                bounded && "max-w-[880px]",
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
