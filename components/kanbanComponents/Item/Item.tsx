"use client"
import { shortDate } from "@/lib/utils/date/shortDate"

import React from "react"
import type { DraggableSyntheticListeners } from "@dnd-kit/core"
import type { Transform } from "@dnd-kit/utilities"

import { Handle, Remove } from "./components"

import styles from "./Item.module.scss"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { GitBranch, ArrowUpRight, MessageSquare } from "@/lib/icons"
import { GitHubBadgeGroup } from "@/components/task/PRStatusBadge"
import { format, isToday, isTomorrow, isYesterday } from "date-fns"
import { useDispatch } from "react-redux"
import { TaskInfoInterface } from "@/types/task"
import { priorities } from "@/types/table"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { ColorIcon } from "@/components/colorIcon/colorIcon"
import { TaskAssigneeCell } from "@/components/task/taskAssigneeCell"
import { isClosedStatus } from "@/lib/taskStatus"
import { timeInStatus } from "@/lib/utils/timeInStatus"
import { TagPills } from "@/components/tags/TagPills"
import { Clock } from "@/lib/icons"
import { BlockedBadge } from "@/components/task/BlockedBadge"
import { CardFields } from "@/components/task/fieldValue"

interface Props {
    dragOverlay?: boolean
    color?: string
    disabled?: boolean
    dragging?: boolean
    /** Picked up from the keyboard: it stays in place, ringed, while the board's line moves. */
    lifted?: boolean
    handle?: boolean
    handleProps?: any
    height?: number
    index?: number
    task: TaskInfoInterface
    /** A status to show on the card, when its column does not already say it. */
    statusBadge?: string
    /** Where the keyboard is on the board (lib/listKeys). */
    highlighted?: boolean
    /** Picked for a change to many tasks at once. */
    selected?: boolean
    fadeIn?: boolean
    transform?: Transform | null
    listeners?: DraggableSyntheticListeners
    sorting?: boolean
    style?: React.CSSProperties
    transition?: string | null
    wrapperStyle?: React.CSSProperties
    value: React.ReactNode
    onRemove?(): void
    renderItem?(args: {
        dragOverlay: boolean
        dragging: boolean
        sorting: boolean
        index: number | undefined
        fadeIn: boolean
        listeners: DraggableSyntheticListeners
        ref: React.Ref<HTMLElement>
        style: React.CSSProperties | undefined
        transform: Props["transform"]
        transition: Props["transition"]
        value: Props["value"]
    }): React.ReactElement
}

/**
 * A due date as the card says it: "Today", "Tomorrow", "Yesterday", else
 * "2 Jun". Whole words: "Tmrw" and "Yday" saved two letters and cost a read.
 */
function formatDueShort(d: Date): string {
    if (isToday(d)) return "Today"
    if (isTomorrow(d)) return "Tomorrow"
    if (isYesterday(d)) return "Yesterday"
    return shortDate(d)
}

/**
 * The card's content, drawn from the task alone.
 *
 * While a card is dragged, dnd-kit re-renders every sortable card on every
 * pointer move so it can hand each one its new transform. The card used to
 * rebuild everything each time (avatar, GitHub badges, date formatting,
 * stripping the description's HTML), and on an ordinary laptop that stalled
 * frames for up to 180ms with five cards on the board. Memoised on the task,
 * a pointer move now only moves the cards.
 */
