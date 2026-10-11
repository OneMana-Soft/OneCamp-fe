"use client"

// One segmented choice for the whole app: a few options side by side, one of
// them chosen (the digest frequency, the theme, a token's lifetime, who may
// do something).
//
// Design v3 (§3.10, admin §1.4): a 28px track on --press, r8, 2px in; the
// chosen option is the raised surface at e-sel, and it SLIDES: one thumb
// element under the options, moved by transform over 220ms on the spring, so
// no layout property animates (motionCost.test.ts). Under reduced motion the
// global rule makes it jump. 36px on a phone, where it is a touch target.
// Radio semantics (Radix), so arrow keys move the choice and a screen reader
// says "1 of 3".

import * as React from "react"
import { useLayoutEffect, useRef } from "react"
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

export const segmentedWell = "relative inline-flex max-w-full flex-wrap gap-0.5 rounded-md bg-press p-0.5"

export const segmentedItem = cn(
  "relative z-[1] inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-xs text-muted-foreground transition-colors md:h-6",
  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50",
  "data-[state=checked]:font-medium data-[state=checked]:text-foreground",
  // Before the thumb is measured (first paint, a test), the choice draws its
  // own raised surface; the thumb takes over once it is in place.
  "group-data-[thumb=off]/seg:data-[state=checked]:bg-raised group-data-[thumb=off]/seg:data-[state=checked]:shadow-sel",
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
  const rootRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)
  const [thumbOn, setThumbOn] = React.useState(false)

  useLayoutEffect(() => {
    const root = rootRef.current
    const thumb = thumbRef.current
    if (!root || !thumb) return
    const place = () => {
      const item = root.querySelector<HTMLElement>("[data-state='checked']")
      if (!item || item.offsetWidth === 0) {
        thumb.style.opacity = "0"
        setThumbOn(false)
        return
      }
      // The first placement lands without travelling.
      thumb.style.transition = placed.current ? "" : "none"
      thumb.style.width = `${item.offsetWidth}px`
      thumb.style.height = `${item.offsetHeight}px`
      thumb.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`
      thumb.style.opacity = "1"
      placed.current = true
      setThumbOn(true)
    }
    place()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    ro?.observe(root)
    return () => ro?.disconnect()
  }, [value, options.length])

  return (
    <RadioGroupPrimitive.Root
      ref={rootRef}
      id={id}
      name={name}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      orientation="horizontal"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-segmented=""
      data-thumb={thumbOn ? "on" : "off"}
      className={cn("group/seg", segmentedWell, className)}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        data-segment-thumb=""
        className="pointer-events-none absolute left-0 top-0 rounded-sm bg-raised opacity-0 shadow-sel transition-transform duration-[220ms] ease-[var(--ease-spring)]"
      />
      {options.map(({ value: v, label, icon: Icon, disabled: off, title }) => (
        <RadioGroupPrimitive.Item key={v} value={v} disabled={off} title={title} className={cn(segmentedItem, itemClassName)}>
          {Icon && <Icon className="size-3.5" aria-hidden="true" />}
          {label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
