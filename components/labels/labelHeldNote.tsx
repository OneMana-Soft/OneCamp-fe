"use client"

// What a share or an export dialog says while a board's or a doc's sensitivity
// label holds that dialog's rule back (miro-44 L). It only presents: the label
// comes from ./labelData's useItemLabel. Apart from the chip (./labelMarks), so
// the dialogs and the lazy chip share no module of the label's drawing.

import { ShieldCheck } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { labelHas, ruleName } from "@/lib/labels/labelRules"
import type { SensitivityLabel } from "@/lib/labels/labelTypes"

/**
 * What a share or an export dialog says while the item's label holds its rule
 * back: the label, the rule by its name, and who can change it. The server
 * refuses the same action with its own words if it is tried another way.
 */
export function LabelHeldNote({ label, rule, className }: { label: SensitivityLabel; rule: string; className?: string }) {
  if (!labelHas(label, rule)) return null
  return (
    <p data-label-held={rule} className={cn("flex items-start gap-2 rounded-lg bg-sunken px-3 py-2 text-ui-sm text-ink-2", className)}>
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
      <span>
        <span className="font-medium text-ink">
          Labelled {label.name} · {ruleName(rule)}
        </span>
        <span className="block text-meta text-ink-3">Its owner or a workspace admin can change the label.</span>
      </span>
    </p>
  )
}
