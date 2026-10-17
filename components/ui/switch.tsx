"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"

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
      // label colour on it, so it never disappears. Its hover halo, focus ring
      // and disabled look are the interaction layer's (a toggle).
      "group/switch peer relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border-2 border-transparent transition-colors after:absolute after:-inset-y-1.5 after:-inset-x-0.5 data-[state=checked]:bg-primary data-[state=unchecked]:bg-faint-foreground",
      className
    )}
    // A finger's target is 44px (app/phone.css F3); the ::after is a mouse's.
    data-touch-target=""
    {...ix("toggle")}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Design v3: a 28x16 switch with a 12px knob that lands with a slight
        // overshoot (transition-spring, 220ms) and gives a little while
        // pressed (.9), which stands still under prefers-reduced-motion.
        "pointer-events-none block size-3 rounded-full bg-white shadow-e1 ring-0 transition-spring motion-safe:group-active/switch:scale-90 data-[state=checked]:translate-x-3 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
