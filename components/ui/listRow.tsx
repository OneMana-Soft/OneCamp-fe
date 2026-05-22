"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { formatCount } from "@/lib/utils/helpers/formatCount"
import { useTouchFlash } from "@/hooks/useTouchFlash"

/**
 * ListRow — Notion-style list row primitive.
 *
 * Single source of truth for chat / channel / activity / sidebar list items.
 * Use density variants to switch between sidebar (`compact`), main list (`default`),
 * and content-heavy lists like Activity (`comfortable`).
 *
 * Composition slots:
 *  - leading: avatar / icon / grouped avatar
 *  - title: primary label (truncates)
 *  - subtitle: optional secondary line (truncates)
 *  - meta: right-aligned metadata (timestamp, etc.)
 *  - trailing: right-aligned indicators (badge, call indicator, etc.)
 *  - children: free-form below subtitle (used by activity preview)
 *
 * Touch behavior:
 *  - Includes a CSS-only press-flash via `useTouchFlash` for "tap registered"
 *    feedback that holds briefly after release. No `styled-jsx`, no ripples.
 *  - Auto-cancels on touch scroll so rows don't light up while swiping past.
 */

type Density = "compact" | "default" | "comfortable"

const densityClasses: Record<Density, { row: string; gap: string }> = {
    compact: {
        // Sidebar style: 32px target, tight padding
        row: "min-h-8 px-2 py-1",
        gap: "gap-2",
    },
    default: {
        // Main list pages on desktop
        row: "min-h-12 md:min-h-12 min-h-14 px-3 py-2",
        gap: "gap-3",
    },
    comfortable: {
        // Activity, dense content rows
        row: "min-h-16 md:min-h-16 min-h-[72px] px-3 py-2.5",
        gap: "gap-3",
    },
}

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    leading?: React.ReactNode
    title: React.ReactNode
    subtitle?: React.ReactNode
    meta?: React.ReactNode
    trailing?: React.ReactNode
    selected?: boolean
    /** Highlight title with bolder weight (e.g. unread state) */
    emphasize?: boolean
    /** Density variant */
    density?: Density
    /** Render children below subtitle line */
    children?: React.ReactNode
    /** Disable the touch press-flash effect */
    disablePressFlash?: boolean
}

export const ListRow = React.forwardRef<HTMLDivElement, ListRowProps>(
    (
        {
            leading,
            title,
            subtitle,
            meta,
            trailing,
            selected,
            emphasize,
            density = "default",
            className,
            children,
            disablePressFlash,
            onTouchStart,
            onTouchEnd,
            onTouchCancel,
            ...props
        },
        ref,
    ) => {
        const d = densityClasses[density]
        const { pressed, bind } = useTouchFlash({ disabled: disablePressFlash })

        // Allow consumer-supplied touch handlers to compose with the flash bindings.
        const compose = <E extends React.TouchEvent>(
            theirs: ((e: E) => void) | undefined,
            ours: (e: E) => void,
        ) => {
            return (e: E) => {
                ours(e)
                theirs?.(e)
            }
        }

        return (
            <div
                ref={ref}
                data-selected={selected || undefined}
                data-pressed={pressed || undefined}
                onTouchStart={compose(onTouchStart, bind.onTouchStart)}
                onTouchEnd={compose(onTouchEnd, bind.onTouchEnd)}
                onTouchCancel={compose(onTouchCancel, bind.onTouchCancel)}
                className={cn(
                    "group relative flex items-center rounded-md cursor-pointer select-none",
                    "transition-colors duration-150 ease-out",
                    "hover:bg-accent/60",
                    // Touch press-flash: lasting feedback via data-pressed.
                    "data-[pressed=true]:bg-accent",
                    // Pointer active fallback (mouse / desktop).
                    "active:bg-accent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected && "bg-accent text-accent-foreground",
                    d.row,
                    d.gap,
                    className,
                )}
                {...props}
            >
                {leading && (
                    <div className="flex shrink-0 items-center justify-center">
                        {leading}
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div
                            className={cn(
                                "flex-1 min-w-0 truncate text-sm leading-tight",
                                emphasize || selected
                                    ? "font-semibold text-foreground"
                                    : "font-medium text-foreground",
                            )}
                        >
                            {title}
                        </div>
                        {meta && (
                            <span
                                className={cn(
                                    "shrink-0 whitespace-nowrap text-[11px] tabular-nums",
                                    emphasize
                                        ? "text-foreground font-medium"
                                        : "text-muted-foreground",
                                )}
                            >
                                {meta}
                            </span>
                        )}
                        {trailing && (
                            <div className="flex shrink-0 items-center gap-1.5">
                                {trailing}
                            </div>
                        )}
                    </div>
                    {subtitle !== undefined && subtitle !== null && (
                        <div
                            className={cn(
                                "mt-0.5 truncate text-xs leading-snug",
                                "text-muted-foreground",
                            )}
                        >
                            {subtitle}
                        </div>
                    )}
                    {children}
                </div>
            </div>
        )
    },
)
ListRow.displayName = "ListRow"

/**
 * Compact unread badge intended for ListRow trailing slot.
 * Uses `formatCount` so values >99 render as "99+".
 */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
    if (!count || count <= 0) return null
    return (
        <span
            className={cn(
                "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full",
                "bg-primary px-1 text-[10px] font-semibold text-primary-foreground",
                "shadow-sm",
                className,
            )}
        >
            {formatCount(count)}
        </span>
    )
}

/**
 * Compact unread dot for use when count is unknown or you only want presence.
 */
export function UnreadDot({ className }: { className?: string }) {
    return (
        <span
            aria-hidden
            className={cn(
                "inline-block h-2 w-2 rounded-full bg-primary ring-2 ring-background",
                className,
            )}
        />
    )
}
