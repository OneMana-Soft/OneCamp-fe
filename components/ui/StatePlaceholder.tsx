"use client"

import * as React from "react"
import { AlertCircle, Inbox, Search } from "@/lib/icons"
import type { LucideIcon } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * StatePlaceholder — kept as a thin wrapper around EmptyState for backward
 * compatibility. New code should import `EmptyState` directly.
 *
 * Visual / motion differences from the previous implementation:
 *  - No framer-motion intro animation. Empty states should be calm.
 *  - No dashed border + colored bg circle + giant `p-12` shell. The new
 *    primitive is quieter and matches the Notion-like density of the rest
 *    of the app.
 *  - Type-specific icons (Inbox / AlertCircle / Search) still kick in by
 *    default but consumers can override with `icon`.
 */

interface StatePlaceholderProps {
    type: "empty" | "error" | "search"
    title: string
    description?: string
    icon?: LucideIcon
    className?: string
    action?: React.ReactNode
}

const TYPE_ICON: Record<StatePlaceholderProps["type"], LucideIcon> = {
    empty: Inbox,
    error: AlertCircle,
    search: Search,
}

export function StatePlaceholder({
    type,
    title,
    description,
    icon,
    className,
    action,
}: StatePlaceholderProps) {
    return (
        <EmptyState
            icon={icon || TYPE_ICON[type]}
            title={title}
            description={description}
            action={action}
            className={className}
        />
    )
}
