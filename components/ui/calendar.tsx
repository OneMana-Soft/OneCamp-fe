"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils/helpers/cn"
import { buttonVariants } from "@/components/ui/button"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type CalendarProps = React.ComponentProps<typeof DayPicker>

/*
 * THE DAY CELL (content.md C03), shared by the mini month, the date picker,
 * the booking month and the table calendar. 13/450 tabular in ink; hover is
 * --hover at r8; today is a 1.5 px brand RING with the number in brand-text
 * (never a fill: the accent marks today, not a choice); selected is an ink
 * fill with sheet text, because selecting isn't an action; outside the month
 * is ink-3, a day you can still pick (D-SD4: ink-4 never carries text
 * someone reads); disabled is ink-4. react-day-picker takes these as
 * classNames, and DayCell below is the same cell for grids drawn by hand.
 */
const DAY_CELL_BASE =
  "relative inline-flex size-8 items-center justify-center rounded-lg p-0 text-ui-sm font-[450] tabular-nums text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop aria-selected:opacity-100"
const DAY_CELL_TODAY =
  "font-semibold text-brand-text before:pointer-events-none before:absolute before:left-1/2 before:top-1/2 before:size-[26px] before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:ring-[1.5px] before:ring-brand before:content-['']"
const DAY_CELL_SELECTED = "bg-ink! text-sheet! hover:bg-ink! before:ring-0!"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-3",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-ui-sm font-semibold text-ink",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-6 p-0 text-ink-3 hover:text-ink"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex gap-0.5",
        head_cell: "w-8 text-micro font-medium text-ink-3",
        row: "flex w-full gap-0.5 mt-0.5",
        cell: cn(
          "relative size-8 p-0 text-center focus-within:relative",
          props.mode === "range"
            ? "[&:has([aria-selected].day-range-middle)]:bg-press first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg [&:has(>.day-range-end)]:rounded-r-lg [&:has(>.day-range-start)]:rounded-l-lg"
            : ""
        ),
        day: DAY_CELL_BASE,
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected: DAY_CELL_SELECTED,
        day_today: DAY_CELL_TODAY,
        day_outside: "day-outside text-ink-3 aria-selected:text-sheet",
        day_disabled: "text-ink-4 pointer-events-none",
        day_range_middle: "aria-selected:bg-transparent aria-selected:text-ink",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
        Dropdown: ({ value, onChange, children, ...props }: any) => {
          const options = React.Children.toArray(children) as React.ReactElement<React.HTMLProps<HTMLOptionElement>>[]
          const selected = options.find((child) => child.props.value === value)
          const handleChange = (value: string) => {
            const changeEvent = {
              target: { value },
            } as React.ChangeEvent<HTMLSelectElement>
            onChange?.(changeEvent)
          }
          return (
            <Select
              value={value?.toString()}
              onValueChange={(value) => {
                handleChange(value)
              }}
            >
              <SelectTrigger dense className="pr-1.5 focus:ring-0 h-[28px] border-none bg-transparent font-medium shadow-none hover:bg-accent/50">
                <SelectValue>{selected?.props?.children}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-[200px]">
                  {options.map((option, id) => (
                    <SelectItem key={`${option.props.value}-${id}`} value={option.props.value?.toString() ?? ""}>
                      {option.props.children}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export interface DayCellProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  date: Date
  today?: boolean
  selected?: boolean
  outside?: boolean
  /** Has events: a 4 px dot under the number (ink-3, or a hue's strong cut). */
  dot?: boolean | string
  /** 32 (mini month, picker) or 40 (the phone's week strip). */
  size?: 32 | 40
}

/** One day for a hand-drawn grid, with the same states as the picker's. */
const DayCell = React.forwardRef<HTMLButtonElement, DayCellProps>(function DayCell(
  { date, today, selected, outside, dot, size = 32, className, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-current={today ? "date" : undefined}
      aria-pressed={selected || undefined}
      data-today={today || undefined}
      disabled={disabled}
      className={cn(
        DAY_CELL_BASE,
        size === 40 && "size-10",
        outside && "text-ink-3",
        disabled && "pointer-events-none text-ink-4",
        today && DAY_CELL_TODAY,
        selected && DAY_CELL_SELECTED,
        className
      )}
      {...rest}
    >
      {date.getDate()}
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full", selected ? "bg-sheet" : typeof dot === "string" ? dot : "bg-ink-3")}
        />
      ) : null}
    </button>
  )
})

export { Calendar, DayCell, DAY_CELL_BASE, DAY_CELL_TODAY, DAY_CELL_SELECTED }
