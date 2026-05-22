import React, { forwardRef } from "react"

import { Handle, Remove } from "../Item"

import styles from "./Container.module.css"
import { cn } from "@/lib/utils/helpers/cn"
import { taskStatuses } from "@/types/table"

export interface Props {
    children: React.ReactNode
    columns?: number
    label?: string
    style?: React.CSSProperties
    horizontal?: boolean
    hover?: boolean
    handleProps?: React.HTMLAttributes<any>
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
            handleProps,
            horizontal,
            hover,
            onClick,
            onRemove,
            label,
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
                            {status?.icon && (
                                <status.icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
                            )}
                            {status?.label || label}
                        </h2>
                        <div className={styles.Actions}>
                            {onRemove ? <Remove onClick={onRemove} /> : undefined}
                            <Handle {...handleProps} />
                        </div>
                    </div>
                ) : null}
                {placeholder ? children : <div className={styles.Content}>{children}</div>}
            </Component>
        )
    },
)

Container.displayName = "Container"
