"use client"

import React, { Suspense } from "react"
import type { DraggableSyntheticListeners } from "@dnd-kit/core"
import type { Transform } from "@dnd-kit/utilities"

import { Handle, Remove } from "./components"

import styles from "./Item.module.scss"
import { cn } from "@/lib/utils/helpers/cn"
import { GitBranch, ArrowUpRight, MessageSquare, MoreHorizontal, Clock, Check } from "@/lib/icons"
import { GitHubBadgeGroup } from "@/components/task/PRStatusBadge"
import { useSelector } from "react-redux"
import type { TaskInfoInterface } from "@/types/task"
import type { RootState } from "@/store/store"
import { isClosedStatus, statusOptionOf, statusValueOf } from "@/lib/taskStatus"
import { MenuCheck } from "@/components/ui/menuCheck"
import { timeInStatus } from "@/lib/utils/timeInStatus"
import { splitTags } from "@/lib/tags"
import { BlockedBadge, RestrictedMark } from "@/components/task/BlockedBadge"
import { CardFields } from "@/components/task/cardFields"
import { LabelChip } from "@/components/ui/chip"
import { DueLabel } from "@/components/task/DueLabel"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { displayNameOf } from "@/lib/personName"
import { useBoardActions } from "@/components/kanbanComponents/boardActions"
import { MenuOnDemand } from "@/components/ui/menuOnDemand"
import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useProjectHue } from "@/lib/projectHue"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const TaskTypeGlyph = lazyPiece(() => import("@/components/task/TaskTypeGlyph"))
const WaitingMark = lazyPiece(() => import("@/components/task/WaitingMark"))

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
 * A card's assignee (design v3, §3.9): a 22 px avatar in the person's hue, or
 * the agent's square, so an agent never reads as a person.
 */
function CardAvatar({ user }: { user: NonNullable<TaskInfoInterface["task_assignee"]> }) {
    const { src } = useUserAvatar(user.user_profile_object_key)
    const name = displayNameOf(user)
    if (user.is_bot && user.user_bot_kind === "agent") {
        return (
            <span className="size-[22px] shrink-0" title={name} data-card-avatar="agent">
                <AgentAvatar src={src} />
            </span>
        )
    }
    return (
        <span title={name} data-card-avatar="person" className="inline-flex shrink-0">
            <IdentityMark variant="avatar" id={avatarSeed(user)} label={name} src={src} size={22} />
        </span>
    )
}

/**
 * The card's content, drawn from the task alone (design v3, work.md W21):
 *   1. labels as dot chips, at most two then "+N" (only when it has some);
 *   2. the title, 14/20 at 510, two lines at most;
 *   3. its custom fields shown on cards;
 *   4. the meta row, 22 px: the priority glyph, the due label, the badges
 *      (subtasks, comments, blocked, stale, GitHub), and the assignee's
 *      avatar on the right. On My Tasks the project's tile and name lead it.
 * A finished card's title goes ink-3 and its status glyph sits top right.
 *
 * While a card is dragged, dnd-kit re-renders the cards it moves; memoised on
 * the task, a pointer move never rebuilds a card's contents.
 */
