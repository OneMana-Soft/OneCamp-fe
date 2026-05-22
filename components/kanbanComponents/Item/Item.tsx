"use client"

import React, { useEffect } from "react"
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
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { ColorIcon } from "@/components/colorIcon/colorIcon"
import { Badge } from "@/components/ui/badge"
import { TaskAssigneeCell } from "@/components/task/taskAssigneeCell"

export interface Props {
    dragOverlay?: boolean
    color?: string
    disabled?: boolean
    dragging?: boolean
    handle?: boolean
    handleProps?: any
    height?: number
    index?: number
    task: TaskInfoInterface
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
 * Format a due date as a short relative chip (e.g. "Today", "Tomorrow",
 * "Mon 02 Jun"). Keeps the card meta footer compact at narrow widths.
 */
function formatDueShort(d: Date): string {
    if (isToday(d)) return "Today"
    if (isTomorrow(d)) return "Tmrw"
    if (isYesterday(d)) return "Yday"
    return format(d, "dd MMM")
}

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
                disabled,
                fadeIn,
                handle,
                handleProps,
                task,
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

            useEffect(() => {
                if (!dragOverlay) return
                document.body.style.cursor = "grabbing"
                return () => {
                    document.body.style.cursor = ""
                }
            }, [dragOverlay])

            const taskP = priorities.find((p) => p.value == task.task_priority)

            const dueDate = !isZeroEpoch(task.task_due_date) ? new Date(task.task_due_date) : null
            const isOverdue = dueDate && dueDate < new Date() && task.task_status !== "done"
            const descPreview = task.task_description ? removeHtmlTags(task.task_description) : ""

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

            const hasMetaRow = Boolean(task.task_project) || Boolean(task.task_label)

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
                            "--translate-x": transform ? `${Math.round(transform.x)}px` : undefined,
                            "--translate-y": transform ? `${Math.round(transform.y)}px` : undefined,
                            "--scale-x": transform?.scaleX ? `${transform.scaleX}` : undefined,
                            "--scale-y": transform?.scaleY ? `${transform.scaleY}` : undefined,
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
                            "group flex flex-col gap-1.5 px-3 py-2.5 w-full min-w-0",
                            "rounded-md bg-card border border-border/60",
                            "transition-[border-color,box-shadow,background-color] duration-150",
                            "hover:border-border hover:shadow-sm",
                            !handle && "cursor-pointer",
                            disabled && "opacity-60 pointer-events-none",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        )}
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
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                openTask()
                            }
                        }}
                    >
                        {/* Optional meta row — project + label */}
                        {hasMetaRow && (
                            <div className="flex items-center gap-2 min-w-0 text-[11px] text-muted-foreground">
                                {task.task_project && (
                                    <span className="inline-flex items-center gap-1 min-w-0 max-w-[60%]">
                                        <ColorIcon name={task.task_project.project_uuid} size="xs" />
                                        <span className="truncate">{task.task_project.project_name}</span>
                                    </span>
                                )}
                                {task.task_label && (
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] h-4 px-1.5 font-medium uppercase tracking-wide truncate max-w-[40%]"
                                    >
                                        {task.task_label}
                                    </Badge>
                                )}
                            </div>
                        )}

                        {/* Title row — title fills width, with an explicit open
                            affordance on the right (always visible on touch,
                            fades in on hover for desktop). The button stops
                            pointer events so it cannot start a drag. */}
                        <div className="flex items-start gap-2 min-w-0">
                            <div className="text-sm font-medium text-foreground leading-snug line-clamp-3 flex-1 min-w-0">
                                {task.task_name}
                            </div>
                            <Button
                                size="icon"
                                variant="ghost"
                                className={cn(
                                    "h-6 w-6 -mr-1 -mt-0.5 shrink-0 text-muted-foreground hover:text-foreground",
                                    "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 transition-opacity",
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

                        {/* Description preview */}
                        {descPreview && (
                            <div className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                                {descPreview}
                            </div>
                        )}

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
                            <div className="ml-auto flex items-center justify-end flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground min-w-0">
                                {taskP && (
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-medium",
                                            taskP.color,
                                        )}
                                        title={`Priority: ${taskP.label}`}
                                    >
                                        <taskP.icon className="h-3 w-3" />
                                        {taskP.label}
                                    </span>
                                )}
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
                                <GitHubBadgeGroup task={task} size="sm" />
                                {dueDate && (
                                    <span
                                        className={cn(
                                            "tabular-nums",
                                            isOverdue && "text-destructive font-medium",
                                        )}
                                        title={format(dueDate, "PPP")}
                                    >
                                        {formatDueShort(dueDate)}
                                    </span>
                                )}
                            </div>
                        </div>

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
