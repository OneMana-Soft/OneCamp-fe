// A camera's background, cut out on this device: LiveKit's track processors
// on MediaPipe's selfie segmenter, every file served by this server
// (assets.ts). Loaded the first time someone turns a background on; nothing
// here is in a page's first load. One processor per camera track, switched
// between choices in place, so changing blur for a backdrop doesn't flash
// the real room.

import type { LocalVideoTrack, TrackProcessor, Track } from "livekit-client"
import { SEGMENTER_MODEL, VISION_FILESET } from "./assets"
import { backdropUrl } from "./backdrops"
import { BLUR_RADIUS, type Background } from "./effects"
import { readPicture } from "./picture"
import { once } from "@/lib/lazy/once"

type Lib = typeof import("@livekit/track-processors")
type Switchable = Awaited<ReturnType<Lib["BackgroundProcessor"]>>

const load = once((): Promise<Lib> => import("@livekit/track-processors"))

/** The processor's name on a track, to tell ours from anyone else's. */
const NAME = "onecamp-background"

/** Why a background can't be put on here, in words, or null when it can. */
export async function backgroundUnavailable(): Promise<string | null> {
  try {
    const m = await load()
    return m.supportsBackgroundProcessors() ? null : "This browser can't change your background. Chrome, Edge, Firefox and Safari 17 or later can."
  } catch {
    return "Background effects couldn't load. Check your connection, then try again."
  }
}

/** What the processor is told for a choice: a blur's radius, or a picture to put behind. */
async function modeOf(choice: Exclude<Background, { kind: "none" }>, picture: () => string | null): Promise<Parameters<Switchable["switchTo"]>[0]> {
  if (choice.kind === "blur") return { mode: "background-blur", blurRadius: BLUR_RADIUS[choice.strength] }
  if (choice.kind === "backdrop") return { mode: "virtual-background", imagePath: await backdropUrl(choice.id) }
  const url = picture()
  if (!url) throw new Error("Your picture is no longer on this device. Choose it again.")
  return { mode: "virtual-background", imagePath: url }
}

const ours = (p: TrackProcessor<Track.Kind> | undefined): p is Switchable & TrackProcessor<Track.Kind> => !!p && p.name === NAME && "switchTo" in p

/**
 * Puts a background on a camera track, changes it, or takes it off. `onFrame`
 * hears how long each frame took (ms), for the strain watch. Throws, in
 * words, when it can't: the caller says so and the camera stays as it is.
 */
export async function applyBackground(
  track: LocalVideoTrack,
  choice: Background,
  opts: { picture?: () => string | null; onFrame?: (ms: number) => void } = {},
): Promise<void> {
  const current = track.getProcessor()
  if (choice.kind === "none") {
    if (current && current.name === NAME) await track.stopProcessor()
    return
  }
  const mode = await modeOf(choice, opts.picture ?? readPicture)
  if (ours(current)) {
    await current.switchTo(mode)
    return
  }
  const m = await load()
  if (!m.supportsBackgroundProcessors()) throw new Error("This browser can't change your background.")
  const processor = m.BackgroundProcessor(
    {
      ...mode,
      // Never MediaPipe's own defaults (a CDN and Google's storage): this server's copies.
      assetPaths: { tasksVisionFileSet: VISION_FILESET, modelAssetPath: SEGMENTER_MODEL },
      onFrameProcessed: (s) => opts.onFrame?.(s.processingTimeMs),
    },
    NAME,
  )
  await track.setProcessor(processor)
}
