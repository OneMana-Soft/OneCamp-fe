import React, { forwardRef } from "react"

import { Remove } from "../Item"

import styles from "./Container.module.css"
import { cn } from "@/lib/utils/helpers/cn"
import { taskStatuses } from "@/types/table"
import { Minimize2, Maximize2 } from "@/lib/icons"

interface Props {
    children: React.ReactNode
    columns?: number
    label?: string
    /** Cards in the column; shown beside its name. */
    count?: number
    /** The column's name and icon when it is not one of the built-in statuses. */
    title?: string
    icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
    /** A project's own status: its colour, as a dot beside the name. */
    swatchClass?: string
    style?: React.CSSProperties
    horizontal?: boolean
    hover?: boolean
    scrollable?: boolean
    shadow?: boolean
    placeholder?: boolean
    unstyled?: boolean
    onClick?(): void
    onRemove?(): void
    /** Folded to a slim strip (a long Done column, say); its cards are not rendered. */
    collapsed?: boolean
    onToggleCollapse?(): void
    /** Below the cards, outside the scroll: the column's "Add task". */
    footer?: React.ReactNode
}

/**
 * Kanban Container (column) — Notion-style flat panel with a clear header
 * and scrollable item area. Uses design tokens so dark mode adapts. Width
 * is fixed at 320px to match Linear / Notion column density.
 */
export const Container = forwardRef<HTMLDivElement, Props>(
    (
        {
            children,
            columns = 1,
            horizontal,
            hover,
            onClick,
            onRemove,
            label,
            count,
            title,
            icon,
            swatchClass,
            placeholder,
            style,
            scrollable,
            shadow,
            unstyled,
            collapsed,
            onToggleCollapse,
            footer,
            ...props
        }: Props,
        ref,
    ) => {
        const Component = onClick ? "button" : "div"
        const status = taskStatuses.find((s) => s.value == label)
        const Icon = icon ?? (swatchClass ? undefined : status?.icon)
        const name = title ?? status?.label ?? label

        // Folded: a strip with the name running down it, and the count. Still a
        // drop target (the ref), so a card can be dropped onto it.
        if (collapsed) {
            return (
                <div
                    {...props}
                    ref={ref}
                    className={cn(
                        "shrink-0 mx-1 flex h-full w-11 flex-col items-center gap-2 rounded-lg border border-border/60 bg-card py-2 transition-colors duration-150",
                        hover && "bg-accent/40",
                    )}
                >
                    <button
                        type="button"
                        onClick={onToggleCollapse}
                        aria-label={`Expand ${name}`}
                        title={`Expand ${name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
                    <span className="flex-1 select-none text-sm font-semibold text-foreground [writing-mode:vertical-rl]">{name}</span>
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
                        // On a phone one column fills the screen and the board snaps to each.
                        "group/column shrink-0 mx-2 my-0 w-[min(320px,calc(100vw-5rem))] snap-center rounded-lg",
                        // A column's layout is its own: when a card moves in or
                        // out, the browser re-lays out this column and not the
                        // whole page, which is most of the cost of a crossing.
                        "[contain:layout]",
                        // A lane on the sheet, not a box around boxes: the
                        // cards carry the hairline, the column only a tint.
                        "bg-muted/50",
                        "transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    ],
                    hover && "bg-accent/40",
                    placeholder && [
                        "border-dashed bg-transparent",
                        "items-center justify-center cursor-pointer",
                        "text-muted-foreground hover:text-foreground hover:border-border",
                    ],
                    shadow && "shadow-sm",
                )}
                onClick={onClick}
                tabIndex={onClick ? 0 : undefined}
            >
                {label ? (
                    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            {Icon && <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />}
                            {swatchClass && <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", swatchClass)} />}
                            {name}
                        </h2>
                        {/* No drag handle: column order was never saved, so a
                            moved column went back on reload. The count says more. */}
                        <div className={styles.Actions}>
                            {onToggleCollapse && (
                                <button
                                    type="button"
                                    onClick={onToggleCollapse}
                                    aria-label={`Collapse ${name}`}
                                    title={`Collapse ${name}`}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 group-hover/column:opacity-100"
                                >
                                    <Minimize2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                            {count !== undefined && (
                                <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-label={`${count} ${count === 1 ? "task" : "tasks"}`}>
                                    {count}
                                </span>
                            )}
                            {onRemove ? <Remove onClick={onRemove} /> : undefined}
                        </div>
                    </div>
                ) : null}
                {placeholder ? children : (
                    <div className={styles.Content} data-board-scroll="">
                        {children}
                        {count === 0 && (
                            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                                Nothing here. Drag a task in to move it.
                            </p>
                        )}
                    </div>
                )}
                {footer}
            </Component>
        )
    },
)

Container.displayName = "Container"
