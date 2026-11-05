"use client"

// A board's or a doc's sensitivity label on its header (miro-44 L): the chip.
// It only presents: the label comes from the page's hook (./labelData). The
// note a share or an export dialog shows is ./labelHeldNote, a module of its
// own: the doc's lazy chip and those dialogs share no module of the label's
// drawing, so neither re-cuts the chunks of pages that share theirs (exp-b, 4
// Nov: one shared module moved the guest table page 7.4 KB).

import { campHueOf } from "@/lib/campHue"
import { ShieldCheck } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { HueDot } from "@/components/ui/chip"
import { ruleLine } from "@/lib/labels/labelRules"
import type { SensitivityLabel } from "@/lib/labels/labelTypes"

/**
 * A label as a chip (design v3 §3.10): neutral, the shield, a 6px dot in the
 * label's colour, its name. With `onOpen` it is a button that opens the picker
 * (someone who may change the label); without, a plain mark.
 */
export function SensitivityChip({ label, onOpen, className }: { label: SensitivityLabel; onOpen?: () => void; className?: string }) {
  const hue = campHueOf(label.colour)
  const rules = ruleLine(label.rules)
  const inner = (
    <>
      <ShieldCheck aria-hidden="true" className="size-3 shrink-0 text-ink-3" />
      {hue ? <HueDot hue={hue} /> : null}
      <span className="truncate">{label.name}</span>
    </>
  )
  const shape = cn("chip min-w-0 max-w-[10rem] gap-1", className)
  if (!onOpen) {
    return (
      <span data-item-label={label.name} title={`Labelled ${label.name}: ${rules}`} className={shape}>
        {inner}
      </span>
    )
  }
  return (
    <button
      type="button"
      data-item-label={label.name}
      data-touch-target=""
      title={`Labelled ${label.name}: ${rules}`}
      aria-label={`Label: ${label.name}. Change the label`}
      onClick={onOpen}
      className={cn(shape, "outline-none transition-colors hover:bg-press focus-visible:ring-2 focus-visible:ring-brand")}
    >
      {inner}
    </button>
  )
}
