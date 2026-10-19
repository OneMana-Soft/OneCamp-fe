"use client"

import * as React from "react"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { CALENDAR_HUE } from "@/components/calendar/calendarTones"
import type { CampHue } from "@/lib/campHue"
import { Check } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** The swatches, in the order STEP5_PLAN §3 C draws them, each named. */
const SWATCHES: { hue: CampHue; name: string }[] = [
  { hue: "moss", name: "Moss" },
  { hue: "sun", name: "Sun" },
  { hue: "lake", name: "Lake" },
  { hue: "sky", name: "Sky" },
  { hue: "dusk", name: "Dusk" },
  { hue: "berry", name: "Berry" },
]

/**
 * An event's own colour in the Event Form (STEP5_PLAN §3 C, the week in
 * colour): its calendar's colour first, the default, then the six camp hues;
 * no free colour (DESIGN_V3 §3.5). A filled swatch is a colour of the
 * event's own; the calendar's is hollow, a ring in the calendar's hue around
 * the sheet, as it follows the calendar ("Calendar colour (Sky)"). A radio
 * group: arrow keys move the choice, and each swatch's name is its tooltip
 * and its name to a screen reader. Swatches are 20 px, 28 under a finger, in
 * a 44 px reach; the chosen one has an ink ring and a check (in the hue's
 * ink on the hollow one).
 */
export function HueRow({ value, onChange }: { value: string; onChange: (hue: string) => void }) {
  const calendarHue = CALENDAR_HUE.onecamp
  const choices: { hue: string; name: string; drawn: CampHue; calendar?: boolean }[] = [
    { hue: "", name: `Calendar colour (${SWATCHES.find((s) => s.hue === calendarHue)?.name ?? calendarHue})`, drawn: calendarHue, calendar: true },
    ...SWATCHES.map((s) => ({ hue: s.hue as string, name: s.name, drawn: s.hue })),
  ]
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])
  const at = Math.max(0, choices.findIndex((c) => c.hue === value))
  const move = (to: number) => {
    const i = (to + choices.length) % choices.length
    onChange(choices[i].hue)
    buttons.current[i]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center gap-1.5 py-1 pointer-coarse:gap-2" data-touch-group="20" data-form-hue="">
      {choices.map((c, i) => (
        <button
          key={c.name}
          ref={(el) => {
            buttons.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={i === at}
          aria-label={c.name}
          title={c.name}
          tabIndex={i === at ? 0 : -1}
          onClick={() => onChange(c.hue)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault()
              move(i + 1)
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault()
              move(i - 1)
            }
          }}
          className={cn(
            HUE_CLASS[c.drawn],
            "flex size-5 shrink-0 items-center justify-center rounded-md outline-none pointer-coarse:size-7",
            c.calendar ? "border-2 border-hue bg-transparent text-hue-ink" : "bg-hue text-white",
            "transition-shadow duration-[120ms] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop",
            i === at && "ring-2 ring-ink ring-offset-2 ring-offset-pop",
          )}
          data-touch-target=""
          data-hue={c.drawn}
          data-hollow={c.calendar || undefined}
        >
          {i === at ? <Check className="size-3" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  )
}