const TaskCardBody = React.memo(function TaskCardBody({ task, statusBadge }: { task: TaskInfoInterface; statusBadge?: string }) {
    const dispatch = useDispatch()
    const taskP = priorities.find((p) => p.value == task.task_priority)
    const dueDate = !isZeroEpoch(task.task_due_date) ? new Date(task.task_due_date) : null
    const isOverdue = dueDate && dueDate < new Date() && !isClosedStatus(task.task_status)
    // How long it has sat in this status; finished work is not waiting on anyone.
    const inStatus = isClosedStatus(task.task_status) ? null : timeInStatus(task.task_status_since, task.task_created_at, Date.now())
    const hasMetaRow = Boolean(task.task_project) || Boolean(task.task_label) || Boolean(statusBadge)
    const openTask = () => {
        dispatch(
            openRightPanel({
                chatMessageUUID: "",
                chatUUID: "",
                channelUUID: "",
                postUUID: "",
                taskUUID: task.task_uuid,
                groupUUID: "",
                docUUID: "",
            }),
        )
    }

    return (
        <>
            {/* Optional meta row — project + label */}
            {hasMetaRow && (
                <div className="flex items-center gap-2 min-w-0 text-2xs text-muted-foreground">
                    {task.task_project && (
                        <span className="inline-flex items-center gap-1 min-w-0 max-w-[60%]">
                            <ColorIcon name={task.task_project.project_uuid} size="dot" />
                            <span className="truncate">{task.task_project.project_name}</span>
                        </span>
                    )}
                    {statusBadge && (
                        <span className="truncate max-w-[40%] font-medium" title="Status">
                            {statusBadge}
                        </span>
                    )}
                    <TagPills label={task.task_label} max={2} className="min-w-0" />
                </div>
            )}

            {/* Title row — title fills width, with an explicit open
                affordance on the right (always visible on touch,
                fades in on hover for desktop). The button stops
                pointer events so it cannot start a drag. */}
            <div className="flex items-start gap-2 min-w-0">
                <div className="text-sm font-medium text-foreground leading-snug line-clamp-2 flex-1 min-w-0" title={task.task_name}>
                    {task.task_name}
                </div>
                <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                        "h-6 w-6 -mr-1 -mt-0.5 shrink-0 text-muted-foreground hover:text-foreground",
                        "md:opacity-0 pointer-events-none md:group-hover:opacity-100 group-hover:pointer-events-auto md:focus-visible:opacity-100 transition-opacity [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
                    )}
                    aria-label="Open task"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation()
                        openTask()
                    }}
                >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* No description preview: two grey lines under every title made a
                column of six cards a page of text. The panel shows it whole. */}

            {/* The project's own fields its board shows on cards. */}
            <CardFields values={task.task_fields} />

            {/* Footer */}
            <div className="flex items-center gap-2 mt-1 min-w-0">
                {/* Assignee on the left, fixed slot — keeps the avatar in the same place across cards. */}
                <div className="shrink-0">
                    {task.task_assignee ? (
                        <TaskAssigneeCell userInfo={task.task_assignee} avatarOnly />
                    ) : (
                        <span className="block h-6 w-6" />
                    )}
                </div>

                {/* Meta cluster on the right, allowed to wrap. */}
                <div className="ml-auto flex items-center justify-end flex-wrap gap-x-2 gap-y-1 text-2xs text-muted-foreground min-w-0">
                    {taskP?.value === "high" && (
                        // Only High: it is the priority that asks for attention.
                        // Low and Medium on every card were words nobody read.
                        <span className="inline-flex items-center gap-1" title={`Priority: ${taskP.label}`}>
                            <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", taskP.dot)} />
                            {taskP.label}
                        </span>
                    )}
                    <BlockedBadge count={task.task_blocked_open} />
                    {task.task_comment_count > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Comments">
                            <MessageSquare className="h-3 w-3" />
                            {task.task_comment_count}
                        </span>
                    )}
                    {task.task_sub_task_count > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Subtasks">
                            <GitBranch className="h-3 w-3" />
                            {task.task_sub_task_count}
                        </span>
                    )}
                    {inStatus && (
                        <span
                            className={cn("inline-flex items-center gap-0.5 tabular-nums", inStatus.stale && "text-warning-ink")}
                            title={`In this status for ${inStatus.days} ${inStatus.days === 1 ? "day" : "days"}`}
                        >
                            <Clock className="h-3 w-3" />
                            {inStatus.short}
                        </span>
                    )}
                    <GitHubBadgeGroup task={task} size="sm" />
                    {dueDate && (
                        <span
                            className={cn(
                                "tabular-nums",
                                isOverdue && "text-danger-ink",
                            )}
                            title={format(dueDate, "PPP")}
                        >
                            {formatDueShort(dueDate)}
                        </span>
                    )}
                </div>
            </div>
        </>
    )
})

/**
 * Kanban Item — Notion / Linear–style task card.
 *
 * Layout, top-down, designed to remain readable inside a 320px column:
 *   1. Optional meta row: project tag + label badge (only renders when
 *      either is present, so simple cards stay clean).
 *   2. Title (1–3 line clamp).
 *   3. Optional 2-line description preview.
 *   4. Footer row: assignee avatar on the left (or a placeholder gap),
 *      meta cluster on the right that wraps gracefully — priority dot,
 *      due date, comments, subtasks, GitHub badges. Each item is sized
 *      to render cleanly at 280px wide and shrinks with `flex-wrap`.
 *
 * The whole card opens TaskInfoPanel on click. No separate edit button —
 * the card is the affordance, matching Linear / Notion.
 */
