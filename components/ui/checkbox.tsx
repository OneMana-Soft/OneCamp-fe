"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "@/lib/icons";

import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    // Design v3 (§3.10): a 16px box, r5, drawn by an inset 1.5px ring (no
    // border, so it sits crisp on any surface). The ring is ink-3, not the
    // spec's line-3: a control's boundary keeps the 3:1 floor (WCAG 1.4.11),
    // which v3 leaves standing. Checked fills the accent, as a switch and a
    // radio do (D13; moss read as success). The press target is 24px: the
    // ::after reaches 4px past each edge.
    //
    // THE SPRING: pressed, the box settles to 88% in 90ms; released, it comes
    // back on the spring curve, overshooting a touch (transition-spring).
    // A transition, not an animation, so a box that is already checked when
    // the page loads stands still.
    className={cn(
      "peer relative size-4 shrink-0 rounded-[5px] ring-[1.5px] ring-inset ring-faint-foreground transition-spring after:absolute after:-inset-1 hover:ring-muted-foreground motion-safe:active:scale-[0.88] active:duration-[90ms] aria-invalid:ring-destructive data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:ring-1 data-[state=checked]:ring-black/10 data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:ring-1 data-[state=indeterminate]:ring-black/10",
      className
    )}
    // A finger's target is 44px (app/phone.css F3); the ::after is a mouse's.
    data-touch-target=""
    {...ix("toggle")}
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
