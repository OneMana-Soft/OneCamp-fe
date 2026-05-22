"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    ArrowRightToLine,
    CircleCheck,
    EllipsisVertical,
    GitBranch,
    Github,
    Link,
    Trash,
    Unlink,
} from "@/lib/icons"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { useDispatch } from "react-redux"
import { cn } from "@/lib/utils/helpers/cn"
import { useMedia } from "@/context/MediaQueryContext"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { app_task_path } from "@/types/paths"
import { openUI } from "@/store/slice/uiSlice"
import { PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"

type HeaderActionsProps = {
    isAdmin: boolean
    canMarkComplete: boolean
    onMarkComplete: () => void
    onDeleteTask?: () => void
    taskUUID: string
    taskName?: string
    hasGitHubLink?: boolean
}

/**
 * RightPanelTaskHeader — primary actions for the task detail panel.
 * 48px tall to match the rest of the right panel chrome. Mark complete
 * is the primary action on the left; overflow + close are on the right.
 */
export function RightPanelTaskHeader({
    isAdmin,
    canMarkComplete,
    onMarkComplete,
    onDeleteTask,
    taskUUID,
    taskName,
    hasGitHubLink,
}: HeaderActionsProps) {
    const post = usePost()
    const [isAnimating, setIsAnimating] = useState(false)
    const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const { isDesktop } = useMedia()
    const copyToClipboard = useCopyToClipboard()

    const copyTaskLink = useCallback(() => {
        const host = window.location.host
        const protocol = window.location.protocol
        const baseUrl = `${protocol}//${host}`
        const newPath = `${app_task_path}/${taskUUID}`
        copyToClipboard.copy(`${baseUrl}${newPath}`, "Link copied")
    }, [taskUUID, copyToClipboard])

    const handleMarkComplete = useCallback(() => {
        try {
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current)
            }
            setIsAnimating(true)
            animationTimeoutRef.current = setTimeout(() => {
                setIsAnimating(false)
                animationTimeoutRef.current = null
            }, 1200)
            onMarkComplete()
        } catch (error) {
            console.error("Error handling mark complete:", error)
            onMarkComplete()
        }
    }, [onMarkComplete])

    useEffect(() => {
        return () => {
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current)
            }
        }
    }, [])

    const dispatch = useDispatch()

    return (
        <div
            className={cn(
                "flex h-12 items-center justify-between gap-2 px-3 border-b border-border/60 bg-background shrink-0",
                isAnimating && "animate-gradient-completion",
            )}
        >
            <div className="flex items-center gap-2 min-w-0">
                {canMarkComplete && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={handleMarkComplete}
                        disabled={!isAdmin}
                        aria-label="Mark task as complete"
                    >
                        <CircleCheck className="h-3.5 w-3.5" />
                        <span>Mark complete</span>
                    </Button>
                )}
            </div>

            {isDesktop && (
                <div className="flex items-center gap-0.5 shrink-0">
                    {isAdmin && onDeleteTask && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    aria-label="More task actions"
                                >
                                    <EllipsisVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                {!hasGitHubLink && (
                                    <>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                dispatch(
                                                    openUI({
                                                        key: "githubLinkTask",
                                                        data: { taskId: taskUUID },
                                                    }),
                                                )
                                            }
                                        >
                                            <Github className="h-4 w-4 mr-2" />
                                            Link to GitHub
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                dispatch(
                                                    openUI({
                                                        key: "createBranch",
                                                        data: { taskId: taskUUID, taskName: taskName || "" },
                                                    }),
                                                )
                                            }
                                        >
                                            <GitBranch className="h-4 w-4 mr-2" />
                                            Create branch
                                        </DropdownMenuItem>
                                    </>
                                )}
                                {hasGitHubLink && (
                                    <DropdownMenuItem
                                        onClick={async () => {
                                            try {
                                                await post.makeRequest({
                                                    apiEndpoint: PostEndpointUrl.GitHubUnlinkTask,
                                                    appendToUrl: `/${taskUUID}`,
                                                    showToast: true,
                                                })
                                            } catch {
                                                // Error toast handled by usePost
                                            }
                                        }}
                                    >
                                        <Unlink className="h-4 w-4 mr-2" />
                                        Unlink GitHub
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={copyTaskLink}>
                                    <Link className="h-4 w-4 mr-2" />
                                    Copy task link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={onDeleteTask}
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                    <Trash className="h-4 w-4 mr-2" />
                                    Delete task
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => dispatch(closeRightPanel())}
                        aria-label="Close panel"
                    >
                        <ArrowRightToLine className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}
