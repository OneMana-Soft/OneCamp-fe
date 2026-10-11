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
      "relative h-1.5 w-full overflow-hidden rounded-full bg-press",
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

/**
 * A progress bar as design v3 draws it (work.md W08): 4 px inline, 6 px on
 * cards, a --press track, the theme's progress fill (the logo's gradient in
 * the house theme, the accent in the others), and moss once it is all done.
 * The fill is scaled, never sized: on first reveal it grows from the left
 * (320 ms, `grow`, through the caller's useGrow), and a change moves it by
 * transform over 320 ms. A pace tick (goals, cycles) is a 2 x 10 ink-2 mark
 * ringed in the sheet's colour, so it reads over the fill; its meaning is
 * always said in words beside the bar.
 */
export function Bar({
  value,
  size = 4,
  pace,
  label,
  grow,
  className,
  doneAtFull = true,
  tone,
}: {
  /** 0 to 100. */
  value: number
  size?: 4 | 6 | 8
  /** Where the work should be by now, 0 to 100. */
  pace?: number
  /** What is progressing, for assistive tech. */
  label: string
  /** The caller's useGrow bar props, for the first reveal. */
  grow?: { "data-grown": string; style?: React.CSSProperties }
  className?: string
  /** Fill moss at 100 % (a project or a goal); off for an estimate. */
  doneAtFull?: boolean
  /** Override the fill: "sun" for over an estimate. */
  tone?: "sun"
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const full = doneAtFull && v >= 100
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      data-bar=""
      className={cn("relative inline-block w-full min-w-0 shrink rounded-full bg-press align-middle", className)}
      style={{ height: size }}
    >
      <span className="absolute inset-0 overflow-hidden rounded-full">
        <span className="block h-full w-full" data-grown={grow?.["data-grown"]} style={grow?.style}>
          <span
            data-bar-fill=""
            className={cn(
              "block h-full w-full origin-left rounded-full transition-transform duration-[320ms] ease-out",
              tone === "sun" ? "bg-camp-sun" : full ? "bg-camp-moss" : "bg-progress",
            )}
            style={{ transform: `scaleX(${v / 100})` }}
          />
        </span>
      </span>
      {pace != null && Number.isFinite(pace) && (
        <span
          aria-hidden="true"
          data-pace-tick=""
          className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-ink-2"
          style={{ left: `${Math.max(0, Math.min(100, pace))}%`, boxShadow: "0 0 0 2px var(--sheet)" }}
        />
      )}
    </span>
  )
}
