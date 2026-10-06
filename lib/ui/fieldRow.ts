import { cn } from "@/lib/utils/helpers/cn"

/**
 * One row of a details panel (the task panel's Assignee, Dates, Repeat, Time…):
 * a label column wide enough that "Start date" stays on one line, and a value
 * that may shrink. Each row used to carry its own copy of a six-column grid,
 * whose one-sixth label column broke labels in two once the panel was narrow.
 */
export function fieldRow(align: "center" | "start" = "center", className?: string) {
  return cn(
    "grid grid-cols-1 gap-1 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-3",
    align === "start" ? "sm:items-start" : "sm:items-center",
    className ?? "mb-2",
  )
}

export const fieldLabel = "whitespace-nowrap text-xs text-muted-foreground sm:text-foreground"
