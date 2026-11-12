"use client"

import * as React from "react"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { OWN_HUE } from "@/components/calendar/calendarTones"
import type { CampHue } from "@/lib/campHue"
import { CAMP_SWATCHES } from "@/components/ui/campSwatches"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSheetMode } from "@/components/ui/overlayMode"
import { useFetch } from "@/hooks/useFetch"
import { lazyView } from "@/lib/lazy/lazyView"
import { KEY, setPreference, type Preferences } from "@/lib/preferences/usePreference"
import { ownHueVars } from "@/lib/color/ownHue"
import { RECENT_COLOURS_KEY, recentColoursOf, withRecentColour } from "@/lib/calendar/recentColours"
import { Check, Loader2, Plus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

// More colours' picker (components/ui/colourPicker), loaded on its first open.
const Picker = lazyView(() => import("@/components/ui/colourPicker"))

/**
 * An event's own colour in the Event Form (STEP5_PLAN §3 C, the week in
 * colour; calendar head B's More colours, DESIGN-BUILD-112): its calendar's
 * colour first, the default, then the six camp hues, then the event's own
 * colour when it has one, and last a ring of every hue with a "+", More
 * colours, which opens the picker: a popover on a computer, a sheet on a
 * phone. A filled swatch is a colour of the event's own; the calendar's is
 * hollow, a ring in the calendar's hue around the sheet, as it follows the
 * calendar ("Calendar colour (Sky)"). A radio group: arrow keys move the
 * choice, and each swatch's name is its tooltip and its name to a screen
 * reader. Swatches are 20 px, 28 under a finger, in a 44 px reach; the chosen
 * one has an ink ring and a check. A colour saved from the picker goes first
 * in the reader's own "Your colours" (calendar.recent_colours). Only whoever
 * may change the event has the form; a reader sees the colour, never this.
 */
export function HueRow({ value, onChange, sample }: { value: string; onChange: (hue: string) => void; sample?: string }) {
  const calendarHue = OWN_HUE
  const own = ownHueVars(value)
  const choices: { hue: string; name: string; drawn: CampHue; calendar?: boolean; own?: boolean }[] = [
    { hue: "", name: `Calendar colour (${CAMP_SWATCHES.find((s) => s.hue === calendarHue)?.name ?? calendarHue})`, drawn: calendarHue, calendar: true },
    ...CAMP_SWATCHES.map((s) => ({ hue: s.hue as string, name: s.name, drawn: s.hue })),
    ...(own ? [{ hue: value, name: `Your colour ${value}`, drawn: calendarHue, own: true }] : []),
  ]
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])
  const at = Math.max(0, choices.findIndex((c) => c.hue === value))
  const move = (to: number) => {
    const i = (to + choices.length) % choices.length
    onChange(choices[i].hue)
    buttons.current[i]?.focus()
  }
  const sheet = useSheetMode()
  const [picking, setPicking] = React.useState(false)
  // The reader's own colours, read as the picker opens (not with every page: usePreference).
  const read = useFetch<{ data?: Preferences }>(picking ? KEY : "")
  const prefs = read?.data?.data
  const save = (hex: string) => {
    setPicking(false)
    onChange(hex)
    const before = prefs?.[RECENT_COLOURS_KEY]
    // Quiet: the event's colour is set either way; Your colours catches up on the next save.
    void setPreference(RECENT_COLOURS_KEY, withRecentColour(recentColoursOf(prefs), hex), before ?? null).catch(() => {})
  }
  const picker = (
    <Picker.View
      fallback={
        <div className="flex h-24 w-[18.5rem] max-w-full items-center justify-center text-meta text-ink-3" role="status">
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          Opening…
        </div>
      }
      render={(m) => <m.default value={own ? value : null} recent={recentColoursOf(prefs)} sample={sample?.trim() || undefined} sheet={sheet} onSave={save} onCancel={() => setPicking(false)} />}
    />
  )
  const more = (
    <button
      type="button"
      aria-label="More colours"
      title="More colours"
      data-more-colours=""
      data-touch-target=""
      onPointerEnter={() => void Picker.warm()}
      onFocus={() => void Picker.warm()}
      onClick={sheet ? () => setPicking(true) : undefined}
      className="flex size-5 shrink-0 items-center justify-center rounded-md p-0.5 outline-none transition-transform duration-[120ms] [background:conic-gradient(from_200deg,var(--camp-sky),var(--camp-lake),var(--camp-moss),var(--camp-sun),var(--camp-berry),var(--camp-dusk),var(--camp-sky))] hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop pointer-coarse:size-7 motion-reduce:transition-none"
    >
      <span className="flex size-full items-center justify-center rounded-sm bg-pop text-ink-2">
        <Plus className="size-2.5 pointer-coarse:size-3.5" aria-hidden="true" />
      </span>
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1 pointer-coarse:gap-2" data-touch-group="20">
      <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center gap-1.5 pointer-coarse:gap-2" data-form-hue="">
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
            style={c.own ? (own ?? undefined) : undefined}
            className={cn(
              c.own ? "hue-own" : HUE_CLASS[c.drawn],
              "flex size-5 shrink-0 items-center justify-center rounded-md outline-none pointer-coarse:size-7",
              c.calendar ? "border-2 border-hue bg-transparent text-hue-ink" : c.own ? "bg-hue text-hue-tint" : "bg-hue text-white",
              "transition-shadow duration-[120ms] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop",
              i === at && "ring-2 ring-ink ring-offset-2 ring-offset-pop",
            )}
            data-touch-target=""
            data-hue={c.own ? "own" : c.drawn}
            data-own-hue={c.own ? c.hue : undefined}
            data-hollow={c.calendar || undefined}
          >
            {i === at ? <Check className="size-3" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      {sheet ? (
        <>
          {more}
          {picking ? picker : null}
        </>
      ) : (
        <Popover open={picking} onOpenChange={setPicking}>
          <PopoverTrigger asChild>{more}</PopoverTrigger>
          {picking ? (
            <PopoverContent align="start" aria-label="More colours" className="w-auto p-3" data-colour-popover="">
              {picker}
            </PopoverContent>
          ) : null}
        </Popover>
      )}
    </div>
  )
}
