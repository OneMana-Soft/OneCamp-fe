import { describe, expect, it, vi } from "vitest"
import { CameraTransformer, type CameraHooks, type CameraOptions } from "./cameraTransformer"
import type { LookPass } from "./look"
import type { LightPass } from "./lowLight"

// One processor per camera: low light first (on the frame's own planes, no
// WebGL), then the touch-up (WebGL), then the library's own background, each
// only when chosen, changed in place. Driven with stand-ins for the library
// and both passes.

interface Frame {
  id: string
  close: () => void
}
const frame = (id: string): Frame => ({ id, close: vi.fn() })

function harness(start: CameraOptions, madeWith: Partial<CameraHooks> = {}) {
  const made: FakeBackground[] = []
  class FakeBackground {
    options: Record<string, unknown>
    init = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
    update = vi.fn(async (o: Record<string, unknown>) => {
      this.options = { ...this.options, ...o }
    })
    transform = vi.fn(async (f: Frame, c: { enqueue: (f: unknown) => void }) => {
      c.enqueue({ id: `background(${f.id})` })
      ;(this.options.onFrameProcessed as (s: { processingTimeMs: number }) => void)({ processingTimeMs: 7 })
    })
    destroy = vi.fn(async () => undefined)
    restart = vi.fn(async () => undefined)
    constructor(o: Record<string, unknown>) {
      this.options = o
      made.push(this)
    }
  }
  let lost = false
  const passes: LookPass[] = []
  const pass = () => {
    const p: LookPass = {
      draw: vi.fn((f: VideoFrame) => ({ id: `look(${(f as unknown as Frame).id})`, close: vi.fn() }) as unknown as VideoFrame),
      lost: () => lost,
      dispose: vi.fn(),
    }
    passes.push(p)
    return p
  }
  const lights: LightPass[] = []
  const light = () => {
    const p: LightPass = { draw: vi.fn(async (f: VideoFrame) => ({ id: `light(${(f as unknown as Frame).id})`, close: vi.fn() }) as unknown as VideoFrame) }
    lights.push(p)
    return p
  }
  const heard: number[] = []
  const onLost = vi.fn()
  const t = new CameraTransformer({ BackgroundTransformer: FakeBackground } as never, start, {
    assetPaths: { tasksVisionFileSet: "/vision", modelAssetPath: "/model.tflite" },
    onFrame: (ms) => heard.push(ms),
    onLost,
    pass,
    light,
    ...madeWith,
  })
  const out: { id: string }[] = []
  const controller = { enqueue: (f: { id: string }) => out.push(f) } as never
  const send = async (id: string) => {
    const f = frame(id)
    await t.transform(f as never, controller)
    return f
  }
  return { t, made, passes, lights, heard, onLost, out, send, lose: () => (lost = true) }
}

const io = { outputCanvas: {} as never, inputElement: {} as never }

