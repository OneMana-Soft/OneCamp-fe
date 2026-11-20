// A camera's look, on this device: its background cut out by LiveKit's
// track processors on MediaPipe's selfie segmenter, every file served by
// this server (assets.ts), and its touch-up and low light (look.ts). Loaded
// the first time someone turns a camera effect on; nothing here is in a
// page's first load. One processor per camera track (cameraTransformer.ts),
// changed in place, so changing blur for a backdrop doesn't flash the real
// room.

import type { LocalVideoTrack, TrackProcessor, Track } from "livekit-client"
import { SEGMENTER_MODEL, VISION_FILESET } from "./assets"
import { backdropUrl } from "./backdrops"
import { CameraTransformer, type CameraOptions } from "./cameraTransformer"
import { BLUR_RADIUS, cameraOn, type Background, type CameraLook } from "./effects"
import { readPicture, type PictureSlot } from "./picture"
import { once } from "@/lib/lazy/once"

type Lib = typeof import("@livekit/track-processors")
type Ours = InstanceType<Lib["ProcessorWrapper"]> & { transformer: CameraTransformer }

const load = once((): Promise<Lib> => import("@livekit/track-processors"))

/** The processor's name on a track, to tell ours from anyone else's. */
const NAME = "onecamp-camera"

/** Why a camera effect can't be put on here, in words, or null when it can. */
export async function backgroundUnavailable(): Promise<string | null> {
  try {
    const m = await load()
    return m.supportsBackgroundProcessors() ? null : "This browser can't change your background. Chrome, Edge, Firefox and Safari 17 or later can."
  } catch {
    return "Background effects couldn't load. Check your connection, then try again."
  }
}

/** What the library's background is told for a choice: a blur's radius, or a picture to put behind. */
async function backgroundOf(choice: Background, picture: (slot: PictureSlot) => string | null): Promise<CameraOptions["background"]> {
  if (choice.kind === "none") return null
  if (choice.kind === "blur") return { blurRadius: BLUR_RADIUS[choice.strength], imagePath: undefined }
  if (choice.kind === "backdrop") return { imagePath: await backdropUrl(choice.id), blurRadius: undefined }
  const scene = choice.kind === "scene"
  const url = picture(scene ? "scene" : "own")
  if (!url) throw new Error(scene ? "Your scene is no longer on this device. Make it again." : "Your picture is no longer on this device. Choose it again.")
  return { imagePath: url, blurRadius: undefined }
}

const ours = (p: TrackProcessor<Track.Kind> | undefined): p is Ours & TrackProcessor<Track.Kind> => !!p && p.name === NAME && "updateTransformerOptions" in p

/**
 * Puts a camera's look (its background, touch-up and low light) on a track,
 * changes it in place, or takes it off, as one processor. `onFrame` hears how
 * long each frame took (ms), for the strain watch; `onLost` hears the
 * touch-up and low light stop when the browser's graphics are lost. Both go
 * to the processor already on the track too (the green room's, taken over by
 * the call), so they hear it from the next frame. Throws,
 * in words, when it can't: the caller says so and the camera stays as it is.
 */
export async function applyCamera(
  track: LocalVideoTrack,
  look: CameraLook,
  opts: { picture?: (slot: PictureSlot) => string | null; onFrame?: (ms: number) => void; onLost?: () => void } = {},
): Promise<void> {
  const current = track.getProcessor()
  if (!cameraOn(look)) {
    if (current && current.name === NAME) await track.stopProcessor()
    return
  }
  const options: CameraOptions = { background: await backgroundOf(look.background, opts.picture ?? readPicture), touchUp: look.touchUp, lowLight: look.lowLight }
  if (ours(current)) {
    current.transformer.setHooks({ onFrame: opts.onFrame, onLost: opts.onLost })
    await current.updateTransformerOptions(options)
    return
  }
  const m = await load()
  if (!m.supportsBackgroundProcessors()) throw new Error("This browser can't change your background.")
  const camera = new CameraTransformer(m, options, { assetPaths: { tasksVisionFileSet: VISION_FILESET, modelAssetPath: SEGMENTER_MODEL }, onFrame: opts.onFrame, onLost: opts.onLost })
  await track.setProcessor(new m.ProcessorWrapper<CameraOptions, CameraTransformer>(camera, NAME))
}
