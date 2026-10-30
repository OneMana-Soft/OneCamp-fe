import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeMedia, fakeTrack } from "@/lib/testing/fakeMedia"
import { mediaAsker } from "./askTogether"

const failure = (name: string) => new DOMException(name, name)
const kindsOf = (asked: ReturnType<typeof fakeMedia>) => asked.mock.calls.map(([c]) => ["audio", "video"].filter((k) => !!c?.[k as "audio" | "video"]).join("+"))

let permissions: Record<string, PermissionState>

beforeEach(() => {
  permissions = {}
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn(async ({ name }: { name: string }) => ({ state: permissions[name] ?? "prompt" })) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("mediaAsker", () => {
  it("asks once for the kinds asked for in one moment, and answers each with its own track", async () => {
    const asked = fakeMedia("tracks")
    const ask = mediaAsker()
    const [camera, mic] = await Promise.all([ask("video", { width: 1280, height: 720 }), ask("audio", true)])
    expect(kindsOf(asked)).toEqual(["audio+video"])
    expect(asked.mock.calls[0][0]).toEqual({ video: { width: 1280, height: 720 }, audio: true })
    expect([camera.kind, mic.kind]).toEqual(["video", "audio"])
  })

  it("asks again, alone, for a kind asked for later", async () => {
    const asked = fakeMedia("tracks")
    const ask = mediaAsker()
    await Promise.all([ask("video", true), ask("audio", true)])
    await ask("video", { deviceId: { ideal: "cam-2" } })
    expect(kindsOf(asked)).toEqual(["audio+video", "video"])
  })

  it("leaves the camera on when the microphone is missing: the failed request is asked again kind by kind", async () => {
    const asked = fakeMedia("tracks")
    asked.mockImplementationOnce(() => Promise.reject(failure("NotFoundError")))
    asked.mockImplementationOnce(() => Promise.resolve(new MediaStream([fakeTrack("video")])))
    asked.mockImplementationOnce(() => Promise.reject(failure("NotFoundError")))
    const ask = mediaAsker()
    const [camera, mic] = await Promise.allSettled([ask("video", true), ask("audio", true)])
    expect(kindsOf(asked)).toEqual(["audio+video", "video", "audio"])
    expect(camera.status).toBe("fulfilled")
    expect(mic).toMatchObject({ status: "rejected", reason: { name: "NotFoundError" } })
  })

  it("asks nothing again when the prompt was answered no: both kinds are refused", async () => {
    const asked = fakeMedia("tracks")
    asked.mockImplementationOnce(() => Promise.reject(failure("NotAllowedError")))
    const ask = mediaAsker()
    const answers = await Promise.allSettled([ask("video", true), ask("audio", true)])
    expect(kindsOf(asked)).toEqual(["audio+video"])
    expect(answers.map((a) => a.status === "rejected" && (a.reason as DOMException).name)).toEqual(["NotAllowedError", "NotAllowedError"])
  })

  it("doesn't ask for a kind this site may not use, so the other opens alone and nothing prompts again", async () => {
    permissions.microphone = "denied"
    const asked = fakeMedia("tracks")
    const ask = mediaAsker()
    const [camera, mic] = await Promise.allSettled([ask("video", true), ask("audio", true)])
    expect(kindsOf(asked)).toEqual(["video"])
    expect(camera.status).toBe("fulfilled")
    expect(mic).toMatchObject({ status: "rejected", reason: { name: "NotAllowedError" } })
  })

  it("asks as before where the browser can't say what it allows", async () => {
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: vi.fn(async () => Promise.reject(new TypeError("camera"))) } })
    const asked = fakeMedia("tracks")
    await Promise.all([mediaAsker()("video", true)])
    expect(kindsOf(asked)).toEqual(["video"])
  })

  it("answers a kind asked for twice in one moment with its last ask, and aborts the first", async () => {
    const asked = fakeMedia("tracks")
    const ask = mediaAsker()
    const first = ask("video", { deviceId: { ideal: "cam-1" } })
    const last = ask("video", { deviceId: { ideal: "cam-2" } })
    await expect(first).rejects.toMatchObject({ name: "AbortError" })
    await expect(last).resolves.toMatchObject({ kind: "video" })
    expect(asked.mock.calls.map(([c]) => c)).toEqual([{ video: { deviceId: { ideal: "cam-2" } } }])
  })

  it("refuses where the browser can't open a camera or microphone at all", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined })
    await expect(mediaAsker()("video", true)).rejects.toMatchObject({ name: "NotSupportedError" })
  })
})
