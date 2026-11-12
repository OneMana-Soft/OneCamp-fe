// A camera's one processor (meet-09). LiveKit's track processors run one
// transformer per track, so this is it: each frame goes through low light
// first (lowLight.ts, on the frame's own planes), then the touch-up (look.ts,
// WebGL), each when it is on, and then through the library's own
// BackgroundTransformer, when a background is on.
// The background cuts the person out of the touched-up frame, so a touch-up
// only ever shows on the person, and the segmenter sees a dark room already
// brightened. The background's transformer (MediaPipe with it) is made the
// first time a background is chosen, and kept, gone round, while it is none.
// Only the library's public API.

import type { BackgroundOptions, TrackTransformerDestroyOptions, VideoTrackTransformer, VideoTransformerInitOptions } from "@livekit/track-processors"
import type { TouchUp } from "./effects"
import { makeLookPass, type LookPass } from "./look"
import { makeLightPass, type LightPass } from "./lowLight"

type Lib = Pick<typeof import("@livekit/track-processors"), "BackgroundTransformer">
type Background = InstanceType<Lib["BackgroundTransformer"]>

export type CameraOptions = {
  /** What the library's background is told (a blur's radius, or a picture), or null for none. */
  background: Pick<BackgroundOptions, "blurRadius" | "imagePath"> | null
  touchUp: TouchUp
  lowLight: boolean
}

export interface CameraHooks {
  /** Where MediaPipe's files are served (assets.ts). */
  assetPaths: { tasksVisionFileSet: string; modelAssetPath: string }
  /** How long each frame took, all told (ms), for the strain watch. */
  onFrame?: (ms: number) => void
  /** The touch-up stopped: this browser's graphics were lost. The camera carries on without it (low light needs none). */
  onLost?: () => void
  /** Makes the touch-up's WebGL pass (look.ts's own unless a test hands one in). */
  pass?: () => LookPass
  /** Makes low light's pass (lowLight.ts's own unless a test hands one in). */
  light?: () => LightPass
}


export class CameraTransformer implements VideoTrackTransformer<CameraOptions> {
  transformer?: TransformStream
  private io: VideoTransformerInitOptions | null = null
  private look: LookPass | null = null
  private light: LightPass | null = null
  private making: Promise<Background> | null = null
  private background: Background | null = null
  private lookMs = 0
  private stopped = false

  constructor(
    private readonly lib: Lib,
    private options: CameraOptions,
    private hooks: CameraHooks,
  ) {}

  async init(io: VideoTransformerInitOptions) {
    this.io = io
    this.stopped = false
    this.transformer = new TransformStream({ transform: (frame: VideoFrame, controller) => this.transform(frame, controller) })
    await this.update(this.options)
  }

  async restart(io: VideoTransformerInitOptions) {
    this.io = io
    await this.background?.restart(io)
  }

  async destroy(o?: TrackTransformerDestroyOptions) {
    this.stopped = true
    this.look?.dispose()
    this.look = null
    const background = this.background
    this.background = null
    this.making = null
    await background?.destroy(o)
  }

  /** A choice changed: in place, so the real room never shows between two backgrounds. */
  async update(options: CameraOptions) {
    this.options = options
    if (options.touchUp !== "off" && !this.look) this.look = (this.hooks.pass ?? makeLookPass)()
    if (options.lowLight && !this.light) this.light = (this.hooks.light ?? makeLightPass)()
    if (!options.background) return
    if (!this.making) {
      const made = this.makeBackground(options.background)
      this.making = made
      made.catch(() => {
        if (this.making === made) this.making = null
      })
    }
    const background = await this.making
    if (this.options.background) await background.update(this.options.background)
  }

  /**
   * Who hears the frames and the lost graphics from now on: whoever put the
   * camera's look on last. The green room makes the processor with nobody to
   * tell, and the call takes the same one over, so the call's strain watch
   * hears every frame from then on.
   */
  setHooks(hooks: Pick<CameraHooks, "onFrame" | "onLost">) {
    this.hooks = { ...this.hooks, onFrame: hooks.onFrame, onLost: hooks.onLost }
  }

  private async makeBackground(first: NonNullable<CameraOptions["background"]>): Promise<Background> {
    if (!this.io) throw new Error("The camera isn't ready yet.")
    const background = new this.lib.BackgroundTransformer({
      ...first,
      // Never MediaPipe's own defaults (a CDN and Google's storage): this server's copies.
      assetPaths: this.hooks.assetPaths,
      onFrameProcessed: (s) => this.hooks.onFrame?.(this.lookMs + s.processingTimeMs),
    })
    await background.init(this.io)
    if (this.stopped) {
      await background.destroy()
      throw new Error("The camera stopped.")
    }
    this.background = background
    return background
  }

  async transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
    let out = frame
    const started = performance.now()
    if (this.light && this.options.lowLight) {
      const lit = await this.light.draw(out)
      if (lit) {
        out.close()
        out = lit
      }
    }
    if (this.look && this.options.touchUp !== "off") {
      const drawn = this.look.lost() ? null : this.look.draw(out, this.options.touchUp)
      if (drawn) {
        out.close()
        out = drawn
      } else if (this.look.lost()) this.lose()
    }
    this.lookMs = performance.now() - started
    const background = this.options.background ? this.background : null
    if (background) return background.transform(out, controller)
    controller.enqueue(out)
    this.hooks.onFrame?.(this.lookMs)
  }

  /** The touch-up's graphics are gone: the frames go on without it, and the caller hears it once. */
  private lose() {
    this.look?.dispose()
    this.look = null
    this.lookMs = 0
    this.hooks.onLost?.()
  }
}
