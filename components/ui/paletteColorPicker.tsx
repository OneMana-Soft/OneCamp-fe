"use client"

// A colour for a status or a field option (design v3, work.md W48): the camp
// hues, each a named swatch. Writes the name the server stores
// (lib/taskStatus STORED_NAME), so what was saved before still reads.
// `hues` narrows the choice (a status offers only its category's hues).

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { STORED_NAME, colorDot, statusHueOf, type StatusHue } from "@/lib/taskStatus"
import { Check } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

const HUE_NAME: Record<StatusHue, string> = {
  neutral: "Grey",
  sun: "Sun",
  moss: "Moss",
  lake: "Lake",
  sky: "Sky",
  dusk: "Dusk",
  berry: "Berry",
}

const ALL: StatusHue[] = ["neutral", "sky", "lake", "moss", "sun", "berry", "dusk"]

/** `label` names what it colours ("Blog"), so a list of them reads apart. */
export function ColorPicker({ value, onChange, disabled, hues = ALL, label }: { value: string; onChange: (c: string) => void; disabled?: boolean; hues?: StatusHue[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const current = statusHueOf(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label ? `Colour of ${label}: ${HUE_NAME[current]}` : `Colour: ${HUE_NAME[current]}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <span className={cn("size-3 rounded-full", colorDot(value))} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1.5" align="start">
        <div className="flex gap-1" role="listbox" aria-label="Colour">
          {hues.map((h) => {
            const stored = STORED_NAME[h]
            const on = h === current
            return (
              <button
                key={h}
                type="button"
                role="option"
                aria-selected={on}
                aria-label={HUE_NAME[h]}
                title={HUE_NAME[h]}
                onClick={() => {
                  setOpen(false)
                  onChange(stored)
                }}
                className={cn("flex size-7 items-center justify-center rounded-md hover:bg-hover", on && "bg-press")}
              >
                <span className={cn("flex size-4 items-center justify-center rounded-full text-white", colorDot(stored))}>
                  {on && <Check className="size-2.5" aria-hidden="true" />}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