describe("a camera's one processor", () => {
  it("draws the touch-up alone when no background is on, and loads no background for it", async () => {
    const h = harness({ background: null, touchUp: "smooth", lowLight: false })
    await h.t.init(io)
    const f = await h.send("a")
    expect(h.out.map((o) => o.id)).toEqual(["look(a)"])
    expect(f.close).toHaveBeenCalled()
    expect(h.made).toEqual([])
    expect(h.passes[0].draw).toHaveBeenCalledWith(f, "smooth")
    expect(h.lights).toEqual([])
    expect(h.heard).toHaveLength(1)
  })

  it("puts the background on the touched-up frame, makes it once however fast the choices come, and hears both costs", async () => {
    const h = harness({ background: null, touchUp: "subtle", lowLight: true })
    await h.t.init(io)
    const blur = { blurRadius: 6, imagePath: undefined }
    await Promise.all([h.t.update({ background: blur, touchUp: "subtle", lowLight: true }), h.t.update({ background: { blurRadius: 18, imagePath: undefined }, touchUp: "subtle", lowLight: true })])
    expect(h.made).toHaveLength(1)
    expect(h.made[0].options).toMatchObject({ blurRadius: 18, assetPaths: { tasksVisionFileSet: "/vision", modelAssetPath: "/model.tflite" } })
    await h.send("b")
    expect(h.out.map((o) => o.id)).toEqual(["background(look(light(b)))"])
    expect(h.heard[h.heard.length - 1]).toBeGreaterThanOrEqual(7)
  })

  it("lifts a dark picture with low light alone without any WebGL", async () => {
    const h = harness({ background: null, touchUp: "off", lowLight: true })
    await h.t.init(io)
    const f = await h.send("l")
    expect(h.out.map((o) => o.id)).toEqual(["light(l)"])
    expect(f.close).toHaveBeenCalled()
    expect(h.passes).toEqual([])
    expect(h.made).toEqual([])
    expect(h.heard).toHaveLength(1)
  })

  it("sends a frame on as it is when low light has nothing to lift", async () => {
    const h = harness({ background: null, touchUp: "off", lowLight: true })
    await h.t.init(io)
    vi.mocked(h.lights[0].draw).mockResolvedValueOnce(null)
    const f = await h.send("m")
    expect(h.out.map((o) => o.id)).toEqual(["m"])
    expect(f.close).not.toHaveBeenCalled()
  })

  it("sends a frame straight to the background when the touch-up and low light are off", async () => {
    const h = harness({ background: { imagePath: "/sky.png", blurRadius: undefined }, touchUp: "off", lowLight: false })
    await h.t.init(io)
    await h.send("c")
    expect(h.out.map((o) => o.id)).toEqual(["background(c)"])
    expect(h.passes).toEqual([])
  })

  it("goes round the background once it is none, and keeps it for the next choice", async () => {
    const h = harness({ background: { blurRadius: 6, imagePath: undefined }, touchUp: "smooth", lowLight: false })
    await h.t.init(io)
    await h.t.update({ background: null, touchUp: "smooth", lowLight: false })
    await h.send("d")
    expect(h.out.map((o) => o.id)).toEqual(["look(d)"])
    expect(h.made[0].transform).not.toHaveBeenCalled()
    await h.t.update({ background: { blurRadius: 6, imagePath: undefined }, touchUp: "smooth", lowLight: false })
    expect(h.made).toHaveLength(1)
    expect(h.made[0].update).toHaveBeenLastCalledWith({ blurRadius: 6, imagePath: undefined })
  })

  it("lets the camera through without the touch-up when its graphics are lost, says so once, and starts afresh when chosen again", async () => {
    const h = harness({ background: null, touchUp: "smooth", lowLight: true })
    await h.t.init(io)
    h.lose()
    await h.send("e")
    await h.send("f")
    // Low light needs no graphics, so it carries on.
    expect(h.out.map((o) => o.id)).toEqual(["light(e)", "light(f)"])
    expect(h.onLost).toHaveBeenCalledTimes(1)
    expect(h.passes[0].dispose).toHaveBeenCalled()
    await h.t.update({ background: null, touchUp: "subtle", lowLight: false })
    expect(h.passes).toHaveLength(2)
  })

  it("tells the call how long each frame takes from the next frame once the call takes over the green room's camera", async () => {
    // The green room made it with nothing to tell (useGreenRoomEffects has no strain watch).
    const h = harness({ background: null, touchUp: "off", lowLight: true }, { onFrame: undefined, onLost: undefined })
    await h.t.init(io)
    await h.send("a")
    const call = { frames: [] as number[], onLost: vi.fn() }
    h.t.setHooks({ onFrame: (ms) => call.frames.push(ms), onLost: call.onLost })
    await h.send("b")
    expect(call.frames).toHaveLength(1)
    // A background chosen later reports through the call too, with both costs.
    await h.t.update({ background: { blurRadius: 6, imagePath: undefined }, touchUp: "smooth", lowLight: true })
    await h.send("c")
    expect(call.frames).toHaveLength(2)
    expect(call.frames[1]).toBeGreaterThanOrEqual(7)
    h.lose()
    await h.send("d")
    expect(call.onLost).toHaveBeenCalledTimes(1)
  })

  it("never tells the hooks it was made with again once it is handed new ones", async () => {
    const h = harness({ background: { blurRadius: 6, imagePath: undefined }, touchUp: "smooth", lowLight: false })
    await h.t.init(io)
    const call = { frames: [] as number[], onLost: vi.fn() }
    h.t.setHooks({ onFrame: (ms) => call.frames.push(ms), onLost: call.onLost })
    await h.send("a")
    await h.t.update({ background: null, touchUp: "smooth", lowLight: false })
    await h.send("b")
    h.lose()
    await h.send("c")
    expect(call.frames).toHaveLength(3)
    expect(h.heard).toEqual([])
    expect(call.onLost).toHaveBeenCalledTimes(1)
    expect(h.onLost).not.toHaveBeenCalled()
  })

  it("lets go of the pass and the background when the camera stops", async () => {
    const h = harness({ background: { blurRadius: 6, imagePath: undefined }, touchUp: "smooth", lowLight: false })
    await h.t.init(io)
    await h.t.destroy({ willProcessorRestart: false })
    expect(h.passes[0].dispose).toHaveBeenCalled()
    expect(h.made[0].destroy).toHaveBeenCalled()
  })
})
