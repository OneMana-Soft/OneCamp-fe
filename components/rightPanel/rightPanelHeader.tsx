"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
    CalendarIcon,
    CircleCheck,
    FileText,
    MessageSquare,
    Sparkles,
    X,
} from "@/lib/icons"
import Link from "next/link"
import { useDispatch } from "react-redux"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"
import type { LucideIcon } from "lucide-react"

interface RightPanelHeaderProps {
    titleKey: "thread" | "docComment" | "task" | "event" | "ai"
    title?: string
    /**
     * What the panel's own view can do (an event's Edit or Delete): drawn just
     * left of the close button, in one group on the title row's centre line,
     * as the task panel groups its icon actions on the right.
     */
    actions?: ReactNode
    /** Where it lives, after the title: "in #engineering" (a thread, C36). */
    subtitle?: string
    subtitleHref?: string
}

const titleConfig: Record<string, { label: string; icon: LucideIcon }> = {
    thread: { label: "Thread", icon: MessageSquare },
    docComment: { label: "Comments", icon: FileText },
    task: { label: "Task", icon: CircleCheck },
    event: { label: "Event", icon: CalendarIcon },
    ai: { label: "AI assistant", icon: Sparkles },
}

/**
 * RightPanelHeader: the right panel's chrome (design v3, shell V1).
 *
 * 52px on its own sheet, a hairline under it, padding 0 12 0 20: the place's
 * glyph and a 15/590 title, then the view's own actions and the close button
 * at 28px. Close is an x (Esc), which was ArrowRightToLine and read as
 * "collapse the sidebar". OneCamp AI's glyph sits on the agent square.
 */
export const RightPanelHeader = ({ titleKey, title, actions, subtitle, subtitleHref }: RightPanelHeaderProps) => {
    const dispatch = useDispatch()
    const config = titleConfig[titleKey] || titleConfig.thread
    const Icon = config.icon

    const handleClose = () => {
        dispatch(closeRightPanel())
    }

    return (
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-line bg-transparent pl-5 pr-3">
            <div className="flex min-w-0 items-center gap-2">
                {titleKey === "ai" ? (
                    <span className="grid size-5 shrink-0 place-items-center rounded-[32%] avatar-agent text-white" aria-hidden="true">
                        <Icon className="h-3 w-3" />
                    </span>
                ) : (
                    <Icon className="h-4 w-4 shrink-0 text-ink-3" />
                )}
                <h2 className="truncate text-heading text-ink">
                    {title || config.label}
                </h2>
                {subtitle && (subtitleHref ? (
                    <Link href={subtitleHref} className="truncate text-ui-sm text-ink-3 transition-colors hover:text-ink">{subtitle}</Link>
                ) : (
                    <span className="truncate text-ui-sm text-ink-3">{subtitle}</span>
                ))}
            </div>
            <div data-panel-actions="" className="flex shrink-0 items-center gap-0.5">
                {actions}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleClose}
                            className="h-7 w-7 shrink-0 text-ink-3 hover:text-ink"
                            aria-label="Close panel"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close panel<span className="shell-tip-kbd">Esc</span></TooltipContent>
                </Tooltip>
            </div>
        </header>
    )
}
