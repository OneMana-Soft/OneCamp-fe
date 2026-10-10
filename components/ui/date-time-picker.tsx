import * as React from "react"
import { Calendar as CalendarIcon, Clock } from "@/lib/icons";
import { shortDateTime } from "@/lib/utils/date/shortDate"

import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DateTimePickerProps {
  value?: Date
  onChange?: (date: Date) => void
  disabled?: boolean
  /** The trigger's id, so a label's htmlFor (a FormControl's) names it. */
  id?: string
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

/**
 * A date and a time in one control. The trigger writes the moment the way the
 * whole app does ("10 Oct, 8:00 PM", lib/utils/date/shortDate): it said
 * "October 10th, 2026 - 8:00 PM" here and "Oct 10, 2026 · 8:00 PM" in the new
 * event dialog beside it, two formats for one job and neither the app's.
 */
export function DateTimePicker({ value, onChange, disabled, id, ...aria }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const timeString = value
    ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
    : "00:00"

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const newDate = value ? new Date(value) : new Date()
      newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
      onChange?.(newDate)
    }
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    const newTimeString = e.target.value
    if (!newTimeString) return
    const [hours, minutes] = newTimeString.split(':').map(Number)
    const newDate = value ? new Date(value) : new Date()
    newDate.setHours(hours, minutes, 0, 0)
    onChange?.(newDate)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={"outline"}
          id={id}
          {...aria}
          className={cn(
            "h-9 w-full justify-start gap-2 px-3 text-left text-sm font-normal tabular-nums",
            !value && "text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{value ? shortDateTime(value) : "Pick a date and time"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[var(--z-popover)]" align="start">
        <div className="p-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Input dense
              type="time"
              value={timeString}
              onChange={handleTimeChange}
              className="text-center w-full focus-visible:ring-primary/30 h-8 text-sm"
            />
          </div>
        </div>
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDateSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
