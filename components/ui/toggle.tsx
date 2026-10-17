"use client"

import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"

const toggleVariants = cva(
  // On is the interaction layer's (aria-pressed): a tint, a 1.5px ring and the
  // icon in the accent, so it never looks like a hover, as the grey "on" did.
  // No weight change when on: a label that turns semibold nudges its neighbours.
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground disabled:pointer-events-none data-[state=on]:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent",
        // A view switch as a plain underline row (List / Board / Timeline),
        // matching underlineTab in tabs.tsx. Its shape is applied after the
        // size classes (see underlineToggle below), so it is empty here.
        underline: "",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size }), variant === "underline" && underlineToggle, className)}
    // A finger's target is 44px (app/phone.css F3).
    data-touch-target=""
    {...ix(variant === "underline" ? "tab" : "button")}
    {...props}
  />
))

Toggle.displayName = TogglePrimitive.Root.displayName

/**
 * The underline item's shape (a tab, to the interaction layer). Applied after
 * toggleVariants so it wins over the size's height and padding: ink and a 2px
 * rule when on, muted otherwise. The row's hairline comes from ToggleGroup.
 */
const underlineToggle =
  "-mb-px h-auto min-w-0 rounded-b-none rounded-t-md border-b-2 border-transparent bg-transparent px-0.5 pb-2.5 pt-1 data-[state=on]:border-foreground"

export { Toggle, toggleVariants, underlineToggle }
