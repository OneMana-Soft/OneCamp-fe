"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"

export interface DrawerItemProps {
    icon?: LucideIcon
    label: string
    description?: string
    onClick: () => void
    destructive?: boolean
    trailing?: React.ReactNode
    disabled?: boolean
}

/**
 * DrawerItem — single tappable row used inside mobile drawers.
 *
 * Replaces the various `<div onClick>` patterns that were scattered
 * across drawers: real `<button>` semantics, focus ring, accessible
 * label, active-state press feedback. 48px tall (Notion mobile drawer
 * row density). When `description` is present the row grows to ~64px
 * to accommodate the secondary line.
 */
export function DrawerItem({
    icon: Icon,
    label,
    description,
    onClick,
    destructive,
    trailing,
    disabled,
}: DrawerItemProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "w-full flex items-center gap-3 px-3 rounded-md text-left transition-colors",
                description ? "py-2 min-h-14" : "h-12",
                "active:bg-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                destructive
                    ? "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10"
                    : "text-foreground hover:bg-accent/60 focus-visible:bg-accent/60",
                disabled && "opacity-60 cursor-not-allowed pointer-events-none",
            )}
        >
            {Icon && (
                <Icon
                    className={cn(
                        "h-5 w-5 shrink-0",
                        destructive ? "text-destructive" : "text-muted-foreground",
                    )}
                    strokeWidth={1.75}
                />
            )}
            <span className="flex-1 min-w-0">
                <span
                    className={cn(
                        "block text-sm font-medium leading-tight",
                        destructive ? "text-destructive" : "text-foreground",
                    )}
                >
                    {label}
                </span>
                {description && (
                    <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                        {description}
                    </span>
                )}
            </span>
            {trailing}
        </button>
    )
}
