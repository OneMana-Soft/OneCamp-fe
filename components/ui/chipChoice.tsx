"use client"

import type { ReactNode } from "react"

import { CHIP_TONE } from "@/lib/ui/chipTone"
import { ix } from "@/lib/ui/interactive"
import { radioKeyTo } from "@/lib/ui/radioKeys"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * One of a few as a row of the shared chip, no radio's circle. A radiogroup,
 * one tab stop (the pick, else the first); an arrow moves the focus and the
 * pick at once, round at both ends; Enter, Space pick; cmdk skips its keys.
 */
export function ChipChoice<T extends string>({
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  label: string
  value: T
  onValueChange: (value: T) => void
  options: readonly { value: T; label: ReactNode }[]
  className?: string
}) {
  const picked = options.findIndex((o) => o.value === value)
  const pick = (i: number) => i !== picked && onValueChange(options[i].value)
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2 md:gap-1.5", className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={i === picked}
          tabIndex={i === Math.max(0, picked) ? 0 : -1}
          data-chip=""
          data-touch-target=""
          {...ix("chip")}
          className={cn("chip h-10 px-3 text-ui-sm md:h-[26px] md:px-2 md:text-xs", i === picked && CHIP_TONE.brand)}
          onClick={() => pick(i)}
          onKeyDown={(e) => {
            const to = radioKeyTo(e.nativeEvent, i, options.length) ?? (e.key === "Enter" || e.key === " " ? i : null)
            if (to === null) return
            e.preventDefault()
            e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=radio]")[to]?.focus()
            pick(to)
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
