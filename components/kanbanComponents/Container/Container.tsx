import React, { forwardRef } from "react"

import { Remove } from "../Item"

import styles from "./Container.module.css"
import { cn } from "@/lib/utils/helpers/cn"
import { taskStatuses } from "@/types/table"

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
            ...props
        }: Props,
        ref,
    ) => {
        const Component = onClick ? "button" : "div"
        const status = taskStatuses.find((s) => s.value == label)
        const Icon = icon ?? status?.icon
        const name = title ?? status?.label ?? label

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
                        "shrink-0 mx-2 my-0 w-[320px] rounded-lg",
                        // A column's layout is its own: when a card moves in or
                        // out, the browser re-lays out this column and not the
                        // whole page, which is most of the cost of a crossing.
                        "[contain:layout]",
                        "bg-card border border-border/60",
                        "transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
                        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            {Icon && <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />}
                            {swatchClass && <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", swatchClass)} />}
                            {name}
                        </h2>
                        {/* No drag handle: column order was never saved, so a
                            moved column went back on reload. The count says more. */}
                        <div className={styles.Actions}>
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
            </Component>
        )
    },
)

Container.displayName = "Container"
