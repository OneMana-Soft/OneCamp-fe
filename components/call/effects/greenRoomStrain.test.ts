import { afterEach, describe, expect, it, vi } from "vitest"
import { lookOf, type CallEffects } from "@/lib/calls/processors/effects"

// Effects chosen in the green room ride into the call on the same camera
// processor, so a computer that can't keep up must still be stepped down in
// the call: the call's strain watch hears that processor's frame times from
// the moment the call takes it over (V-780). The real processor, runner and
// watch; stand-ins for LiveKit's library (a background that takes 40 ms a
// frame) and for the toast. The watch's checks, 2 s apart, run on a fake clock.

const seen = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: () => true,
  ProcessorWrapper: class {
    constructor(
      readonly transformer: { update: (o: unknown) => Promise<void> },
      readonly name: string,
    ) {}
    updateTransformerOptions(o: unknown) {
      return this.transformer.update(o)
    }
  },
  BackgroundTransformer: class {
    constructor(private options: { onFrameProcessed: (s: { processingTimeMs: number }) => void }) {}
    async init() {}
    async update(o: object) {
      this.options = { ...this.options, ...o }
    }
    async transform(frame: unknown, controller: { enqueue: (f: unknown) => void }) {
      controller.enqueue(frame)
      this.options.onFrameProcessed({ processingTimeMs: 40 })
    }
    async destroy() {}
  },
}))
vi.mock("@/components/livekit/callSurface", () => ({ callToast: seen.toast }))

type Processor = { transformer: { init: (io: unknown) => Promise<void>; transform: (f: unknown, c: unknown) => Promise<void> } }

/** A camera track as LiveKit runs one: a processor put on it is started with the camera's frames. */
const camera = () => {
  let processor: Processor | undefined
  return {
    getProcessor: () => processor,
    setProcessor: async (p: Processor) => {
      processor = p
      await p.transformer.init({ outputCanvas: {}, inputElement: {} })
    },
    stopProcessor: async () => void (processor = undefined),
  }
}
const controller = { enqueue: () => undefined }

afterEach(() => {
  vi.useRealTimers()
  seen.toast.mockReset()
})

describe("effects chosen in the green room, on a computer that can't keep up", () => {
  it("are stepped down once in the call, and it says so once", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] })
    const { applyCamera } = await import("@/lib/calls/processors/background")
    const { makeRunner } = await import("./effectsRunner")
    const chosen: CallEffects = { background: { kind: "blur", strength: "strong" }, noise: "standard", touchUp: "off", lowLight: false }
    const track = camera()
    // The green room puts the look on the preview, with no strain watch to tell.
    await applyCamera(track as never, lookOf(chosen))

    // The call takes the same camera over, and watches it.
    let now = chosen
    const choose = vi.fn((e: Partial<CallEffects>) => void (now = { ...now, ...e }))
    const lightened = vi.fn()
    const runner = makeRunner({ room: {} as never, want: () => now, fellBack: vi.fn(), busy: vi.fn(), choose, lightened })
    await runner.camera(track as never, lookOf(chosen))
    const stop = runner.watch()
    await vi.dynamicImportSettled()

    // Every frame takes 40 ms, over the 24 ms budget, for 20 s of checks.
    const processor = track.getProcessor()!
    for (let s = 0; s < 20; s += 2) {
      for (let i = 0; i < 10; i++) await processor.transformer.transform({ close: () => undefined }, controller)
      vi.advanceTimersByTime(2000)
    }
    stop()

    expect(choose).toHaveBeenCalledTimes(1)
    expect(choose).toHaveBeenCalledWith({ ...chosen, background: { kind: "blur", strength: "light" } })
    expect(lightened).toHaveBeenCalledTimes(1)
    expect(seen.toast).toHaveBeenCalledTimes(1)
    expect(seen.toast.mock.calls[0][0]).toMatchObject({ title: "Effects made lighter", description: "Your computer is busy, so your background blur is lighter for now." })
  })
})
