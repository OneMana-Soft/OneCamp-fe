import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { inputSizing } from "@/components/ui/inputSizing"

// The look and the states, without a height (inputSizing gives that):
// design v3's field (field-surface in globals.css): the raised surface at e1
// with no border, ink-3 placeholder, a 1px accent ring and a 3px halo on
// focus, the same in danger for aria-invalid="true" so an error reads on the
// field as well as in the message under it. 14px text from md (16px on a
// phone, so iOS does not zoom), 10px in. Wire the message with
// aria-describedby, or wrap the field in <Field> (field.tsx), which does it.
const BASE =
  "field-surface flex w-full rounded-md px-2.5 py-1 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground md:text-sm"

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

export { Input, inputSizing }
