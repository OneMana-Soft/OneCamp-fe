import React, { forwardRef, useCallback } from "react"

import { Remove } from "../Item"

import styles from "./Container.module.css"
import { cn } from "@/lib/utils/helpers/cn"
import { taskStatuses } from "@/types/table"
import { MoreHorizontal, Plus } from "@/lib/icons"
import { CountTick } from "@/components/ui/CountTick"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { isBuiltInStatus, type StatusOption } from "@/lib/taskStatus"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { columnHue, columnLozenge, columnWash } from "@/components/kanbanComponents/columnLook"

interface Props {
    children: React.ReactNode
    columns?: number
    label?: string
    /** Cards in the column; shown beside its name. */
    count?: number
    /** The column's name when it is not one of the built-in statuses. */
    title?: string
    /** The column's status (its glyph), or a person's column on a board of people. */
    status?: StatusOption
    style?: React.CSSProperties
    horizontal?: boolean
    /** A card from another column is over this one. */
    hover?: boolean
    /** A card is being dragged somewhere on the board. */
    dragActive?: boolean
    scrollable?: boolean
    shadow?: boolean
    placeholder?: boolean
    unstyled?: boolean
    onClick?(): void
    onRemove?(): void
    /** Folded to a slim strip (a long Done column, say); its cards are not rendered. */
    collapsed?: boolean
    onToggleCollapse?(): void
    /** The header's "+": a new task in this column. */
    onAdd?(): void
    /** Below the cards, outside the scroll: the column's "New task". */
    footer?: React.ReactNode
}

/**
 * The column's mark: its status glyph (in a project's own hue for its own
 * status), a person's avatar on a board of people, or a dashed ring for "No
 * assignee". Its header's, and its row's in a card's sheet (CardSheet).
 */
export function ColumnMark({ status, label }: { status?: StatusOption; label?: string }) {
    if (status && (status.custom || isBuiltInStatus(status.value))) return <TaskStatusCell status={status} label="tip" />
    if (!status) {
        const builtIn = taskStatuses.find((s) => s.value === label)
        return builtIn ? <TaskStatusCell status={{ value: builtIn.value, label: builtIn.label }} label="tip" /> : null
    }
    if (status.label === "No assignee") {
        return <span aria-hidden="true" data-column-mark="none" className="size-4 shrink-0 rounded-full border border-dashed border-line-3" />
    }
    return <IdentityMark variant="avatar" id={avatarSeed(status.label)} label={status.label} size={18} />
}

/** A 16px fade at the card list's cut edges, set on scroll with no render (a mask, not a shadow). */
function useEdgeFade() {
    return useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget
        if (el.scrollTop > 2) el.dataset.fadeTop = ""
        else delete el.dataset.fadeTop
        if (el.scrollTop + el.clientHeight < el.scrollHeight - 2) el.dataset.fadeBottom = ""
        else delete el.dataset.fadeBottom
    }, [])
}

/** The header's "+" and "⋯": 24px, which a finger takes 44px wide (data-touch-target, app/phone.css). */
const HEAD_BUTTON =
    "inline-flex size-6 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * A board column (design v3, work.md W20): 264 to 320px, on the sunken
 * surface at r12 with no border, washed in its status's hue where the status
 * has one (columnLook). A 40px header carries a lozenge, the status glyph and
 * the name at 13/510 on the hue's tint, then a count that ticks; "+" is
 * always there, "⋯" waits on the column's hover. The cards scroll inside it,
 * with a soft fade where they are cut. A card from another column makes it
 * the layer's drop well (a dashed accent edge and tint, INTERACTION_SPEC
 * §5.2); in its own column a card only opens a gap. Folded, it is a 40px
 * strip that is one button to unfold.
 */
