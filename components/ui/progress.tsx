"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils/helpers/cn"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      // The track is neutral; the fill is the theme's (bg-progress): the
      // logo's gradient in the house theme, the chosen accent in the others
      // (app/themes.css). Wave 1 made it grey to save the accent for actions,
      // which left a colour theme nothing to colour. Its deep stop leads, so
      // the moving edge holds 3:1 on the track.
      "relative h-2 w-full overflow-hidden rounded-full bg-highlight",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-progress transition-transform duration-200 ease-standard"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
