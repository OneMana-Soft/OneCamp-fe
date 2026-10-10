"use client"

// A colour from the palette statuses and field options share (lib/taskStatus
// STATUS_COLORS): a dot that opens a grid of the others.

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { STATUS_COLORS, colorDot } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"

export function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Colour: ${value}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <span className={cn("h-3 w-3 rounded-full", colorDot(value))} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-6 gap-1" role="listbox" aria-label="Colour">
          {STATUS_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={c === value}
              aria-label={c}
              onClick={() => {
                setOpen(false)
                onChange(c)
              }}
              className={cn("flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent", c === value && "ring-2 ring-ring/40")}
            >
              <span className={cn("h-3.5 w-3.5 rounded-full", colorDot(c))} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
