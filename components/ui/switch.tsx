"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils/helpers/cn"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Off is text-3, not line-strong: the old track was 1.4:1 against the
      // page, so "off" read as "missing". 3:1 is the floor for a control
      // (WCAG 1.4.11). The ::after brings the press target to 24px tall.
      //
      // On is the accent (the chosen theme), as a checked box is. Wave 1 made
      // it ink, so a settings page would not read as an orange column; but it
      // also left a colour theme nothing to colour, and "on" is state, which
      // is what the accent marks. The accent is 4.5:1 or more on the page in
      // every theme (paletteContrast), and the thumb takes the accent's own
      // label colour on it, so it never disappears.
      "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors after:absolute after:-inset-y-1 after:-inset-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-faint-foreground",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // The thumb lands with a slight overshoot (transition-spring, 220ms),
        // which stands still under prefers-reduced-motion.
        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-spring data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
