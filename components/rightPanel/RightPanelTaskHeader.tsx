"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { celebrate } from "@/lib/celebrate"
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
import { SaveForLaterButton } from "@/components/later/SaveForLater"

type HeaderActionsProps = {
    isAdmin: boolean
    canMarkComplete: boolean
    onMarkComplete: () => void
    onDeleteTask?: () => void
    taskUUID: string
    taskName?: string
    hasGitHubLink?: boolean
    /** Shown beside the task in Later. */
    projectName?: string
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
    projectName,
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

    // Completing a task is one of the few moments the playful layer
    // celebrates: sparks burst from the button, and it stays a moment as
    // "Completed" with its check springing in. This button only shows on a
    // task that isn't done, so reopening one never celebrates.
    const handleMarkComplete = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        celebrate(e.currentTarget)
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

    // Anyone who can see the task can save it for later, not only its admins.
    const laterButton = taskName ? (
        <SaveForLaterButton
            target={{
                itemType: "task",
                itemId: taskUUID,
                link: `${app_task_path}/${taskUUID}`,
                title: taskName,
                context: projectName,
            }}
        />
    ) : null

    return (
        <div
            className={cn(
                "flex h-12 items-center justify-between gap-2 px-3 border-b border-border/60 bg-background shrink-0",
            )}
        >
            <div className="flex items-center gap-2 min-w-0">
                {(canMarkComplete || isAnimating) && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={canMarkComplete ? handleMarkComplete : undefined}
                        disabled={!isAdmin || !canMarkComplete}
                        aria-label={canMarkComplete ? "Mark task as complete" : "Task completed"}
                    >
                        <CircleCheck className={cn("h-3.5 w-3.5", !canMarkComplete && "animate-spring text-success-ink")} />
                        <span>{canMarkComplete ? "Mark complete" : "Completed"}</span>
                    </Button>
                )}
            </div>

            {!isDesktop && laterButton}
            {isDesktop && (
                <div className="flex items-center gap-0.5 shrink-0">
                    {laterButton}
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
                                    className="text-danger-ink focus:text-danger-ink focus:bg-destructive/10"
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
