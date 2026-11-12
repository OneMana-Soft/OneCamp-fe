"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { fieldKeyDown } from "@/lib/keys/ime"
import { PAD_LIGHTNESS, padColour, padPlace, padStep, type PadPlace } from "@/lib/color/colourPad"
import { SHEET, hexOf, ownColour } from "@/lib/color/ownColour"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * More colours (DESIGN-BUILD-112; calendar head B first, any area after): a
 * colour of one's own, past the curated hues. A pad of hue across and
 * lightness down (the arrow keys move it, Shift by more), a labelled hex
 * field, "Your colours" (the caller's recent ones), and a live preview on a
 * light and a dark sheet at once, drawn as lib/color/ownColour cuts it: a
 * colour that has to move to stand out shows where it moved to. An invalid hex
 * says so and Save waits. The caller holds it: inside its popover on a
 * computer, or as a sheet of its own on a phone (`sheet`), Save pinned at its
 * foot. Its chunk reads and writes nothing: the caller keeps the colours.
 */
export interface ColourPickerProps {
  /** The colour it opens on, "#rrggbb" (a camp hue's name or nothing opens on the pad's middle). */
  value?: string | null
  /** The reader's own colours, newest first. */
  recent: string[]
  /** The words the preview chip says ("Launch review"). */
  sample?: string
  /** A phone: a sheet of its own, Save pinned at its foot. */
  sheet?: boolean
  onSave: (hex: string) => void
  onCancel: () => void
}

const TOP = PAD_LIGHTNESS.top
const SPAN = PAD_LIGHTNESS.top - PAD_LIGHTNESS.bottom
const START: PadPlace = { hue: 250, lightness: 0.6 }
// The pad's look: the hues across at a middle lightness, lighter above and darker below.
const PAD_LOOK = `linear-gradient(to bottom, rgb(255 255 255 / 0.94), rgb(255 255 255 / 0) 42%, rgb(0 0 0 / 0) 52%, rgb(0 0 0 / 0.9)), linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => padColour(i * 30, 0.62)).join(", ")})`
const CAPTION = { light: "#67696f", dark: "#95979e" } as const

function Pad({ at, colour, onMove }: { at: PadPlace; colour: string; onMove: (p: PadPlace) => void }) {
  const place = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1)))
    onMove({ hue: Math.round(x * 359), lightness: Math.round((TOP - y * SPAN) * 1000) / 1000 })
  }
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Colour"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={at.hue}
      aria-valuetext={`Hue ${at.hue}°, lightness ${Math.round(at.lightness * 100)}%`}
      data-colour-pad=""
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        place(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) place(e)
      }}
      onKeyDown={(e) => {
        const next = padStep(at, e.key, e.shiftKey)
        if (!next) return
        e.preventDefault()
        onMove(next)
      }}
      style={{ backgroundImage: PAD_LOOK }}
      className="relative h-36 w-full shrink-0 cursor-crosshair touch-none select-none rounded-lg outline-none ring-1 ring-inset ring-black/10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop pointer-coarse:h-44"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white shadow-e2"
        style={{ left: `${(at.hue / 359) * 100}%`, top: `${((TOP - at.lightness) / SPAN) * 100}%`, background: colour }}
      />
    </div>
  )
}

/** A colour's small square, for "Your colours" and where a clamped one moved to. */
function Swatch({ hex, className }: { hex: string; className?: string }) {
  return <span aria-hidden="true" data-swatch={hex} className={cn("inline-block size-3.5 shrink-0 rounded-[4px] ring-1 ring-inset ring-black/10", className)} style={{ background: hex }} />
}

