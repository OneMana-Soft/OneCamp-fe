import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

// The look and the states, without a height (inputSizing gives that): hover
// steps the border to text-3 (neutral; the accent is kept for focus), focus is
// the accent border and a soft ring, and aria-invalid="true" turns both to
// destructive so an error reads on the field as well as in the message under
// it. Wire the message with aria-describedby, or wrap the field in <Field>
// (field.tsx), which does it for you.
const BASE =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-faint-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 disabled:hover:border-input md:text-sm"

// A height the caller wrote with no breakpoint: h-8, h-10, h-[30px], !h-8.
const OWN_HEIGHT = /(?:^|\s)!?h-[^\s:]+(?=\s|$)/

/**
 * The field's height, given the caller's classes.
 *
 * - With no height of its own, a field is 44px on a phone and 36px from md
 *   up (h-11 md:h-9, the same mobile-first split as text-base md:text-sm): a
 *   36px field is under the 44px touch guidance every mobile platform
 *   converges on, while 36px is right for a dense desktop form. Verified in
 *   Chromium at 390px by e2e/designSystem.spec.ts.
 * - A height the caller writes (h-8) is the field's height from md up, as
 *   written. It used to lose there: tailwind-merge drops the default h-11 for
 *   the caller's h-8 but keeps md:h-9, which is another breakpoint, so 87
 *   fields that asked for 28, 32 or 40px drew 36px on every computer, beside
 *   32px buttons. Below md a standalone field keeps its 44px touch target
 *   (max-md:h-11, written out here so Tailwind generates it).
 * - `dense`: a field inside a dense grid or a compound control (a table
 *   cell, an inline editor, a picker's own input) takes the caller's height
 *   at every width, or 36px when it gives none.
 */
export function inputSizing(className: string | undefined, dense: boolean | undefined) {
  const own = OWN_HEIGHT.test(className ?? "")
  if (dense) return own ? "" : "h-9"
  return own ? "max-md:h-11" : "h-11 md:h-9"
}

export interface InputProps extends React.ComponentProps<"input"> {
  /** Inside a dense grid or a compound control: the height holds at every width, with no 44px floor on a phone. */
  dense?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, dense, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(BASE, inputSizing(className, dense), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
