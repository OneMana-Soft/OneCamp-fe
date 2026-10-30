import { buttonVariants } from "@/components/ui/button"
import { DAY_CELL_BASE } from "@/components/ui/dayCell"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The month in a sheet: the sheet's width, a finger's 44px a day and 44px
 * arrows. It was the computer's 280px month centred in a 390px slab, its days
 * 32px, which read as a card floating in the sheet (ANALYSIS.md §1.5). A date
 * field's panel and a date chip's day (DatePopover) take it in a sheet.
 *
 * Its name and its weekdays stay at the top of the sheet's scroller while the
 * weeks scroll under them, and a week brought into view (DatePanel brings the
 * chosen one) clears them: held sideways, the panel opened on the month's
 * first row, the only days in view past ones (DESIGN-BUILD-3).
 */
export const SHEET_MONTH = {
  months: "flex flex-col",
  month: "w-full space-y-2",
  caption: "sticky top-0 z-[1] flex h-11 items-center justify-center bg-pop",
  nav_button: cn(buttonVariants({ variant: "ghost" }), "size-11 p-0 text-ink-3 hover:text-ink"),
  nav_button_previous: "absolute left-0",
  nav_button_next: "absolute right-0",
  table: "w-full border-collapse",
  head: "sticky top-11 z-[1] bg-pop",
  head_row: "flex w-full",
  head_cell: "flex-1 text-micro font-medium text-ink-3",
  row: "mt-0.5 flex w-full scroll-mt-16",
  cell: "relative flex h-11 flex-1 items-center justify-center p-0 text-center focus-within:relative",
  day: cn(DAY_CELL_BASE, "size-11 text-ui"),
}
