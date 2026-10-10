"use client"

import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"

const toggleVariants = cva(
  // On is surface-3 under ink: --accent is the canvas, so "on" was invisible
  // in any toolbar that sat on it. No weight change when on, because a label
  // that turns semibold gets wider and nudges its neighbours.
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-highlight hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-highlight data-[state=on]:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent hover:bg-highlight hover:text-accent-foreground",
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
    {...props}
  />
))

Toggle.displayName = TogglePrimitive.Root.displayName

/**
 * The underline item's shape. Applied after toggleVariants so it wins over the
 * size's height and padding: ink and a 2px rule when on, muted otherwise, no
 * fill and no box. The row's hairline comes from ToggleGroup.
 */
const underlineToggle =
  "-mb-px h-auto min-w-0 rounded-none border-b-2 border-transparent bg-transparent px-0.5 pb-2.5 pt-1 hover:bg-transparent hover:text-foreground data-[state=on]:border-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground"

export { Toggle, toggleVariants, underlineToggle }
