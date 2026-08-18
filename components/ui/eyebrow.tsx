import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Eyebrow — the small uppercase label that titles a group.
 *
 * "Sources" above a list of citations, "Automation" above a category of
 * templates, the weekday letters across a calendar header, a field label in a
 * profile panel. One idea, and it was hand-written 53 times across 26 files at
 * FIVE sizes (text-xs, text-[10px], text-[11px], text-2xs, and one with none at
 * all) and FOUR weights (semibold 37, medium 11, bold 1, none 4).
 *
 * That is invisible in any single screenshot and unmistakable when you move
 * between screens: the same kind of label is heavier here than there, and a
 * little smaller on the next panel. It is most of what "doesn't feel designed"
 * means in practice, and it cannot be fixed by being careful — it needs one
 * place that decides.
 *
 * The weight is NOT a prop. It was the main thing that drifted, and offering it
 * as an option would just reproduce the drift with nicer syntax. If a surface
 * genuinely needs different emphasis, that is a design decision to make here for
 * everyone, not per call site.
 *
 * Size IS a prop, with two steps, because there are genuinely two densities in
 * the app: a normal section title and the tighter label used inside dense rows
 * and grid headers. Both resolve to named type tokens rather than arbitrary
 * pixel values, so an eyebrow can never drift off the scale.
 */
/**
 * The identity classes, exported for the cases the component cannot cover.
 *
 * Several of these labels are FormLabel, which carries its own form wiring
 * (htmlFor, error state) and so cannot be swapped for a span. Those consume the
 * class instead, which keeps one source of truth rather than leaving a second
 * population of hand-written eyebrows that drifts on its own.
 *
 * Prefer <Eyebrow> where the element is free.
 */
export const eyebrowClass =
  "uppercase tracking-wider font-semibold text-muted-foreground text-xs"

export function Eyebrow({
  children,
  /**
   * `default` is 12px, the majority shape. `sm` is 10px — the documented floor —
   * for dense rows and grid headers that previously reached for text-[10px].
   */
  size = "default",
  /** Rendered element. A section title is often a heading rather than a span. */
  as: Tag = "span",
  className,
  ...rest
}: {
  children: React.ReactNode
  size?: "default" | "sm"
  as?: "span" | "div" | "p" | "h2" | "h3" | "h4"
  className?: string
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "uppercase tracking-wider font-semibold text-muted-foreground",
        size === "sm" ? "text-3xs" : "text-xs",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export default Eyebrow