export default function ColourPicker({ value, recent, sample = "Your event", sheet = false, onSave, onCancel }: ColourPickerProps) {
  const id = React.useId()
  const first = hexOf(value ?? "")
  const [text, setText] = React.useState(first ?? padColour(START.hue, START.lightness))
  const [at, setAt] = React.useState<PadPlace>(first ? padPlace(first) : START)
  const hex = hexOf(text)
  const colour = ownColour(hex)
  const moveTo = (p: PadPlace) => {
    setAt(p)
    setText(padColour(p.hue, p.lightness))
  }
  const type = (t: string) => {
    setText(t)
    const h = hexOf(t)
    if (h) setAt(padPlace(h))
  }
  const save = () => hex && onSave(hex)

  const body = (
    <div className="grid gap-3" data-colour-picker={sheet ? "sheet" : "popover"}>
      <Pad at={at} colour={hex ?? padColour(at.hue, at.lightness)} onMove={moveTo} />
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-hex`} className="w-8 shrink-0 text-meta font-medium text-ink-2">
            Hex
          </label>
          <Input
            id={`${id}-hex`}
            value={text}
            onChange={(e) => type(e.target.value)}
            onKeyDown={fieldKeyDown((e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                save()
              }
            })}
            aria-invalid={!hex}
            aria-describedby={hex ? undefined : `${id}-bad`}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            className="h-8 min-w-0 flex-1 font-mono text-ui-sm tabular-nums"
          />
          <Swatch hex={hex ?? "transparent"} className="size-8 rounded-md" />
        </div>
        {hex ? null : (
          <p id={`${id}-bad`} role="alert" className="pl-10 text-meta text-danger-ink">
            Write it as # and six digits or letters a to f, like #3b7ddd.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <p id={`${id}-yours`} className="text-meta font-medium text-ink-2">
          Your colours
        </p>
        {recent.length ? (
          <div role="group" aria-labelledby={`${id}-yours`} className="flex flex-wrap gap-1.5" data-touch-group="24">
            {recent.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={c === hex}
                title={c}
                data-swatch={c}
                data-touch-target=""
                onClick={() => type(c)}
                style={{ background: c }}
                className={cn(
                  "size-6 rounded-md outline-none ring-1 ring-inset ring-black/10 transition-shadow duration-[120ms] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop pointer-coarse:size-8",
                  c === hex && "ring-2 ring-ink ring-offset-2 ring-offset-pop",
                )}
              />
            ))}
          </div>
        ) : (
          <p className="text-meta text-ink-3">Colours you save show here.</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <p className="text-meta font-medium text-ink-2">Preview</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["light", "dark"] as const).map((theme) => {
            const tones = colour?.[theme]
            return (
              <div key={theme} data-preview={theme} className="min-w-0 rounded-lg px-2 pb-2 pt-1.5 ring-1 ring-inset ring-line" style={{ background: SHEET[theme] }}>
                <span className="mb-1 block text-micro font-medium" style={{ color: CAPTION[theme] }}>
                  {theme === "light" ? "Light" : "Dark"}
                </span>
                <span
                  className="relative flex h-[26px] items-center overflow-hidden rounded-md pl-[9px] pr-1.5 text-meta font-medium"
                  style={tones ? { background: `color-mix(in oklab, ${tones.tint} 60%, ${SHEET[theme]})`, color: tones.ink } : { color: CAPTION[theme] }}
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tones?.solid ?? CAPTION[theme] }} />
                  <span className="truncate">{sample}</span>
                </span>
              </div>
            )
          })}
        </div>
        {colour && (colour.clamped.light || colour.clamped.dark) ? (
          <div data-clamped="" className="grid gap-1 rounded-md bg-sunken px-2 py-1.5 text-meta text-ink-2" role="status">
            {colour.clamped.light ? (
              <p className="flex items-center gap-1.5">
                <Swatch hex={colour.light.solid} />
                On a light screen it shows a little darker, so it stands out.
              </p>
            ) : null}
            {colour.clamped.dark ? (
              <p className="flex items-center gap-1.5">
                <Swatch hex={colour.dark.solid} />
                On a dark screen it shows a little lighter, so it stands out.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )

  const actions = (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="ghost" size={sheet ? "default" : "sm"} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" size={sheet ? "default" : "sm"} onClick={save} disabled={!hex}>
        Save
      </Button>
    </div>
  )

  if (sheet) {
    return (
      <Drawer open onOpenChange={(open) => !open && onCancel()}>
        <DrawerContent data-colour-sheet="" footer={actions}>
          <DrawerHeader className="px-5 pb-1 pt-2">
            <DrawerTitle className="text-sm font-[510] leading-5">More colours</DrawerTitle>
            <DrawerDescription className="text-meta text-ink-3">Pick any colour; the calendar keeps its words readable.</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-5 pb-2 pt-1">{body}</div>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <div className="grid w-[18.5rem] max-w-full gap-3">
      <p className="text-ui font-medium text-ink">More colours</p>
      {body}
      <div className="-mx-3 -mb-3 border-t border-line px-3 py-2">{actions}</div>
    </div>
  )
}
