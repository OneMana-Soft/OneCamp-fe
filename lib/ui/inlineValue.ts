/** A value that opens a picker or popover: a ghost button (dates, people, repeat). */
export const inlineValue = "group/value -ml-2 h-8 max-w-full justify-start gap-1.5 px-2 text-sm font-normal hover:bg-highlight"

/** A trailing affordance inside an inlineValue: a chevron or a calendar. */
export const inlineAffordance =
  "shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/value:opacity-100 group-focus-visible/value:opacity-100 group-data-[state=open]/value:opacity-100"
