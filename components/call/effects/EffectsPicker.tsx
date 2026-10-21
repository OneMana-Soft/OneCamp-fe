"use client"

// Backgrounds and sound, one picker for the green room and the call: what is
// behind someone (none, a light or strong blur, a backdrop drawn in the camp
// palette, a picture of their own) and how their microphone is cleaned up.
// Everything it offers runs on this device.

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { AudioLines, Check, CircleSlash, ImagePlus, Loader2, Trash2, User } from "@/lib/icons"
import type { Background, BackdropId, CallEffects, NoiseLevel } from "@/lib/calls/processors/effects"
import { BACKDROPS, NOISE_LEVELS, backgroundName } from "@/lib/calls/processors/effectsCopy"
import { cn } from "@/lib/utils/helpers/cn"

/** A background as a radio value, and back. Pure. */
export function valueOf(b: Background): string {
  if (b.kind === "blur") return `blur-${b.strength}`
  if (b.kind === "backdrop") return `backdrop-${b.id}`
  return b.kind
}
export function backgroundOf(value: string): Background {
  if (value === "blur-light" || value === "blur-strong") return { kind: "blur", strength: value === "blur-light" ? "light" : "strong" }
  if (value.startsWith("backdrop-")) return { kind: "backdrop", id: value.slice("backdrop-".length) as BackdropId }
  if (value === "picture") return { kind: "picture" }
  return { kind: "none" }
}

export interface EffectsPickerProps {
  effects: CallEffects
  onBackground: (b: Background) => void
  onNoise: (n: NoiseLevel) => void
  busy?: "background" | "noise" | null
  /** Why backgrounds can't run in this browser, or null. */
  unavailable?: string | null
  /** The backdrops' pictures, drawn on first look (backdropUrl). */
  backdrop: (id: BackdropId) => Promise<string>
  /** One's own picture, if one is kept, and how to change or forget it. */
  picture: { url: string | null; onChoose: (file: File) => void; onForget: () => void; note?: string | null }
  /** Tiles to a row: three in a panel or a sheet, four in the green room's wider popover. */
  columns?: 3 | 4
  /** A quiet line under the options while something holds them (the CPU watch). */
  note?: string | null
}

// The chosen tile's ring sits outside it, 2 px of light past 2 px of the
// surface: inset, a light ring vanished on the pale backdrops.
const TILE =
  "group relative flex aspect-video w-full items-end overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.06] text-left outline-none ring-offset-2 ring-offset-[#131416] transition-[box-shadow,background-color] duration-150 hover:bg-white/[0.10] focus-visible:ring-2 focus-visible:ring-brand data-[state=checked]:ring-2 data-[state=checked]:ring-[#EEEEF0] disabled:cursor-not-allowed disabled:opacity-50"
const TILE_NAME = "relative m-1 truncate rounded-[6px] bg-black/55 px-1.5 py-0.5 text-micro font-medium text-[#EEEEF0]"

