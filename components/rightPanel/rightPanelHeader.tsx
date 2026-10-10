"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
    ArrowRightToLine,
    CalendarIcon,
    CircleCheck,
    FileText,
    MessageSquare,
    Sparkles,
} from "@/lib/icons"
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
}

const titleConfig: Record<string, { label: string; icon: LucideIcon }> = {
    thread: { label: "Thread", icon: MessageSquare },
    docComment: { label: "Comments", icon: FileText },
    task: { label: "Task", icon: CircleCheck },
    event: { label: "Event", icon: CalendarIcon },
    ai: { label: "AI assistant", icon: Sparkles },
}

/**
 * RightPanelHeader — shared chrome for the desktop right panel.
 *
 * 48px height matches SectionTabs and chat detail header so the right
 * panel feels like part of the same surface family. Close button uses
 * ArrowRightToLine to mirror the panel slide-out direction.
 */
export const RightPanelHeader = ({ titleKey, title, actions }: RightPanelHeaderProps) => {
    const dispatch = useDispatch()
    const config = titleConfig[titleKey] || titleConfig.thread
    const Icon = config.icon

    const handleClose = () => {
        dispatch(closeRightPanel())
    }

    return (
        <header className="flex h-12 items-center justify-between gap-2 border-b border-border/60 bg-background px-3 shrink-0">
            <div className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h2 className="truncate text-sm font-semibold text-foreground">
                    {title || config.label}
                </h2>
            </div>
            <div data-panel-actions="" className="flex shrink-0 items-center gap-1">
                {actions}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleClose}
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Close panel"
                        >
                            <ArrowRightToLine className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close panel</TooltipContent>
                </Tooltip>
            </div>
        </header>
    )
}
