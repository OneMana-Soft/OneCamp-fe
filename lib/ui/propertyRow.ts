import { cn } from "@/lib/utils/helpers/cn"

/**
 * The task panel's property grid (design v3, work.md W29): a 104 px label
 * column in 13 px ink-3 and a value column, 32 px rows with a 2 px gap. Each
 * value is a ghost "field button" that sits on the label column's edge
 * (margin-left -8 px) and takes the hover ground, so every property reads as
 * text until it is pointed at. It replaced lib/ui/fieldRow inside the panel,
 * whose 40 px rows and 12 px labels made the panel long.
 *
 * A row that holds nothing yet is marked data-field-empty, so "More fields"
 * can fold it away; a row with a value always shows.
 */
export function propertyRow(align: "center" | "start" = "center", className?: string) {
  return cn(
    "grid min-h-8 grid-cols-1 gap-1 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-x-2",
    align === "start" ? "sm:items-start" : "sm:items-center",
    className ?? "mb-0.5",
  )
}

export const propertyLabel = "whitespace-nowrap text-ui-sm text-ink-3"

/** A value that opens a picker: the ghost field button. */
export const propertyValue =
  "group/value -ml-2 inline-flex h-8 max-w-full items-center justify-start gap-2 rounded-md px-2 text-sm font-[450] text-foreground transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:hover:bg-transparent"

/** A section's name under the properties (Subtasks, Dependencies, Activity): 12/510 ink-3. */
export const panelSection = "text-meta font-[510] text-ink-3"