const TaskCardBody = React.memo(function TaskCardBody({ task, statusBadge, crossProject }: { task: TaskInfoInterface; statusBadge?: string; crossProject: boolean }) {
    const done = isClosedStatus(task.task_status)
    // How long it has sat in this status, shown only once it is stale.
    const inStatus = done ? null : timeInStatus(task.task_status_since, task.task_created_at, Date.now())
    const tags = splitTags(task.task_label)
    const project = crossProject ? task.task_project : undefined
    const status = done ? statusOptionOf(task) : undefined

    return (
        <>
            {/* The type, the key and the marks (STEP4 #8): a label line, top left. */}
            {(task.task_key || task.task_blocked_open || task.task_restricted || task.task_waiting) && (
                <div className="flex h-4 min-w-0 items-center gap-1.5 pr-6 text-micro text-ink-3" data-card-key="">
                    {task.task_work_type && (
                        <Suspense fallback={<span className="size-3" />}>
                            <TaskTypeGlyph type={task.task_work_type} className="size-3" />
                        </Suspense>
                    )}
                    {task.task_key && <span className="whitespace-nowrap">{task.task_key}</span>}
                    <RestrictedMark restricted={task.task_restricted} />
                    <BlockedBadge count={task.task_blocked_open} className="text-camp-sun-ink" />
                    {task.task_waiting && (
                        <Suspense fallback={null}>
                            <WaitingMark waiting={task.task_waiting} />
                        </Suspense>
                    )}
                </div>
            )}
            {tags.length > 0 && (
                <div className="flex min-w-0 items-center gap-1.5 pr-6" data-card-labels="">
                    {tags.slice(0, 2).map((t) => (
                        <LabelChip key={t} label={t} className="h-5" />
                    ))}
                    {tags.length > 2 && <span className="chip h-5 text-ink-3">+{tags.length - 2}</span>}
                </div>
            )}

            <div
                data-card-title=""
                className={cn("line-clamp-2 min-w-0 pr-6 text-sm leading-5 font-[510]", done ? "text-ink-3" : "text-foreground")}
                title={task.task_name}
            >
                {task.task_name}
            </div>

            <CardFields values={task.task_fields} />

            <div className="flex min-h-[22px] min-w-0 items-center gap-2" data-card-meta="">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                    {project && (
                        <span className="inline-flex min-w-0 max-w-[45%] items-center gap-1.5" data-card-project="">
                            <ProjectTile id={project.project_uuid} size={16} />
                            <span className="truncate text-xs text-ink-3">{project.project_name}</span>
                        </span>
                    )}
                    <TaskPriorityCell priority={task.task_priority} label="tip" />
                    <DueLabel date={task.task_due_date} done={done} variant="card" />
                    {statusBadge && (
                        <span className="max-w-[40%] truncate font-[510] text-ink-2" title="Status">
                            {statusBadge}
                        </span>
                    )}
                    {task.task_sub_task_count > 0 && (
                        <span className="inline-flex items-center gap-1 tabular-nums" title="Subtasks">
                            <GitBranch className="size-3" aria-hidden="true" />
                            {task.task_sub_task_count}
                        </span>
                    )}
                    {task.task_comment_count > 0 && (
                        <span className="inline-flex items-center gap-1 tabular-nums" title="Comments">
                            <MessageSquare className="size-3" aria-hidden="true" />
                            {task.task_comment_count}
                        </span>
                    )}
                    {inStatus?.stale && (
                        <span
                            className="inline-flex items-center gap-1 tabular-nums text-warning-ink"
                            title={`In this status for ${inStatus.days} ${inStatus.days === 1 ? "day" : "days"}`}
                        >
                            <Clock className="size-3" aria-hidden="true" />
                            {inStatus.short}
                        </span>
                    )}
                    <GitHubBadgeGroup task={task} size="sm" />
                </div>
                {task.task_assignee && <CardAvatar user={task.task_assignee} />}
            </div>

            {status && (
                <span className="absolute right-3 top-3 transition-opacity group-hover:opacity-0" data-card-done-glyph="">
                    <TaskStatusCell status={status} label="tip" size={14} />
                </span>
            )}
        </>
    )
})

// Under a finger the 24px button's hit area is 44px (data-touch-target, app/phone.css).
const MENU_BUTTON =
    "inline-flex size-6 items-center justify-center rounded-sm bg-pop text-ink-3 shadow-e1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** The card's menu: open it, or move it to another column (every drag has a menu alternative). */
function CardMenu({ task, onOpen }: { task: TaskInfoInterface; onOpen: () => void }) {
    const board = useBoardActions()
    const canMove = board ? board.canMove(task) : false
    // On a phone the menu is the board's sheet (CardSheet).
    const openMenu = board?.openMenu
    if (openMenu) {
        return (
            <button
                type="button"
                aria-label="Card actions"
                aria-haspopup="dialog"
                // A press here neither opens the card nor picks it up.
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation()
                    openMenu(task)
                }}
                className={MENU_BUTTON}
                data-touch-target=""
            >
                <MoreHorizontal className="size-3.5" />
            </button>
        )
    }
    return (
        // In the tree only while it is open: every card on a board had one
        // mounted (MenuProvider ×120 on 120 cards; F-1 #2).
        <MenuOnDemand
            menu={(onDemand) => (
            <DropdownMenuContent {...onDemand} align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={onOpen}>
                    <ArrowUpRight className="size-3.5" />
                    Open
                </DropdownMenuItem>
                {board && canMove && (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-52">
                            {/* The column it is in carries the check, as the phone's sheet marks it (current). */}
                            {board.columns().map((c) => {
                                const here = c.value === statusValueOf(task)
                                return (
                                    <DropdownMenuItem key={c.value} aria-current={here ? "true" : undefined} onSelect={() => !here && board.moveTo(task, c.value)}>
                                        <MenuCheck checked={here} />
                                        {c.custom || c.category ? <TaskStatusCell status={c} label="word" className="text-xs" /> : c.label}
                                    </DropdownMenuItem>
                                )
                            })}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                )}
            </DropdownMenuContent>
            )}
        >
            <button
                type="button"
                aria-label="Card actions"
                // A press here neither opens the card nor picks it up.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={MENU_BUTTON}
                data-touch-target=""
            >
                <MoreHorizontal className="size-3.5" />
            </button>
        </MenuOnDemand>
    )
}

