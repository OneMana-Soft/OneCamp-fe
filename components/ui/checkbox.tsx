"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "@/lib/icons";

import { cn } from "@/lib/utils/helpers/cn"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    // The box keeps its 16px look, but the press target is 24px: the ::after
    // reaches 4px past each edge, so a tap just outside the square still
    // lands. Its unchecked edge is text-3, not line-strong: a 1.4:1 outline
    // was a box you had to hunt for, and a control's boundary needs 3:1
    // (WCAG 1.4.11) against the page it sits on.
    className={cn(
      "peer relative h-4 w-4 shrink-0 rounded-sm border border-faint-foreground transition-colors after:absolute after:-inset-1 hover:border-muted-foreground aria-invalid:border-destructive data-[state=checked]:border-primary data-[state=indeterminate]:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      {/* Some, not all (a header box over a part-picked list): a dash, not a tick. */}
      {props.checked === "indeterminate" ? <Minus className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
