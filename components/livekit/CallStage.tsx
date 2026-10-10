"use client"

// The call screen's own pieces, apart from LiveKit's: a face for a camera
// that is off, the recording indicator and the captions. Kept out of
// VideoConference so they render (and are tested) without a room, and so a
// build without AI carries them too: nothing here imports from components/ai.

import { useEffect, useState } from "react"
import { useIsMuted, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import { Track } from "livekit-client"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { prefersReducedMotion } from "@/lib/celebrate"

/** Whether a tile shows a face rather than a picture: a camera with nothing to show. Pure. */
export function cameraIsOff(trackRef: Pick<TrackReferenceOrPlaceholder, "source" | "publication">, muted: boolean): boolean {
  return trackRef.source === Track.Source.Camera && (!trackRef.publication || muted)
}

/**
 * A person whose camera is off, in their own colour: their hue's tint fills
 * the tile, with their initials and name. LiveKit's placeholder was the same
 * grey silhouette for everybody, so a grid of people with cameras off was a
 * grid of identical shapes. The colour is lib/campHue's, keyed by their
 * identity, so it matches their avatar everywhere else.
 */
export function CameraOffFace({ trackRef, size = "md" }: { trackRef: TrackReferenceOrPlaceholder; size?: "sm" | "md" | "lg" }) {
  const muted = useIsMuted(trackRef)
  if (!cameraIsOff(trackRef, muted)) return null
  const who = trackRef.participant
  const name = who.name || who.identity || "Guest"
  const hue = hueFor(who.identity)
  const px = size === "sm" ? 40 : size === "lg" ? 96 : 64
  return (
    <div className={cn(HUE_CLASS[hue], "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-hue-tint")} data-camera-off="" data-hue={hue}>
      <IdentityMark variant="avatar" size={px} id={who.identity} label={name} />
      {size !== "sm" && <span className="max-w-[80%] truncate text-sm font-medium text-hue-ink">{name}</span>}
    </div>
  )
}

/**
 * Says the call is being recorded, and by whom, for as long as it is: a
 * steady mark in the danger colour, said in words. It slid in from the top
 * under a blur and an animation, then sat there unlabelled for assistive tech.
 */
export function RecordingIndicator({ by }: { by: string | null }) {
  return (
    <div role="status" className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
      <span className="flex items-center gap-2 rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground shadow-overlay">
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
        {by ? `Recording, started by ${by}` : "Recording"}
      </span>
    </div>
  )
}

export interface CaptionEntry {
  identity: string
  name: string
  text: string
}

/**
 * Live captions over the call. Read out as they change (aria-live), each
 * speaker named in sentence case in their own colour, on a solid surface. The
 * names were capitals in a raw blue, every bubble on frosted glass.
 */
export function CaptionsOverlay({ entries, idleMessage }: { entries: CaptionEntry[]; idleMessage: string }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-24 left-1/2 z-[var(--z-fixed)] flex w-full max-w-2xl -translate-x-1/2 flex-col items-center justify-end gap-2 px-4"
    >
      {entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-popover px-4 py-2.5 text-sm text-muted-foreground shadow-overlay">{idleMessage}</div>
      ) : (
        entries.map((e) => {
          const hue = hueFor(e.identity)
          return (
            <div key={e.identity} className="w-auto min-w-[18rem] max-w-full rounded-lg border border-border bg-popover px-4 py-3 text-left shadow-overlay">
              <span className={cn(HUE_CLASS[hue], "mb-1 block text-xs font-semibold text-hue-ink")}>{e.name}</span>
              <span className="block text-lg leading-snug text-foreground">
                <TypingText text={e.text} />
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

/**
 * New words type in quickly, so a caption grows as it is spoken; with reduced
 * motion they appear at once. A correction to what is already shown snaps.
 */
export function TypingText({ text = "" }: { text?: string }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (!text) return
    if (prefersReducedMotion() || !text.startsWith(shown) || text.length <= shown.length) {
      setShown(text)
      return
    }
    const delta = text.length - shown.length
    const step = Math.max(10, 40 - Math.min(30, delta * 2))
    const timer = setInterval(() => {
      setShown((prev) => {
        const next = text.slice(0, prev.length + 1)
        if (next.length >= text.length) clearInterval(timer)
        return next
      })
    }, step)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return <span>{shown}</span>
}
