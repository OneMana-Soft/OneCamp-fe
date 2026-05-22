"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { Badge } from "@/components/ui/badge"

/**
 * SectionTabs — Notion/Linear-style underline tab bar.
 *
 * Built on @radix-ui/react-tabs so we get keyboard arrow navigation,
 * focus rings, `role="tab"` semantics and `aria-selected` for free.
 *
 * Visual spec:
 *  - Active = thin bottom underline + bolder text, no filled pill.
 *  - Tabs are buttons in a horizontal scrollable row on small screens.
 *  - Optional section icon + label on the left for desktop.
 *  - Tabs sit inside a 1px bottom-border container so the underline
 *    visually merges with the content area below.
 */

export interface SectionTabItem {
    value: string
    label: string
    /** Optional unread / count badge to display next to label */
    count?: number | string
}

export interface SectionTabsProps {
    /** Tab values, labels, optional counts */
    tabs: SectionTabItem[]
    /** Currently active tab */
    value: string
    /** Called when tab changes */
    onValueChange: (value: string) => void
    /** Optional section icon shown on desktop only */
    icon?: LucideIcon
    /** Optional section title shown on desktop only (e.g. "Channels") */
    title?: string
    /** Optional trailing controls (action button, etc.) */
    actions?: React.ReactNode
    /** Tab content keyed by `value` */
    children?: React.ReactNode
    /** Container className for the outer wrapper */
    className?: string
}

export function SectionTabs({
    tabs,
    value,
    onValueChange,
    icon: Icon,
    title,
    actions,
    children,
    className,
}: SectionTabsProps) {
    return (
        <TabsPrimitive.Root
            value={value}
            onValueChange={onValueChange}
            className={cn("flex flex-col h-full min-h-0", className)}
        >
            <div className="border-b border-border/60 bg-background sticky top-0 z-10">
                <div className="flex items-center px-3 md:px-6 h-12 md:h-14 gap-4">
                    {Icon && title && (
                        <div className="hidden md:flex items-center gap-2 mr-2">
                            <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                            <h1 className="text-sm font-semibold text-foreground">{title}</h1>
                        </div>
                    )}
                    <TabsPrimitive.List
                        className={cn(
                            "flex items-stretch h-full",
                            "overflow-x-auto no-scrollbar",
                            "min-w-0 flex-1",
                        )}
                    >
                        {tabs.map((tab) => (
                            <TabsPrimitive.Trigger
                                key={tab.value}
                                value={tab.value}
                                className={cn(
                                    "relative inline-flex items-center justify-center gap-1.5",
                                    "h-full px-3 md:px-4 text-sm font-medium whitespace-nowrap",
                                    "text-muted-foreground hover:text-foreground transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
                                    "data-[state=active]:text-foreground data-[state=active]:font-semibold",
                                    "after:content-[''] after:absolute after:left-3 after:right-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent",
                                    "data-[state=active]:after:bg-primary",
                                )}
                            >
                                {tab.label}
                                {tab.count !== undefined && tab.count !== "" && tab.count !== 0 && (
                                    <Badge
                                        variant="secondary"
                                        className={cn(
                                            "ml-0.5 px-1.5 py-0 h-[18px] min-w-[18px] text-[10px] rounded-full",
                                            "bg-muted text-muted-foreground border-transparent",
                                            "group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary",
                                        )}
                                    >
                                        {tab.count}
                                    </Badge>
                                )}
                            </TabsPrimitive.Trigger>
                        ))}
                    </TabsPrimitive.List>
                    {actions && (
                        <div className="flex items-center gap-1 shrink-0">{actions}</div>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        </TabsPrimitive.Root>
    )
}

/** Convenience re-export for `TabsContent`. */
export const SectionTabsContent = TabsPrimitive.Content
