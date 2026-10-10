"use client"

// One segmented choice for the whole app: a few options side by side, one of
// them chosen. About eight copies were drawn by hand (the digest frequency, the
// theme, a token's lifetime, the transcription mode, the import provider, the
// webhook direction…), at two heights, some marking the choice with
// bg-background alone, which reads 1.03:1 against the well and was retired from
// the tabs for that reason.
//
// The house look: a muted well, the chosen option raised on the card colour with
// a hairline. 36px tall from md up, the height of an input or a select beside it
// in a settings list, and 44px on a phone, where it is a touch target. Radio
// semantics (Radix), so arrow keys move the choice and a screen reader says
// "1 of 3".

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"

export interface SegmentOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: LucideIcon
  disabled?: boolean
  /** A tooltip, for an option whose label is short. */
  title?: string
}

export const segmentedWell = "inline-flex max-w-full flex-wrap gap-0.5 rounded-md bg-muted p-1"

export const segmentedItem = cn(
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors md:h-7",
  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50",
  "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:ring-1 data-[state=checked]:ring-border",
)

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  id,
  name,
  disabled,
  className,
  itemClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentOption<T>[]
  id?: string
  name?: string
  disabled?: boolean
  className?: string
  itemClassName?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
}) {
  return (
    <RadioGroupPrimitive.Root
      id={id}
      name={name}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      orientation="horizontal"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      className={cn(segmentedWell, className)}
    >
      {options.map(({ value: v, label, icon: Icon, disabled: off, title }) => (
        <RadioGroupPrimitive.Item key={v} value={v} disabled={off} title={title} className={cn(segmentedItem, itemClassName)}>
          {Icon && <Icon className="size-3.5" aria-hidden="true" />}
          {label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