export const Container = forwardRef<HTMLDivElement, Props>(
    (
        {
            children,
            columns = 1,
            horizontal,
            hover,
            dragActive,
            onClick,
            onRemove,
            label,
            count,
            title,
            status,
            placeholder,
            style,
            scrollable,
            shadow,
            unstyled,
            collapsed,
            onToggleCollapse,
            onAdd,
            footer,
            ...props
        }: Props,
        ref,
    ) => {
        const Component = onClick ? "button" : "div"
        const builtIn = taskStatuses.find((s) => s.value == label)
        const name = title ?? builtIn?.label ?? label
        const onScroll = useEdgeFade()
        const tasksWord = count === 1 ? "task" : "tasks"
        const hue = columnHue(status)

        // Folded: a strip with the glyph, the name running down it and the
        // count, all one button. Still a drop target (the ref).
        if (collapsed) {
            return (
                <div
                    {...props}
                    ref={ref}
                    data-collapsed=""
                    data-drop={hover ? "valid" : undefined}
                    className={cn(
                        "flex h-full w-10 shrink-0 snap-start rounded-lg transition-colors duration-[140ms] [animation:work-fade-in_140ms_var(--ease-out)]",
                        columnWash(hue),
                    )}
                >
                    <button
                        type="button"
                        onClick={onToggleCollapse}
                        aria-label={`Expand ${name}`}
                        title={`Expand ${name}`}
                        className="flex h-full w-full flex-col items-center gap-2 rounded-lg py-3 text-ink-3 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ColumnMark status={status} label={label} />
                        <span className="select-none text-xs font-[510] text-foreground [writing-mode:vertical-rl]">{name}</span>
                        {count !== undefined && <span className="text-xs tabular-nums text-ink-3">{count}</span>}
                    </button>
                </div>
            )
        }

        return (
            <Component
                {...props}
                ref={ref as React.Ref<HTMLDivElement & HTMLButtonElement>}
                style={{ ...style, "--columns": columns } as React.CSSProperties}
                className={cn(
                    styles.Container,
                    horizontal && styles.horizontal,
                    placeholder && styles.placeholder,
                    scrollable && styles.scrollable,
                    unstyled && styles.unstyled,
                    !unstyled && [
                        // On a desktop the columns share the board's width, 264 to
                        // 320px each, and scroll past that: at a fixed 280px the
                        // fourth column was cut by 12px at 1440 (work.md W20,
                        // "nothing is clipped"). On a phone a column is the screen
                        // less 56px: the board snaps each to its 16px margin and the
                        // next one shows 32px at the right, as Trello's lists do, so
                        // the board says it goes on (it filled the screen less 32px,
                        // and only the pager's dots said there was more). A swipe
                        // stops at the next column (snap-always): a quick one flew
                        // past it, from To do to Done.
                        "group/column w-[calc(100vw-56px)] shrink-0 snap-start snap-always sm:w-auto sm:min-w-[264px] sm:max-w-[320px] sm:flex-1 sm:basis-0",
                        // A column's layout is its own: when a card moves in or
                        // out, the browser re-lays out this column and not the
                        // whole page, which is most of the cost of a crossing.
                        "[contain:layout]",
                        "rounded-lg",
                        columnWash(hue),
                        "transition-[background-color,box-shadow] duration-[140ms]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ],
                    shadow && "shadow-e1",
                )}
                onClick={onClick}
                tabIndex={onClick ? 0 : undefined}
                data-drag-over={hover || undefined}
                data-drop={hover ? "valid" : undefined}
            >
                {label ? (
                    <div className="flex h-10 shrink-0 items-center gap-2 pl-2 pr-2" data-column-head="">
                        {/* The lozenge (Jira's, Notion's pill): the stage in its colour,
                            read from across the room. */}
                        <h2 data-column-lozenge="" className={cn("inline-flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-2 text-xs font-[510]", columnLozenge(hue))}>
                            <ColumnMark status={status} label={label} />
                            <span className="truncate">{name}</span>
                        </h2>
                        {count !== undefined && (
                            <span className="text-xs font-[450] text-ink-3" aria-label={`${count} ${tasksWord}`}>
                                <CountTick value={count} />
                            </span>
                        )}
                        <div className={cn(styles.Actions, "ml-auto")}>
                            {/* "+" in every column, at rest, as Jira's "+ Create". */}
                            {onAdd && (
                                <button
                                    type="button"
                                    onClick={onAdd}
                                    aria-label={`New task in ${name}`}
                                    className={HEAD_BUTTON}
                                    data-touch-target=""
                                >
                                    <Plus className="size-3.5" />
                                </button>
                            )}
                            <div className={cn(styles.Actions, "opacity-0 pointer-events-none transition-opacity duration-[140ms] focus-within:opacity-100 focus-within:pointer-events-auto group-hover/column:opacity-100 group-hover/column:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto")}>
                            {(onToggleCollapse || onAdd) && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label={`${name} column actions`}
                                            className={HEAD_BUTTON}
                                            data-touch-target=""
                                        >
                                            <MoreHorizontal className="size-3.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                        {onAdd && <DropdownMenuItem onSelect={onAdd}>New task here</DropdownMenuItem>}
                                        {onToggleCollapse && <DropdownMenuItem onSelect={onToggleCollapse}>Collapse</DropdownMenuItem>}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            {onRemove ? <Remove onClick={onRemove} /> : undefined}
                            </div>
                        </div>
                    </div>
                ) : null}
                {placeholder ? children : (
                    <div className={cn(styles.Content, styles.Fade)} data-board-scroll="" onScroll={onScroll}>
                        {children}
                        {count === 0 && dragActive && (
                            <div data-drop-slot="" className="flex h-16 shrink-0 items-center justify-center rounded-[10px] text-2xs text-ink-3 outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-line-3">
                                Drop tasks here
                            </div>
                        )}
                    </div>
                )}
                {footer}
            </Component>
        )
    },
)

Container.displayName = "Container"
