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
    // Design v3 (§3.10): a 16px box, r5, drawn by an inset 1.5px ring (no
    // border, so it sits crisp on any surface). The ring is ink-3, not the
    // spec's line-3: a control's boundary keeps the 3:1 floor (WCAG 1.4.11),
    // which v3 leaves standing. Checked fills moss with a white check (near
    // black in dark, on the lifted moss). The press target is 24px: the
    // ::after reaches 4px past each edge.
    //
    // THE SPRING: pressed, the box settles to 88% in 90ms; released, it comes
    // back on the spring curve, overshooting a touch (transition-spring).
    // A transition, not an animation, so a box that is already checked when
    // the page loads stands still.
    className={cn(
      "peer relative size-4 shrink-0 rounded-[5px] ring-[1.5px] ring-inset ring-faint-foreground transition-spring after:absolute after:-inset-1 hover:ring-muted-foreground active:scale-[0.88] active:duration-[90ms] aria-invalid:ring-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-camp-moss data-[state=checked]:text-white data-[state=checked]:ring-1 data-[state=checked]:ring-black/10 data-[state=indeterminate]:bg-camp-moss data-[state=indeterminate]:text-white data-[state=indeterminate]:ring-1 data-[state=indeterminate]:ring-black/10 dark:data-[state=checked]:text-frame dark:data-[state=indeterminate]:text-frame",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      {/* Some, not all (a header box over a part-picked list): a dash, not a tick. */}
      {props.checked === "indeterminate" ? <Minus className="size-3" /> : <Check className="size-3" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