export function EffectsPicker(p: EffectsPickerProps) {
  const headingId = React.useId()
  const noiseId = React.useId()
  const file = React.useRef<HTMLInputElement>(null)
  const off = !!p.unavailable
  return (
    <div className="space-y-5" data-effects-picker="">
      <section aria-labelledby={headingId}>
        <h3 id={headingId} className="mb-2 flex items-center gap-1.5 text-ui-sm font-medium text-[#EEEEF0]">
          Background
          {p.busy === "background" ? <Loader2 className="size-3.5 animate-spin text-ink-3" aria-label="Putting it on" /> : null}
        </h3>
        {off ? (
          <p className="mb-2 text-meta text-ink-3" data-effects-unavailable="">
            {p.unavailable}
          </p>
        ) : null}
        <RadioGroupPrimitive.Root
          aria-labelledby={headingId}
          value={valueOf(p.effects.background)}
          onValueChange={(v) => (v === "picture" && !p.picture.url ? file.current?.click() : p.onBackground(backgroundOf(v)))}
          className={cn("grid gap-2", p.columns === 4 ? "grid-cols-4" : "grid-cols-3")}
          disabled={off}
        >
          <RadioGroupPrimitive.Item value="none" className={TILE} aria-label="No effect">
            <span className="absolute inset-0 grid place-items-center text-ink-3 [&_svg]:size-5">
              <CircleSlash aria-hidden />
            </span>
            <span className={TILE_NAME}>None</span>
          </RadioGroupPrimitive.Item>
          {(["light", "strong"] as const).map((strength) => (
            <RadioGroupPrimitive.Item key={strength} value={`blur-${strength}`} className={TILE} aria-label={backgroundName({ kind: "blur", strength })}>
              {/* A room's shape behind a person, softened as much as the blur would. */}
              <span aria-hidden className={cn("absolute inset-0 bg-[linear-gradient(120deg,#3B7DDD_0%,#0E97A6_45%,#2F9E5B_100%)] opacity-70", strength === "light" ? "blur-[3px]" : "blur-[8px]")} />
              <span aria-hidden className="absolute inset-0 grid place-items-center text-white/90 [&_svg]:size-6">
                <User />
              </span>
              <span className={TILE_NAME}>{strength === "light" ? "Light blur" : "Strong blur"}</span>
            </RadioGroupPrimitive.Item>
          ))}
          {BACKDROPS.map((b) => (
            <RadioGroupPrimitive.Item key={b.id} value={`backdrop-${b.id}`} className={TILE} aria-label={b.name}>
              <BackdropThumb id={b.id} draw={p.backdrop} />
              <span className={TILE_NAME}>{b.name}</span>
            </RadioGroupPrimitive.Item>
          ))}
          <RadioGroupPrimitive.Item value="picture" className={TILE} aria-label={p.picture.url ? "Your picture" : "Add a picture of your own"}>
            {p.picture.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL on this device, never optimised
              <img src={p.picture.url} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span aria-hidden className="absolute inset-0 grid place-items-center text-ink-3 [&_svg]:size-5">
                <ImagePlus />
              </span>
            )}
            <span className={TILE_NAME}>{p.picture.url ? "Your picture" : "Add yours"}</span>
          </RadioGroupPrimitive.Item>
        </RadioGroupPrimitive.Root>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) p.picture.onChoose(f)
          }}
        />
        {p.picture.url ? (
          <div className="mt-2 flex items-center gap-3 text-meta">
            <button type="button" className="text-ink-2 underline-offset-2 hover:text-[#EEEEF0] hover:underline focus-visible:outline-2 focus-visible:outline-brand" onClick={() => file.current?.click()}>
              Change your picture
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-ink-3 hover:text-[#EEEEF0] focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-3.5" onClick={p.picture.onForget}>
              <Trash2 aria-hidden />
              Remove it
            </button>
          </div>
        ) : null}
        {p.picture.note ? <p className="mt-1.5 text-meta text-ink-3">{p.picture.note}</p> : null}
      </section>

      <section aria-labelledby={noiseId}>
        <h3 id={noiseId} className="mb-2 flex items-center gap-1.5 text-ui-sm font-medium text-[#EEEEF0] [&_svg]:size-4">
          <AudioLines aria-hidden className="text-ink-3" />
          Noise reduction
          {p.busy === "noise" ? <Loader2 className="size-3.5 animate-spin text-ink-3" aria-label="Changing it" /> : null}
        </h3>
        <RadioGroupPrimitive.Root aria-labelledby={noiseId} value={p.effects.noise} onValueChange={(v) => p.onNoise(v as NoiseLevel)} className="space-y-1">
          {NOISE_LEVELS.map((n) => (
            <RadioGroupPrimitive.Item
              key={n.level}
              value={n.level}
              className="group flex min-h-11 w-full items-start gap-2.5 rounded-[10px] px-2 py-2 text-left outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-brand data-[state=checked]:bg-white/[0.07]"
              aria-describedby={`${noiseId}-${n.level}`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-ui-sm text-[#EEEEF0]">{n.name}</span>
                <span id={`${noiseId}-${n.level}`} className="text-meta text-ink-3">
                  {n.detail}
                </span>
              </span>
              {/* The chosen level is the lit row, marked with a check (a row, not a circle). */}
              <RadioGroupPrimitive.Indicator className="mt-0.5 shrink-0 text-[#EEEEF0] [&_svg]:size-4">
                <Check aria-hidden />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
      </section>

      {p.note ? (
        <p className="-mt-3 text-meta text-ink-3" role="status" data-effects-note="">
          {p.note}
        </p>
      ) : null}

      <p className="text-meta text-ink-3" data-effects-on-device="">
        Effects run on this device. Nothing you show or say is sent anywhere to make them.
      </p>
    </div>
  )
}

/** A backdrop's picture, drawn the first time the picker shows it. */
function BackdropThumb({ id, draw }: { id: BackdropId; draw: (id: BackdropId) => Promise<string> }) {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    draw(id)
      .then((u) => live && setUrl(u))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id, draw])
  // eslint-disable-next-line @next/next/no-img-element -- drawn on this device as a blob, never optimised
  return url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : <span aria-hidden className="absolute inset-0 animate-pulse bg-white/[0.04]" />
}
