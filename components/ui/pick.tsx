"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface PickOption {
  value: string
  label: ReactNode
  /** Offered but not pickable (another question fills it). */
  disabled?: boolean
}

/**
 * A select on a builder's row (the rules', the forms'), its own label for a
 * screen reader: 44px on a phone, 32px from md up. With no value it shows
 * placeholder, which says what to pick.
 */
export function Pick({
  label, value, onChange, options, placeholder, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: PickOption[]
  placeholder?: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger dense aria-label={label} className={cn("h-11 min-w-0 text-sm md:h-8 md:text-xs", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled} className="text-sm md:text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
