import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"

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
}

export function DateTimePicker({ value, onChange, disabled }: DateTimePickerProps) {
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
          className={cn(
            "w-full justify-start text-left font-normal h-9 px-3 text-xs",
            !value && "text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP - p") : <span>Pick a date & time</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[100]" align="start">
        <div className="p-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Input
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