export const Item = React.memo(
    React.forwardRef<HTMLDivElement, Props>(
        (
            {
                color,
                dragOverlay,
                dragging,
                lifted,
                disabled,
                fadeIn,
                handle,
                handleProps,
                task,
                statusBadge,
                highlighted,
                selected,
                index,
                listeners,
                onRemove,
                renderItem,
                sorting,
                style,
                transition,
                transform,
                value,
                wrapperStyle,
                ...props
            },
            ref,
        ) => {
            const dispatch = useDispatch()

            // No cursor on <body> while dragging: changing a style on body makes
            // the browser restyle the whole page, the most expensive frame of a
            // pick-up. The lifted card carries the grabbing cursor itself.

            const openTask = () => {
                dispatch(
                    openRightPanel({
                        chatMessageUUID: "",
                        chatUUID: "",
                        channelUUID: "",
                        postUUID: "",
                        taskUUID: task.task_uuid,
                        groupUUID: "",
                        docUUID: "",
                    }),
                )
            }

            if (renderItem) {
                return renderItem({
                    dragOverlay: Boolean(dragOverlay),
                    dragging: Boolean(dragging),
                    sorting: Boolean(sorting),
                    index,
                    fadeIn: Boolean(fadeIn),
                    listeners,
                    ref,
                    style,
                    transform,
                    transition,
                    value,
                })
            }

            return (
                <div
                    className={cn(
                        styles.Wrapper,
                        fadeIn && styles.fadeIn,
                        sorting && styles.sorting,
                        dragOverlay && styles.dragOverlay,
                    )}
                    style={
                        {
                            ...wrapperStyle,
                            transition: [transition, wrapperStyle?.transition].filter(Boolean).join(", "),
                            // Only a card that is given a transform has one (see Item.module.scss).
                            transform: transform
                                ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX ?? 1}) scaleY(${transform.scaleY ?? 1})`
                                : undefined,
                            "--scale-x": transform?.scaleX ? `${transform.scaleX}` : undefined,
                            "--index": index,
                        } as React.CSSProperties
                    }
                    ref={ref}
                >
                    <div
                        className={cn(
                            styles.Item,
                            dragging && styles.dragging,
                            handle && styles.withHandle,
                            dragOverlay && styles.dragOverlay,
                            disabled && styles.disabled,
                            // select-none: pressing to drag must not start selecting the
                            // card's words, which also scrolled the column under the pointer.
                            "group flex flex-col gap-1.5 px-3 py-2.5 w-full min-w-0 select-none",
                            "rounded-lg bg-card border border-border/60",
                            // A card is a thing to open: it lifts a pixel under the
                            // pointer (the playful layer's hover-lift; still for
                            // reduced motion, and never on the lifted copy).
                            !dragOverlay && !dragging && "hover-lift",
                            "transition-[border-color,box-shadow,background-color,translate] duration-150",
                            "hover:border-border",
                            !handle && "cursor-pointer",
                            disabled && "opacity-60 pointer-events-none",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                            selected && "border-primary/50 bg-primary/5",
                            highlighted && "ring-2 ring-ring/40",
                            lifted && "ring-2 ring-ring shadow-overlay",
                        )}
                        data-selected={selected || undefined}
                        style={style}
                        data-cypress="draggable-item"
                        {...(!handle ? listeners : undefined)}
                        {...props}
                        tabIndex={!handle ? 0 : undefined}
                        onClick={(e) => {
                            // Don't open while drag is finishing or while element is being dragged.
                            if (dragOverlay || dragging) return
                            openTask()
                        }}
                        onKeyDown={(e) => {
                            // Enter opens. Space opens a card that can't be moved; on one
                            // that can, the board takes Space to pick it up (TaskBoard).
                            if (e.target !== e.currentTarget) return
                            if (e.key === "Enter" || (e.key === " " && !listeners)) {
                                e.preventDefault()
                                openTask()
                            }
                        }}
                    >
                        {selected && <span className="sr-only">Selected.</span>}
                        <TaskCardBody task={task} statusBadge={statusBadge} />

                        {/* Drag handle / remove (only present when handle prop is true) */}
                        {(onRemove || handle) && (
                            <span className="absolute top-2 right-2 inline-flex items-center gap-1">
                                {onRemove && <Remove className={styles.Remove} onClick={onRemove} />}
                                {handle && <Handle {...handleProps} {...listeners} />}
                            </span>
                        )}
                    </div>
                </div>
            )
        },
    ),
)

Item.displayName = "Item"
