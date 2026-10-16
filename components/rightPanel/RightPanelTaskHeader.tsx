"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useDispatch } from "react-redux"

import { celebrateTask, prefersReducedMotion } from "@/lib/celebrate"
import { Button } from "@/components/ui/button"
import { ArrowUpRight, EllipsisVertical, GitBranch, Github, Link as LinkIcon, Trash, Unlink, X } from "@/lib/icons"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { cn } from "@/lib/utils/helpers/cn"
import { useMedia } from "@/context/MediaQueryContext"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { app_project_path, app_task_path } from "@/types/paths"
import { openUI } from "@/store/slice/uiSlice"
import { PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"
import { SaveForLaterButton } from "@/components/later/SaveForLater"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"

type HeaderActionsProps = {
    isAdmin: boolean
    /** The task is open (not done), and this person may complete it. */
    canMarkComplete: boolean
    onMarkComplete: () => void
    /** A done task's "Completed" reopens it on click (its admins). */
    onReopen?: () => void
    onDeleteTask?: () => void
    taskUUID: string
    taskName?: string
    hasGitHubLink?: boolean
    /** Shown beside the task in Later, and as the crumb. */
    projectName?: string
    projectUUID?: string
    /** The body has scrolled: the header's hairline shows. */
    scrolled?: boolean
    /** On the full task page, there is no page to open and no panel to close. */
    onPage?: boolean
    /** In the trash: nothing to complete or delete until it is brought back (it read "Completed" beside the deleted banner). */
    deleted?: boolean
}

/**
 * The task panel's header (design v3, work.md W28): 52px, the project crumb
 * on the left (its tile and name, a link to it), then Mark complete as the
 * secondary action, and copy link, open full page, more and close as icon
 * buttons. Its hairline appears only once the body scrolls.
 *
 * Mark complete is the task's finish (W03): a moss disc springs in on the
 * button and the Spark tier bursts from it. Once done it reads "Completed"
 * with the moss check, and pointing at it offers "Mark as not done", which
 * never celebrates.
 */
export function RightPanelTaskHeader({
    isAdmin,
    canMarkComplete,
    onMarkComplete,
    onReopen,
    onDeleteTask,
    taskUUID,
    taskName,
    hasGitHubLink,
    projectName,
    projectUUID,
    scrolled = false,
    onPage = false,
    deleted = false,
}: HeaderActionsProps) {
    const post = usePost()
    const dispatch = useDispatch()
    const { isDesktop } = useMedia()
    const copyToClipboard = useCopyToClipboard()
    // The click that completed it plays the fill; a done task on load is still.
    const [justDone, setJustDone] = useState(false)
    useEffect(() => {
        if (!justDone) return
        const t = setTimeout(() => setJustDone(false), 600)
        return () => clearTimeout(t)
    }, [justDone])

    const copyTaskLink = useCallback(() => {
        copyToClipboard.copy(`${window.location.protocol}//${window.location.host}${app_task_path}/${taskUUID}`, "Link copied")
    }, [taskUUID, copyToClipboard])

    const handleMarkComplete = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            celebrateTask(e.currentTarget)
            if (!prefersReducedMotion()) setJustDone(true)
            onMarkComplete()
        },
        [onMarkComplete],
    )

    const done = !canMarkComplete
    const laterButton = taskName ? (
        <SaveForLaterButton
            target={{ itemType: "task", itemId: taskUUID, link: `${app_task_path}/${taskUUID}`, title: taskName, context: projectName }}
        />
    ) : null

    const iconButton = "size-7 text-ink-3 hover:text-foreground"

    return (
        <div
            data-task-header=""
            className={cn(
                "flex h-[52px] shrink-0 items-center gap-2 border-b pl-5 pr-2.5 transition-colors",
                scrolled ? "border-line" : "border-transparent",
            )}
        >
            {/* The crumb: the project's tile and name, a link to the project. */}
            {projectName && projectUUID ? (
                <Link
                    href={`${app_project_path}/${projectUUID}`}
                    className="flex min-w-[96px] shrink items-center gap-1.5 rounded-sm text-ui-sm text-ink-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <ProjectTile id={projectUUID} size={16} />
                    <span className="truncate">{projectName}</span>
                </Link>
            ) : (
                <span className="min-w-0" />
            )}
            <span className="flex-1" />

            {!deleted && (isAdmin || done) && (
                <Button
                    variant="secondary"
                    size="sm"
                    // 44px on a touch screen (the task page on a phone), 28 with a mouse.
                    className={cn("h-7 gap-1.5 pointer-coarse:h-11", done && isAdmin && onReopen && "group/done")}
                    onClick={done ? (isAdmin && onReopen ? onReopen : undefined) : handleMarkComplete}
                    disabled={!isAdmin}
                    data-done={done || undefined}
                    aria-label={done ? "Task completed" : "Mark task as complete"}
                >
                    <CompleteGlyph done={done} animate={justDone && done} />
                    {done ? (
                        <>
                            <span className={cn(isAdmin && onReopen && "group-hover/done:hidden")}>Completed</span>
                            {isAdmin && onReopen && <span className="hidden group-hover/done:inline">Mark as not done</span>}
                        </>
                    ) : (
                        <span>Mark complete</span>
                    )}
                </Button>
            )}

            <div className="flex shrink-0 items-center gap-0.5">
                {isDesktop && (
                    <Button variant="ghost" size="icon" className={iconButton} onClick={copyTaskLink} aria-label="Copy task link">
                        <LinkIcon className="size-4" />
                    </Button>
                )}
                {isDesktop && !onPage && (
                    <Button asChild variant="ghost" size="icon" className={iconButton}>
                        <Link href={`${app_task_path}/${taskUUID}`} aria-label="Open the full page">
                            <ArrowUpRight className="size-4" />
                        </Link>
                    </Button>
                )}
                {laterButton}
                {isDesktop && isAdmin && onDeleteTask && !deleted && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className={iconButton} aria-label="More task actions">
                                <EllipsisVertical className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {!hasGitHubLink && (
                                <>
                                    <DropdownMenuItem onClick={() => dispatch(openUI({ key: "githubLinkTask", data: { taskId: taskUUID } }))}>
                                        <Github className="mr-2 h-4 w-4" />
                                        Link to GitHub
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => dispatch(openUI({ key: "createBranch", data: { taskId: taskUUID, taskName: taskName || "" } }))}>
                                        <GitBranch className="mr-2 h-4 w-4" />
                                        Create branch
                                    </DropdownMenuItem>
                                </>
                            )}
                            {hasGitHubLink && (
                                <DropdownMenuItem
                                    onClick={async () => {
                                        try {
                                            await post.makeRequest({ apiEndpoint: PostEndpointUrl.GitHubUnlinkTask, appendToUrl: `/${taskUUID}`, showToast: true })
                                        } catch {
                                            // Error toast handled by usePost
                                        }
                                    }}
                                >
                                    <Unlink className="mr-2 h-4 w-4" />
                                    Unlink GitHub
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onDeleteTask} className="text-danger-ink focus:bg-destructive/10 focus:text-danger-ink">
                                <Trash className="mr-2 h-4 w-4" />
                                Delete task
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                {isDesktop && !onPage && (
                    <Button variant="ghost" size="icon" className={iconButton} onClick={() => dispatch(closeRightPanel())} aria-label="Close panel">
                        <X className="size-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}

/**
 * The button's glyph: a check ring while open; the moss disc once done, which
 * springs in and draws its tick on the click that completed it (W03).
 */
function CompleteGlyph({ done, animate }: { done: boolean; animate: boolean }) {
    if (!done) {
        return (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <path d="m4.5 8.3 2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    }
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" data-anim={animate ? "fill" : undefined} className="shrink-0 overflow-visible">
            <circle cx="8" cy="8" r="7" fill="var(--camp-moss)" style={animate ? { transformOrigin: "8px 8px", animation: "work-check-fill 220ms var(--ease-spring) both" } : undefined} />
            <path
                d="m5.2 8.2 1.9 1.9 3.8-4"
                fill="none"
                stroke="var(--sheet)"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={animate ? 1 : undefined}
                style={animate ? { animation: "work-tick-draw 160ms var(--ease-out) 60ms both" } : undefined}
            />
        </svg>
    )
}
