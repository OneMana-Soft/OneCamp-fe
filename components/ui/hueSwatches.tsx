"use client"

import * as React from "react"

import { CAMP_SWATCHES, HUE_CHOICES } from "@/components/ui/campSwatches"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { MenuCheck } from "@/components/ui/menuCheck"
import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * None and the six hues, to pick one (docs F1: a folder's colour, a
 * selection's), or the six alone where a colour can't be none (`clearable`
 * false: a table's colour rule, tables V3). A radio group: the arrow keys move between swatches, and
 * Enter, Space or a click picks one, so arrowing past a colour never writes
 * it. The chosen one wears an ink ring and a check (a check, not colour
 * alone, says chosen). 28 px swatches, 44 under a finger in the phone's sheet
 * (size "lg"). Each name is its tooltip and its name to a screen reader.
 */
export function HueSwatches({
  value,
  onPick,
  label = "Colour",
  size = "md",
  clearable = true,
  className,
}: {
  value: CampHue | null | undefined
  onPick: (hue: CampHue | null) => void
  label?: string
  size?: "md" | "lg"
  clearable?: boolean
  className?: string
}) {
  const choices: typeof HUE_CHOICES = clearable ? HUE_CHOICES : CAMP_SWATCHES
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])
  const at = Math.max(0, choices.findIndex((c) => c.hue === (value ?? null)))
  const [focus, setFocus] = React.useState(at)
  React.useEffect(() => setFocus(at), [at])
  const move = (to: number) => {
    const i = (to + choices.length) % choices.length
    setFocus(i)
    buttons.current[i]?.focus()
  }
  return (
    // In the phone's sheet the seven (or six) are one row at any phone's
    // width: a column each, 44 px where there is room (42 at 375).
    <div
      role="radiogroup"
      aria-label={label}
      data-hue-swatches=""
      className={cn(size === "lg" ? ["mx-auto grid w-full max-w-[356px] justify-items-center gap-2", clearable ? "grid-cols-7" : "grid-cols-6"] : "flex flex-wrap items-center gap-2", className)}
    >
      {choices.map((c, i) => {
        const chosen = i === at
        return (
          <button
            key={c.name}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={c.name}
            title={c.name}
            tabIndex={i === focus ? 0 : -1}
            data-swatch={c.hue ?? "none"}
            onClick={() => onPick(c.hue)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault()
                move(i + 1)
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault()
                move(i - 1)
              } else if (e.key === "Home") {
                e.preventDefault()
                move(0)
              } else if (e.key === "End") {
                e.preventDefault()
                move(choices.length - 1)
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onPick(c.hue)
              }
            }}
            className={cn(
              c.hue ? [HUE_CLASS[c.hue], "bg-hue text-white"] : "bg-sunken text-ink-3 inset-ring-[1.5px] inset-ring-line-3",
              "relative flex shrink-0 items-center justify-center rounded-lg outline-none",
              size === "lg" ? "aspect-square w-full max-w-11" : "size-7",
              "transition-[transform,box-shadow] duration-[140ms] ease-[var(--ease-out)] hover:scale-[1.06] active:scale-95 motion-reduce:hover:scale-100",
              "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop",
              chosen && "ring-2 ring-ink ring-offset-2 ring-offset-pop",
            )}
          >
            {/* No colour: a line across, as an empty swatch is drawn everywhere. */}
            {c.hue ? null : <span aria-hidden="true" className="absolute h-[1.5px] w-[70%] -rotate-45 rounded-sm bg-line-3" />}
            <MenuCheck checked={chosen} className={cn("relative", size === "lg" && "size-5 [&>svg]:size-5", c.hue ? "text-white" : "text-ink")} />
          </button>
        )
      })}
    </div>
  )
}
