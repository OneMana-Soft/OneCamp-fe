import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

// The look and the states, without a height (inputSizing gives that):
// design v3's field (field-surface in globals.css): the raised surface at e1
// with no border, ink-3 placeholder, a 1px accent ring and a 3px halo on
// focus, the same in danger for aria-invalid="true" so an error reads on the
// field as well as in the message under it. 14px text from md (16px on a
// phone, so iOS does not zoom), 10px in. Wire the message with
// aria-describedby, or wrap the field in <Field> (field.tsx), which does it.
const BASE =
  "field-surface flex w-full rounded-md px-2.5 py-1 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground md:text-sm"

// A height the caller wrote with no breakpoint: h-8, h-10, h-[30px], !h-8.
const OWN_HEIGHT = /(?:^|\s)!?h-[^\s:]+(?=\s|$)/

/**
 * The field's height, given the caller's classes.
 *
 * - With no height of its own, a field is 44px on a phone and 32px from md
 *   up (h-11 md:h-8, the same mobile-first split as text-base md:text-sm):
 *   32px is design v3's field, the height of the md button beside it, and
 *   44px is the touch guidance every mobile platform converges on. Verified
 *   in Chromium at 390px by e2e/designSystem.spec.ts.
 * - A height the caller writes (h-8) is the field's height from md up, as
 *   written. It used to lose there: tailwind-merge drops the default h-11 for
 *   the caller's h-8 but keeps md:h-9, which is another breakpoint, so 87
 *   fields that asked for 28, 32 or 40px drew 36px on every computer, beside
 *   32px buttons. Below md a standalone field keeps its 44px touch target
 *   (max-md:h-11, written out here so Tailwind generates it).
 * - `dense`: a field inside a dense grid or a compound control (a table
 *   cell, an inline editor, a picker's own input) takes the caller's height
 *   at every width, or 32px when it gives none.
 */
export function inputSizing(className: string | undefined, dense: boolean | undefined) {
  const own = OWN_HEIGHT.test(className ?? "")
  if (dense) return own ? "" : "h-8"
  return own ? "max-md:h-11" : "h-11 md:h-8"
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
