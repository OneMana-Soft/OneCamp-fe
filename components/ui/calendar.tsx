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
// The day cell's states (components/ui/dayCell.tsx), as react-day-picker classNames.
import { DAY_CELL_BASE, DAY_CELL_SELECTED, DAY_CELL_TODAY } from "@/components/ui/dayCell"

type CalendarProps = React.ComponentProps<typeof DayPicker>

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

export { Calendar }
