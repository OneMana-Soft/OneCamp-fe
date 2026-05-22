"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * PageContainer — unified content width for list & detail pages.
 *
 * Use a single max width across chat / channel / activity so that the
 * three lists feel like the same surface. Default is 760px which is
 * wide enough for two-line list items with timestamps but narrow enough
 * to feel readable on ultra-wide displays.
 */

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Limit max width — defaults to ~760px. Pass `false` for full width. */
    bounded?: boolean
}

export function PageContainer({
    bounded = true,
    className,
    children,
    ...props
}: PageContainerProps) {
    return (
        <div
            className={cn(
                "w-full h-full mx-auto px-2 md:px-6",
                bounded && "max-w-[760px]",
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
