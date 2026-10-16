import { SpotError } from "@/components/ui/graphics/spots"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The shell's two spots (design v3, shell §L3 and §L4, mock M6), drawn from
 * the playful layer's motif with the camp tokens, so they theme in both modes.
 * Decorative: the words beside them say what happened.
 */

/**
 * The crash spot: the app's one error mark, SpotError (a page with a "!" in
 * the dotted orbit), at the shell's sizes. Both critics redrew a failure
 * mark on 11 Oct because the old one read as a loading spinner: the shell's
 * as the logo ring broken in two, admin's SpotError as the page. Side by
 * side at 24 and 64 px, in light and dark, the broken ring still read as a
 * refresh arrow and the page read as an error, so every failure draws the
 * page (critic integration, 12 Oct).
 */
export function SpotCrash({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <span data-spot-crash="" className="contents">
      <SpotError size={size} className={cn("spot-in", className)} />
    </span>
  )
}

/** The panel's spot: the crash spot at 56px. */
export function SpotPanelCrash({ className }: { className?: string }) {
  return <SpotCrash size={56} className={className} />
}
