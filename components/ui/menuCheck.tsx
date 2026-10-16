import { Check, Minus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A menu row's check (INTERACTION_SPEC §4): a 16px slot, a check when on, a
 * dash for some, empty when off, so every row's words start in one place.
 */
export type MenuChecked = boolean | "indeterminate"

export function MenuCheck({ checked, className }: { checked: MenuChecked; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-menu-check={checked === "indeterminate" ? "some" : checked ? "on" : "off"}
      className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
    >
      {checked === "indeterminate" ? <Minus className="size-4" /> : checked ? <Check className="size-4" /> : null}
    </span>
  )
}

/** A row's aria-checked and data-state, as Radix writes them. */
export function menuCheckState(checked: MenuChecked) {
  return {
    "aria-checked": checked === "indeterminate" ? ("mixed" as const) : checked,
    "data-state": checked === "indeterminate" ? "indeterminate" : checked ? "checked" : "unchecked",
  }
}
