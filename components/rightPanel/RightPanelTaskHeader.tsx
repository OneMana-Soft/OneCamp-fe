"use client"

import { ConnectedTrigger } from "@/components/workGraph/ConnectedTrigger"
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react"
import Link from "next/link"
import { useDispatch } from "react-redux"

import { celebrateTask } from "@/lib/celebrateSoon"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { Button } from "@/components/ui/button"
import { ArrowUpRight, BadgeCheck, ChevronDown, ChevronRight, ChevronUp, CornerUpLeft, EllipsisVertical, GitBranch, Github, Link as LinkIcon, Trash, Unlink, X } from "@/lib/icons"
import type { TaskPlace } from "@/lib/work/taskSequence"
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
import { chordMatches, chordWords, isMacLike } from "@/lib/keys/chord"
import { showPageKeys } from "@/lib/shortcuts/pageGroups"
import { app_project_path, app_task_path } from "@/types/paths"
import { openUI } from "@/store/slice/uiSlice"
import { PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"
import { SaveForLaterButton } from "@/components/later/SaveForLater"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type HeaderActionsProps = {
    /** This person may change the task (lib/work/access canEditTask). */
    isAdmin: boolean
    /** This person may delete it (canDeleteTask); its changers when not said. */
    canDelete?: boolean
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
    /** A subtask's parent: the path's second step, after the project. One the reader may not see (WA2) has no onOpen: it is named, never opened. */
    parent?: { name: string; onOpen?: () => void }
    /** Its key ("Q4-12"): the path's last step, a button that copies it. */
    taskKey?: string
    /** Its place in the list or board it was opened from, for previous and next. */
    place?: TaskPlace
    onOpenTask?: (taskUUID: string) => void
}

/**
 * The task panel's header (design v3, work.md W28): 52px, the path on the left
 * (the project's tile and name, a link to it; a sub-task's parent; the key),
 * then Mark complete as the secondary action, and copy link, previous and
 * next, open full page, more and close as icon buttons. Under 30rem of header
 * copy link and open full page fold into More, for everyone, so the 452 px
 * panel keeps Mark complete's words. Its hairline appears only once the body scrolls.
 *
 * Mark complete is the task's finish (W03): a moss disc springs in on the
 * button and the Spark tier bursts from it. Once done it reads "Completed"
 * with the moss check, and pointing at it offers "Mark as not done", which
 * never celebrates.
 */
/** The words a tip stands in for: a crumb's name, or Mark complete's label. */
const TIP_WORDS = "[data-crumb-name],[data-tip-words]"

/** Whether a control's words are cut short where they stand: clamped to their first line, or gone to its glyph or tile (sr-only words are 1 px wide). */
function cutShort(el: HTMLElement | null): boolean {
    const words = el?.matches(TIP_WORDS) ? el : el?.querySelector<HTMLElement>(TIP_WORDS)
    return !!words && (words.scrollWidth > words.clientWidth + 1 || words.scrollHeight > words.clientHeight + 1)
}

/**
 * A crumb's name gives way to the key, which never truncates (STEP4 #8): one
 * clamped line that may break anywhere, as a nowrap name's least width slid
 * the key under Mark complete in the 452 px panel.
 */
const CRUMB_NAME = "line-clamp-1 break-all text-left"

/**
 * Under 40rem of header (the 452 px panel, a phone) a sub-task's parent gives
 * way first, as its project does: its name goes to the tip and a glyph stands
 * for it, with no chevron between it and the key, so Mark complete keeps
 * words (DESIGN-BUILD-10, 24 Oct).
 */
const PARENT_NAME = "min-w-0 @max-[40rem]/taskhead:sr-only"
const PARENT_GLYPH = "hidden size-4 shrink-0 @max-[40rem]/taskhead:block"

/** A crumb cut short, or Mark complete gone to its glyph, shows its words whole in a portalled tip; Escape closes it and goes on to the page (lib/keys/escape). */
function CrumbTip({ name, children, align = "start" }: { name: string; children: ReactElement; align?: "start" | "center" }) {
    const trigger = useRef<HTMLElement | null>(null)
    // A link or a button: the ref takes either.
    const setTrigger = useCallback((el: HTMLElement | null) => {
        trigger.current = el
    }, [])
    const [open, setOpen] = useState(false)
    return (
        <Tooltip open={open} onOpenChange={(next) => setOpen(next && cutShort(trigger.current))}>
            <TooltipTrigger asChild ref={setTrigger}>
                {children}
            </TooltipTrigger>
            <TooltipContent side="bottom" align={align}>
                {name}
            </TooltipContent>
        </Tooltip>
    )
}

/** The open task's keys, first in the keys list while it's up. */
const TASK_KEYS = { title: "This task", rows: [{ keys: chordWords("Mod-."), does: "Copy the task's key" }] }

export function RightPanelTaskHeader({
    isAdmin,
    canDelete = isAdmin,
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
    parent,
    taskKey,
    place,
    onOpenTask,
}: HeaderActionsProps) {
    const post = usePost()
    const dispatch = useDispatch()
    const { isDesktop } = useMedia()
    const copyToClipboard = useCopyToClipboard()
    const copy = copyToClipboard.copy
    // Ctrl/⌘ + . copies the key from anywhere on the open task, as Linear's
    // ⌘. copies an issue's ID.
    useEffect(() => {
        if (!taskKey) return
        const mac = isMacLike()
        const onKey = (e: KeyboardEvent) => {
            if (!chordMatches(e, "Mod-.", mac)) return
            e.preventDefault()
            copy(taskKey, `Copied ${taskKey}`)
        }
        window.addEventListener("keydown", onKey)
        const unlist = showPageKeys(TASK_KEYS)
        return () => {
            window.removeEventListener("keydown", onKey)
            unlist()
        }
    }, [taskKey, copy])
    // The click that completed it plays the fill; a done task on load is still.
    const [justDone, setJustDone] = useState(false)
    // More closes when its link to the page is pressed. Next's Link holds the press while it moves, so Radix's
    // choice never runs and the move closed it; with no network the task stays in the panel (TaskInPlace) and
    // nothing moves, so it closes here, online or not.
    const [moreOpen, setMoreOpen] = useState(false)
    useEffect(() => {
        if (!justDone) return
        const t = setTimeout(() => setJustDone(false), 600)
        return () => clearTimeout(t)
    }, [justDone])

    // The task's own page: what Open the full page goes to and Copy link copies.
    const pageHref = `${app_task_path}/${taskKey || taskUUID}`
    const copyTaskLink = useCallback(() => {
        copyToClipboard.copy(`${window.location.protocol}//${window.location.host}${pageHref}`, "Link copied")
    }, [pageHref, copyToClipboard])

    const handleMarkComplete = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            celebrateTask(e.currentTarget)
            if (!prefersReducedMotion()) setJustDone(true)
            onMarkComplete()
        },
        [onMarkComplete],
    )

    const done = !canMarkComplete
    // More is on every computer's header and holds Copy link and the full page,
    // so a narrow header folds their icons into it. Its own actions (GitHub,
    // delete) are for who may use them; with none, it shows only where it folds.
    const hasMore = isDesktop && !deleted
    const ownMore = (isAdmin || canDelete) && !!onDeleteTask
    const laterButton = taskName ? (
        <SaveForLaterButton
            target={{ itemType: "task", itemId: taskUUID, link: `${app_task_path}/${taskUUID}`, title: taskName, context: projectName }}
            // The header's icon size with a mouse; under a finger 44px, as Mark complete is.
            className="size-7 pointer-coarse:size-11"
        />
    ) : null

    const iconButton = "size-7 text-ink-3 hover:text-foreground"

    return (
        <div
            data-task-header=""
            className={cn(
                "@container/taskhead flex h-[52px] shrink-0 items-center gap-2 border-b pl-5 pr-2.5 transition-colors",
                scrolled ? "border-line" : "border-transparent",
            )}
        >
            {/* Where it sits: the project (its tile and name, a link to it), then
                a subtask's parent. The parent took a line of the body before.
                Under 40rem of header (the panel, a phone) a subtask's project is
                its tile, its name kept for screen readers, so the parent's reads. */}
            {projectName && projectUUID ? (
                <nav aria-label="Where this task sits" className="flex min-w-min shrink items-center">
                    {/* Under a finger the crumbs stand apart: a tile alone (16 px)
                        reaches 14 px past each side (phone.css F3), and so does a
                        parent named in two letters. */}
                    <TooltipProvider>
                    <ol className="flex min-w-0 items-center gap-1 pointer-coarse:gap-3">
                        <li className={cn("flex shrink items-center", parent || taskKey ? "@[40rem]/taskhead:min-w-[96px]" : "min-w-[96px]")}>
                            <CrumbTip name={projectName}>
                                <Link
                                    href={`${app_project_path}/${projectUUID}`}
                                    data-touch-target=""
                                    className="flex min-w-0 items-center gap-1.5 rounded-sm text-ui-sm text-ink-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                                >
                                    <ProjectTile id={projectUUID} size={16} />
                                    <span data-crumb-name="" className={cn(CRUMB_NAME, (parent || taskKey) && "@max-[40rem]/taskhead:sr-only")}>
                                        {projectName}
                                    </span>
                                </Link>
                            </CrumbTip>
                        </li>
                        {parent ? (
                            <li className="flex min-w-0 shrink-[2] items-center gap-1 pointer-coarse:gap-3">
                                <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-4" />
                                {!parent.onOpen ? (
                                    <CrumbTip name={parent.name}>
                                        <span data-hidden-task="" className="flex min-w-0 items-center text-ui-sm text-ink-3">
                                            <CornerUpLeft aria-hidden className={PARENT_GLYPH} />
                                            <span data-crumb-name="" className={cn(CRUMB_NAME, PARENT_NAME)}>
                                                {parent.name}
                                            </span>
                                        </span>
                                    </CrumbTip>
                                ) : (
                                <CrumbTip name={parent.name}>
                                    <button
                                        type="button"
                                        onClick={parent.onOpen}
                                        data-touch-target=""
                                        aria-label={`Open ${parent.name}, the task this one is part of`}
                                        className="flex min-w-0 items-center rounded-sm text-ui-sm text-ink-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                                    >
                                        <CornerUpLeft aria-hidden className={PARENT_GLYPH} />
                                        <span data-crumb-name="" className={cn(CRUMB_NAME, PARENT_NAME)}>
                                            {parent.name}
                                        </span>
                                    </button>
                                </CrumbTip>
                                )}
                            </li>
                        ) : null}
                        {taskKey ? (
                            <li className="flex shrink-0 items-center gap-1 pointer-coarse:gap-3">
                                {/* A parent gone to its glyph leads into the key itself. */}
                                <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-ink-4", parent && "@max-[40rem]/taskhead:hidden")} />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard.copy(taskKey, `Copied ${taskKey}`)}
                                            data-touch-target=""
                                            data-crumb-key=""
                                            aria-label={`Copy key ${taskKey}`}
                                            className="whitespace-nowrap rounded-sm text-ui-sm font-[510] text-ink-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                                        >
                                            {taskKey}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">Copy key</TooltipContent>
                                </Tooltip>
                            </li>
                        ) : null}
                    </ol>
                    </TooltipProvider>
                </nav>
            ) : (
                <span className="min-w-0" />
            )}
            {/* The room between the path and the icons. Mark complete keeps its
                words while they fit there, "Complete" where only that fits (a
                sub-task's room in the 452 px panel, about 119 px against the
                136 its full words take), and is its glyph alone below that, so
                the path's key is never covered (STEP4 #8: in the 452 px panel
                the key slid under it). "Mark as not done" is the longest, so a
                done task swaps to it on hover only where it fits. */}
            <div data-complete-room="" className="@container/complete flex min-w-7 flex-1 justify-end pointer-coarse:min-w-11">
                {!deleted && done && !isAdmin ? (
                    // Someone who can't change the task reads its state, not a
                    // held button: the faded disabled look read 3.45:1 in light
                    // (DESIGN-BUILD-10, 24 Oct).
                    <TooltipProvider>
                    <CrumbTip name="Completed" align="center">
                        <span data-done="" className="flex h-7 items-center gap-1.5 px-1 text-sm font-medium text-foreground pointer-coarse:h-11">
                            <CompleteGlyph done animate={false} />
                            <span data-tip-words="" className="@max-[7rem]/complete:sr-only">Completed</span>
                        </span>
                    </CrumbTip>
                    </TooltipProvider>
                ) : !deleted && isAdmin && (
                    <TooltipProvider>
                    <CrumbTip name={done ? "Completed" : "Mark complete"} align="center">
                    <Button
                        variant="secondary"
                        size="sm"
                        // 44px on a touch screen (the task page on a phone), 28 with a mouse.
                        className={cn(
                            "h-7 gap-1.5 pointer-coarse:h-11",
                            done
                                ? "@max-[7rem]/complete:w-7 @max-[7rem]/complete:px-0 @max-[7rem]/complete:pointer-coarse:w-11"
                                : "@max-[6.75rem]/complete:w-7 @max-[6.75rem]/complete:px-0 @max-[6.75rem]/complete:pointer-coarse:w-11",
                            done && onReopen && "group/done",
                        )}
                        onClick={done ? onReopen : handleMarkComplete}
                        data-done={done || undefined}
                        aria-label={done ? "Task completed" : "Mark task as complete"}
                    >
                        <CompleteGlyph done={done} animate={justDone && done} />
                        {done ? (
                            <>
                                <span data-tip-words="" className={cn("@max-[7rem]/complete:sr-only", onReopen && "@[9.75rem]/complete:group-hover/done:hidden")}>Completed</span>
                                {onReopen && <span className="hidden @[9.75rem]/complete:group-hover/done:inline">Mark as not done</span>}
                            </>
                        ) : (
                            <>
                                <span data-tip-words="" className="@max-[8.5rem]/complete:sr-only">Mark complete</span>
                                <span aria-hidden className="hidden @[6.75rem]/complete:@max-[8.5rem]/complete:inline">Complete</span>
                            </>
                        )}
                    </Button>
                    </CrumbTip>
                    </TooltipProvider>
                )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
                {isDesktop && (
                    // Under 30rem of header it folds into More, which always offers it.
                    <Button variant="ghost" size="icon" className={cn(iconButton, hasMore && "@max-[30rem]/taskhead:hidden")} onClick={copyTaskLink} aria-label="Copy task link">
                        <LinkIcon className="size-4" />
                    </Button>
                )}
                {isDesktop && <ConnectedTrigger kind="task" id={taskUUID} title={taskName} className={`${iconButton} rounded-md`} />}
                {place && place.total > 1 && onOpenTask && <SequenceButtons place={place} onOpen={onOpenTask} className={iconButton} />}
                {/* Under 30rem of header it folds into More too, beside Copy link. */}
                {isDesktop && !onPage && (
                    <Button asChild variant="ghost" size="icon" className={cn(iconButton, hasMore && "@max-[30rem]/taskhead:hidden")}>
                        <Link href={pageHref} aria-label="Open the full page">
                            <ArrowUpRight className="size-4" />
                        </Link>
                    </Button>
                )}
                {laterButton}
                {hasMore && (
                    <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className={cn(iconButton, !ownMore && "@[30rem]/taskhead:hidden")} aria-label="More task actions">
                                <EllipsisVertical className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={copyTaskLink}>
                                <LinkIcon className="mr-2 h-4 w-4" />
                                Copy link
                            </DropdownMenuItem>
                            {!onPage && (
                                <DropdownMenuItem asChild>
                                    <Link href={pageHref} onClick={() => setMoreOpen(false)}>
                                        <ArrowUpRight className="mr-2 h-4 w-4" />
                                        Open the full page
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            {ownMore && <DropdownMenuSeparator />}
                            {ownMore && isAdmin && (
                                <DropdownMenuItem onClick={() => dispatch(openUI({ key: "askApproval", data: { taskId: taskUUID } }))}>
                                    <BadgeCheck className="mr-2 h-4 w-4" />
                                    Ask for approval…
                                </DropdownMenuItem>
                            )}
                            {ownMore && isAdmin && !hasGitHubLink && (
                                <>
                                    <DropdownMenuItem onClick={() => dispatch(openUI({ key: "githubLinkTask", data: { taskId: taskUUID } }))}>
                                        <Github className="mr-2 h-4 w-4" />
                                        Link to GitHub…
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => dispatch(openUI({ key: "createBranch", data: { taskId: taskUUID, taskName: taskName || "" } }))}>
                                        <GitBranch className="mr-2 h-4 w-4" />
                                        Create branch…
                                    </DropdownMenuItem>
                                </>
                            )}
                            {ownMore && isAdmin && hasGitHubLink && (
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
                            {ownMore && isAdmin && canDelete && <DropdownMenuSeparator />}
                            {ownMore && canDelete && (
                                <DropdownMenuItem variant="destructive" onClick={onDeleteTask} className="text-danger-ink">
                                    <Trash className="mr-2 h-4 w-4" />
                                    Delete task
                                </DropdownMenuItem>
                            )}
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
 * Previous and next (STEP4 #8): two 28 px buttons, with "2 / 86" beside them
 * once the header is 40rem wide. At an end the button stays focusable and
 * says why it does nothing.
 */
function SequenceButtons({ place, onOpen, className }: { place: TaskPlace; onOpen: (taskUUID: string) => void; className: string }) {
    const step = (to: string | undefined, label: string, end: string, Icon: typeof ChevronUp) => (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(className, !to && "opacity-40 hover:text-ink-3")}
                    aria-label={to ? label : end}
                    aria-disabled={!to || undefined}
                    data-touch-target=""
                    onClick={() => to && onOpen(to)}
                >
                    <Icon className="size-4" />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{to ? label : end}</TooltipContent>
        </Tooltip>
    )
    return (
        <TooltipProvider>
            <span data-task-sequence-nav="" className="flex items-center gap-0.5">
                <span className="mr-1 hidden text-meta tabular-nums text-ink-3 @[40rem]/taskhead:inline">
                    {place.index} / {place.total}
                </span>
                {step(place.prev, "Previous task (K)", "This is the first task", ChevronUp)}
                {step(place.next, "Next task (J)", "This is the last task", ChevronDown)}
            </span>
        </TooltipProvider>
    )
}

/**
 * The button's glyph: a ring round the check while open (a bare check read as
 * done), filled with moss once done, springing in on the click that completed
 * it (W03). The same at every width.
 */
function CompleteGlyph({ done, animate }: { done: boolean; animate: boolean }) {
    if (!done) {
        return (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" data-glyph="open" className="shrink-0">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
                <path d="m5.2 8.2 1.9 1.9 3.8-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
