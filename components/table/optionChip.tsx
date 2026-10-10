import { campHueOf } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * An option's chip colour, wherever a table shows one: the members' grid and
 * board, and a guest's read-only view. Options are categories, not statuses,
 * so a picked colour becomes its camp hue (tint behind ink) rather than
 * danger, success or warning: a red "Blocked" chip read as an error. No
 * colour, or one that names no hue, stays neutral.
 *
 * One function, so a member and a guest see the same colour: the guest view
 * mapped colours here while the members' grid drew every option as plain text
 * and every multi-select option grey.
 */
export function optionColorClass(color?: string | null): string {
  const hue = campHueOf(color)
  return hue ? `${HUE_CLASS[hue]} bg-hue-tint text-hue-ink` : "bg-muted text-muted-foreground"
}

export function OptionChip({ label, color, className }: { label: string; color?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center truncate rounded-sm px-1.5 py-0.5 text-2xs font-medium", optionColorClass(color), className)} data-option-chip="">
      {label}
    </span>
  )
}
