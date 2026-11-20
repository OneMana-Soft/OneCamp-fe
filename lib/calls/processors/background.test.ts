import { afterEach, describe, expect, it, vi } from "vitest"

// A camera's look, on this device from this server's files, as one
// processor changed in place, and taken off without touching anyone else's.

let supported = true
const built: { name: string; updates: unknown[] }[] = []
const made: { options: Record<string, unknown>; hooks: Record<string, unknown>; handed: unknown[] }[] = []
vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: () => supported,
  ProcessorWrapper: class {
    updates: unknown[] = []
    updateTransformerOptions = vi.fn(async (o: unknown) => void this.updates.push(o))
    constructor(
      readonly transformer: unknown,
      readonly name: string,
    ) {
      built.push(this)
    }
  },
}))
vi.mock("./cameraTransformer", () => ({
  CameraTransformer: class {
    private handed: unknown[] = []
    setHooks = vi.fn((h: unknown) => void this.handed.push(h))
    constructor(_lib: unknown, options: Record<string, unknown>, hooks: Record<string, unknown>) {
      made.push({ options, hooks, handed: this.handed })
    }
  },
}))
vi.mock("./backdrops", () => ({ backdropUrl: vi.fn(async (id: string) => `blob:backdrop-${id}`) }))

const { applyCamera, backgroundUnavailable } = await import("./background")
const { SEGMENTER_MODEL, VISION_FILESET } = await import("./assets")
const { NO_EFFECTS, lookOf } = await import("./effects")
type Background = import("./effects").Background

/** A look with this background and nothing else. */
const only = (background: Background) => lookOf({ ...NO_EFFECTS, background })

const camera = () => {
  let processor: { name: string } | undefined
  return {
    getProcessor: () => processor,
    setProcessor: vi.fn(async (p: { name: string }) => void (processor = p)),
    stopProcessor: vi.fn(async () => void (processor = undefined)),
    set: (p: { name: string }) => void (processor = p),
  }
}
const noPicture = { picture: () => null }

afterEach(() => {
  built.length = 0
  made.length = 0
  supported = true
})

describe("a camera's look", () => {
  it("is cut out with this server's model and WebAssembly, never MediaPipe's CDN", async () => {
    const t = camera()
    await applyCamera(t as never, only({ kind: "blur", strength: "strong" }), noPicture)
    expect(t.setProcessor).toHaveBeenCalledTimes(1)
    expect(made[0].options).toEqual({ background: { blurRadius: 18, imagePath: undefined }, touchUp: "off", lowLight: false })
    expect(made[0].hooks).toMatchObject({ assetPaths: { tasksVisionFileSet: VISION_FILESET, modelAssetPath: SEGMENTER_MODEL } })
  })

  it("changes in place to another choice, so the room never shows between", async () => {
    const t = camera()
    await applyCamera(t as never, only({ kind: "blur", strength: "light" }), noPicture)
    await applyCamera(t as never, only({ kind: "backdrop", id: "lake" }), noPicture)
    await applyCamera(t as never, { background: { kind: "backdrop", id: "lake" }, touchUp: "smooth", lowLight: true }, noPicture)
    expect(t.setProcessor).toHaveBeenCalledTimes(1)
    expect(built[0].updates).toEqual([
      { background: { imagePath: "blob:backdrop-lake", blurRadius: undefined }, touchUp: "off", lowLight: false },
      { background: { imagePath: "blob:backdrop-lake", blurRadius: undefined }, touchUp: "smooth", lowLight: true },
    ])
  })

  it("hands the call's strain watch and lost graphics to the processor the green room made", async () => {
    const t = camera()
    const look = { background: { kind: "blur", strength: "strong" }, touchUp: "smooth", lowLight: true } as const
    // The green room puts it on with nothing to tell.
    await applyCamera(t as never, look, noPicture)
    expect(made[0].hooks.onFrame).toBeUndefined()
    // The call takes the same camera over.
    const onFrame = vi.fn()
    const onLost = vi.fn()
    await applyCamera(t as never, look, { ...noPicture, onFrame, onLost })
    expect(t.setProcessor).toHaveBeenCalledTimes(1)
    expect(made).toHaveLength(1)
    expect(made[0].handed).toEqual([{ onFrame, onLost }])
  })

  it("puts a touch-up and low light on with no background, as the same one processor", async () => {
    const t = camera()
    await applyCamera(t as never, { background: { kind: "none" }, touchUp: "subtle", lowLight: false }, noPicture)
    expect(made[0].options).toEqual({ background: null, touchUp: "subtle", lowLight: false })
    expect(t.setProcessor).toHaveBeenCalledTimes(1)
  })

  it("puts one's own picture behind, or says it has gone", async () => {
    const t = camera()
    await applyCamera(t as never, only({ kind: "picture" }), { picture: () => "data:image/jpeg;base64,AAAA" })
    expect(made[0].options).toMatchObject({ background: { imagePath: "data:image/jpeg;base64,AAAA" } })
    await expect(applyCamera(camera() as never, only({ kind: "picture" }), noPicture)).rejects.toThrow("no longer on this device")
  })

  it("puts a scene made from words behind, in place of the backdrop it had, from its own slot, or says it has gone", async () => {
    const t = camera()
    const kept = { picture: (slot?: string) => (slot === "scene" ? "data:image/jpeg;base64,SCENE" : "data:image/jpeg;base64,OWN") }
    await applyCamera(t as never, only({ kind: "backdrop", id: "lake" }), kept)
    await applyCamera(t as never, only({ kind: "scene", at: 1 }), kept)
    // Swapped in live: the camera's processor stays, so the room never shows between.
    expect(t.setProcessor).toHaveBeenCalledTimes(1)
    expect(built[0].updates).toEqual([{ background: { imagePath: "data:image/jpeg;base64,SCENE", blurRadius: undefined }, touchUp: "off", lowLight: false }])
    await expect(applyCamera(camera() as never, only({ kind: "scene" }), noPicture)).rejects.toThrow("Your scene is no longer on this device. Make it again.")
  })

  it("comes off when nothing is chosen, and leaves anyone else's processor alone", async () => {
    const t = camera()
    await applyCamera(t as never, only({ kind: "blur", strength: "light" }), noPicture)
    await applyCamera(t as never, only({ kind: "none" }), noPicture)
    expect(t.stopProcessor).toHaveBeenCalledTimes(1)
    const other = camera()
    other.set({ name: "someone-elses" })
    await applyCamera(other as never, only({ kind: "none" }), noPicture)
    expect(other.stopProcessor).not.toHaveBeenCalled()
  })

  it("says, in words, where the browser can't do it", async () => {
    supported = false
    expect(await backgroundUnavailable()).toContain("This browser can't change your background")
    await expect(applyCamera(camera() as never, only({ kind: "blur", strength: "light" }), noPicture)).rejects.toThrow("can't change your background")
    supported = true
    expect(await backgroundUnavailable()).toBeNull()
  })
})
