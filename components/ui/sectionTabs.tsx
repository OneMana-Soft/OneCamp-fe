"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { Badge } from "@/components/ui/badge"
import { ix } from "@/lib/ui/interactive"

/**
 * SectionTabs — Notion/Linear-style underline tab bar.
 *
 * Built on @radix-ui/react-tabs so we get keyboard arrow navigation,
 * focus rings, `role="tab"` semantics and `aria-selected` for free.
 *
 * Visual spec:
 *  - Active = ink text over a 2px ink rule; one weight (510) chosen or not,
 *    so choosing a tab never moves the ones after it.
 *  - Hover is a tinted pill behind the label (the interaction layer's tab:
 *    hover, press, focus); the rule sits on the bar's hairline.
 *  - Tabs are buttons in a horizontal scrollable row on small screens.
 *  - Optional section icon + label on the left for desktop.
 *  - Tabs sit inside a 1px bottom-border container so the underline
 *    visually merges with the content area below.
 */

interface SectionTabItem {
    value: string
    label: string
    /** Optional unread / count badge to display next to label */
    count?: number | string
}

interface SectionTabsProps {
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
    // A row of tabs wider than a phone scrolls sideways. It did so with no
    // cue ("Attachm" cut at the edge) and a tab chosen by a link could sit out
    // of sight: the edge with more tabs past it fades (data-edge-fade, the
    // interaction layer's), and the chosen tab is scrolled into view, clear of
    // the fade.
    const listRef = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        const active = listRef.current?.querySelector<HTMLElement>('[data-state="active"]')
        active?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
    }, [value])
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
                        ref={listRef}
                        data-edge-fade=""
                        className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto no-scrollbar"
                    >
                        {tabs.map((tab) => (
                            <TabsPrimitive.Trigger
                                key={tab.value}
                                value={tab.value}
                                {...ix("tab")}
                                className={cn(
                                    "group relative inline-flex shrink-0 scroll-mx-6 items-center justify-center gap-1.5 self-center",
                                    "h-8 rounded-md px-3 md:px-4 text-sm font-medium whitespace-nowrap",
                                    "text-muted-foreground hover:text-foreground data-[state=active]:text-foreground",
                                    "after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-2 md:after:-bottom-3 after:h-0.5 after:rounded-full after:bg-transparent",
                                    // Ink, not the accent (design v3 §3.12, chat C03): a
                                    // tab is where you are, not an action or "for you".
                                    "data-[state=active]:after:bg-ink",
                                )}
                            >
                                {tab.label}
                                {tab.count !== undefined && tab.count !== "" && tab.count !== 0 && (
                                    <Badge
                                        variant="secondary"
                                        className={cn(
                                            "ml-0.5 px-1.5 py-0 h-[18px] min-w-[18px] text-3xs tabular-nums rounded-full",
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
