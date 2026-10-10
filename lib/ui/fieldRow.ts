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

export const fieldLabel = "whitespace-nowrap text-xs text-muted-foreground"

/*
 * The value side of a row, in one language: plain text at the label column's
 * edge that tints on hover and opens to edit. A box shows only while it is
 * being typed in, and a trailing chevron or calendar only on hover, focus or
 * while open (always on touch screens, which have no hover). An estimate and a
 * budget were bordered inputs and a select field a bordered box, beside dates
 * and people that read as text; now every value reads the same.
 */

/** A value that opens a picker or popover: a ghost button (dates, people, repeat). */
export const inlineValue = "group/value -ml-2 h-8 max-w-full justify-start gap-1.5 px-2 text-sm font-normal hover:bg-highlight"

/** A trailing affordance inside an inlineValue: a chevron or a calendar. */
export const inlineAffordance =
  "shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/value:opacity-100 group-focus-visible/value:opacity-100 group-data-[state=open]/value:opacity-100 [@media(hover:none)]:opacity-100"

/** A box typed into (an estimate, a number, a link): plain text until it has focus. */
export const inlineInput =
  "-ml-2 h-8 rounded-md border-transparent bg-transparent px-2 text-sm shadow-none placeholder:text-muted-foreground hover:border-transparent hover:bg-highlight focus-visible:border-ring focus-visible:bg-background md:h-8"

/** A Select used as a value (a cycle, a field's option): its trigger, without the box. */
export const inlineSelect =
  "-ml-2 h-8 w-fit min-w-0 max-w-full gap-1.5 border-transparent bg-transparent px-2 font-normal shadow-none hover:border-transparent hover:bg-highlight data-[state=open]:border-transparent data-[state=open]:bg-highlight [&>svg]:opacity-0 [&>svg]:transition-opacity hover:[&>svg]:opacity-100 focus-visible:[&>svg]:opacity-100 data-[state=open]:[&>svg]:opacity-100 [@media(hover:none)]:[&>svg]:opacity-100"

/** A section under the fields (Attachments, Linked, Dependencies, Subtasks): its name. */
export const sectionTitle = "text-sm font-medium text-foreground"

/**
 * "Add a subtask", "Link a doc or board", "Attach a file": a quiet button at
 * the section's edge. They were dashed outlines, a dashed tile and a plus in
 * three sizes; one shape says "you can add here" once.
 */
export const inlineAdd = "-ml-2 h-8 gap-1.5 px-2 text-sm font-normal text-muted-foreground hover:text-foreground"