/**
 * A board card (design v3, work.md W21): raised, resting (e1), r10, lifting
 * to e2 under the pointer. Its states: opened in the panel (an inset brand
 * ring on a brand-muted ground), selected for a bulk change (--sel and a
 * check badge), the keyboard's cursor (an inset ring), held from the keyboard
 * (ringed and floating), and, while dragged, a dashed slot (Item.module.scss).
 * The whole card opens the task; its open button and menu wait on hover.
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
            const board = useBoardActions()
            const crossProject = Boolean(board?.crossProject)
            const taskProjectHue = useProjectHue(task.task_project?.project_uuid)
            const edgeHue = crossProject && task.task_project?.project_uuid ? taskProjectHue : undefined
            // The task open in the panel beside the board.
            const opened = Boolean(
                useSelector((state: RootState) => state.rightPanel?.rightPanelState?.isOpen && state.rightPanel.rightPanelState.data.taskUUID === task.task_uuid),
            )

            // No cursor on <body> while dragging: changing a style on body makes
            // the browser restyle the whole page, the most expensive frame of a
            // pick-up. The lifted card carries the grabbing cursor itself.

            // The board opens it: in the panel beside it, or on a phone the task's page.
            const openTask = () => board?.open(task)

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
                            "group group/row relative flex w-full min-w-0 select-none flex-col gap-2 overflow-visible p-3",
                            // The material (work.md W21): raised, resting, r10.
                            "rounded-[10px] bg-raised shadow-e1",
                            // A card is a thing to open: it lifts a pixel to e2 under the
                            // pointer (hover-lift; still for reduced motion, never the copy).
                            !dragOverlay && !dragging && "hover-lift",
                            !handle && !disabled && "cursor-grab active:cursor-grabbing",
                            disabled && "cursor-pointer",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sunken",
                            opened && !dragging && "bg-[color-mix(in_oklab,var(--brand-muted)_40%,var(--raised))] ring-[1.5px] ring-inset ring-brand",
                            selected && "bg-sel",
                            highlighted && !opened && "ring-1 ring-inset ring-brand/45",
                            lifted && "ring-2 ring-brand shadow-e3",
                            // My Tasks: the project's 3px edge along the top, inside the radius.
                            edgeHue && ["before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-[10px] before:bg-hue before:content-['']", HUE_CLASS[edgeHue]],
                        )}
                        // The phone's press response for a card (mobile F2): 0.985 while
                        // a finger is down; never on the copy that follows a drag.
                        data-press={dragOverlay ? undefined : "card"}
                        data-selected={selected || undefined}
                        data-opened={opened || undefined}
                        data-project-edge={edgeHue}
                        style={style}
                        data-cypress="draggable-item"
                        {...(!handle ? listeners : undefined)}
                        {...props}
                        tabIndex={!handle ? 0 : undefined}
                        onClick={() => {
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
                        {selected && (
                            <span aria-hidden="true" className="absolute -left-1.5 -top-1.5 z-10 inline-flex size-4 items-center justify-center rounded-[5px] bg-camp-moss text-white shadow-e1">
                                <Check className="size-3" />
                            </span>
                        )}
                        {selected && <span className="sr-only">Selected.</span>}
                        <TaskCardBody task={task} statusBadge={statusBadge} crossProject={crossProject} />

                        {/* Open, and the card's menu: top right, on hover; on a touch screen the menu alone, always. */}
                        {!dragOverlay && (
                            <span
                                className={cn(
                                    "absolute right-2 top-2 z-10 inline-flex items-center gap-1 transition-opacity duration-[140ms]",
                                    "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
                                    dragging && "hidden",
                                )}
                            >
                                <button
                                    type="button"
                                    aria-label="Open task"
                                    // A touch screen has no hover to reveal it by, and a tap
                                    // on the card opens it: there it would only cover the
                                    // title (two 24px buttons over its 24px of room).
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        openTask()
                                    }}
                                    className={cn(MENU_BUTTON, "[@media(hover:none)]:hidden")}
                                    data-touch-target=""
                                >
                                    <ArrowUpRight className="size-3.5" />
                                </button>
                                <CardMenu task={task} onOpen={openTask} />
                            </span>
                        )}

                        {/* Drag handle / remove (only present when handle prop is true) */}
                        {(onRemove || handle) && (
                            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1">
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
