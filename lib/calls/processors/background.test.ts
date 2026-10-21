import { afterEach, describe, expect, it, vi } from "vitest"

// A camera's background, cut out on this device from this server's files,
// switched in place, and taken off without touching anyone else's processor.

let supported = true
const built: { options: Record<string, unknown>; name: string; switched: unknown[] }[] = []
vi.mock("@livekit/track-processors", () => ({
  supportsBackgroundProcessors: () => supported,
  BackgroundProcessor: (options: Record<string, unknown>, name: string) => {
    const p = { name, options, switched: [] as unknown[], switchTo: vi.fn(async (o: unknown) => void p.switched.push(o)), init: vi.fn(), restart: vi.fn(), destroy: vi.fn() }
    built.push(p)
    return p
  },
}))
vi.mock("./backdrops", () => ({ backdropUrl: vi.fn(async (id: string) => `blob:backdrop-${id}`) }))

const { applyBackground, backgroundUnavailable } = await import("./background")
const { SEGMENTER_MODEL, VISION_FILESET } = await import("./assets")

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
  supported = true
})

describe("a camera's background", () => {
  it("is cut out with this server's model and WebAssembly, never MediaPipe's CDN", async () => {
    const t = camera()
    await applyBackground(t as never, { kind: "blur", strength: "strong" }, noPicture)
    expect(t.setProcessor).toHaveBeenCalledTimes(1)
    expect(built[0].options).toMatchObject({ mode: "background-blur", blurRadius: 18, assetPaths: { tasksVisionFileSet: VISION_FILESET, modelAssetPath: SEGMENTER_MODEL } })
  })

  it("switches in place to another choice, so the room never shows between", async () => {
    const t = camera()
    await applyBackground(t as never, { kind: "blur", strength: "light" }, noPicture)
    await applyBackground(t as never, { kind: "backdrop", id: "lake" }, noPicture)
    expect(t.setProcessor).toHaveBeenCalledTimes(1)
    expect(built[0].switched).toEqual([{ mode: "virtual-background", imagePath: "blob:backdrop-lake" }])
  })

  it("puts one's own picture behind, or says it has gone", async () => {
    const t = camera()
    await applyBackground(t as never, { kind: "picture" }, { picture: () => "data:image/jpeg;base64,AAAA" })
    expect(built[0].options).toMatchObject({ mode: "virtual-background", imagePath: "data:image/jpeg;base64,AAAA" })
    await expect(applyBackground(camera() as never, { kind: "picture" }, noPicture)).rejects.toThrow("no longer on this device")
  })

  it("comes off when none is chosen, and leaves anyone else's processor alone", async () => {
    const t = camera()
    await applyBackground(t as never, { kind: "blur", strength: "light" }, noPicture)
    await applyBackground(t as never, { kind: "none" }, noPicture)
    expect(t.stopProcessor).toHaveBeenCalledTimes(1)
    const other = camera()
    other.set({ name: "someone-elses" })
    await applyBackground(other as never, { kind: "none" }, noPicture)
    expect(other.stopProcessor).not.toHaveBeenCalled()
  })

  it("says, in words, where the browser can't do it", async () => {
    supported = false
    expect(await backgroundUnavailable()).toContain("This browser can't change your background")
    await expect(applyBackground(camera() as never, { kind: "blur", strength: "light" }, noPicture)).rejects.toThrow("can't change your background")
    supported = true
    expect(await backgroundUnavailable()).toBeNull()
  })
})
