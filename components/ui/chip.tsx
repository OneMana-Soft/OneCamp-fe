import type { ReactNode } from "react"

import { X } from "@/lib/icons"
import { hueFor, type CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { CHIP_TONE, type ChipTone } from "@/lib/ui/chipTone"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

/**
 * A chip (design v3, §3.10): 22px, r6, 12/510, neutral, on the hover overlay
 * inside a hairline (the `chip` utility in globals.css).
 *
 * Colour is a noun: a chip carries identity only as a 6px dot (`dot`, a
 * camp hue), and a tint only when it means something (`tone`: "Due today"
 * in sun, "Overdue" in danger). `onRemove` adds the × of an active filter.
 */

export function Chip({
  children,
  dot,
  tone,
  onRemove,
  removeLabel = "Remove",
  className,
  title,
}: {
  children: ReactNode
  dot?: CampHue
  tone?: ChipTone
  onRemove?: () => void
  removeLabel?: string
  className?: string
  title?: string
}) {
  return (
    <span data-chip="" title={title} className={cn("chip min-w-0", tone && CHIP_TONE[tone], className)}>
      {dot ? <HueDot hue={dot} /> : null}
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          {...ix("icon")}
          data-touch-target=""
          className="-mr-1 inline-flex size-4 items-center justify-center rounded-xs text-faint-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  )
}

/** A thing's colour as a chip carries it (colour is a noun): its hue's 6px dot. */
export function HueDot({ hue }: { hue: CampHue }) {
  return <span aria-hidden="true" data-chip-dot="" className={cn(HUE_CLASS[hue], "size-1.5 shrink-0 rounded-full bg-hue")} />
}

/**
 * A label (a task's tag) as design v3 draws it: a neutral chip with a 6px dot
 * in the label's own hue (hueFor), so the same label is the same colour on
 * every screen while a row stays calm. It replaced the tinted pill.
 */
export function LabelChip({ label, className }: { label: string; className?: string }) {
  return (
    <Chip dot={hueFor(label)} className={cn("max-w-[10rem]", className)} title={label}>
      {label}
    </Chip>
  )
}
