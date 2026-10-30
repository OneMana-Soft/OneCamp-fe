import { afterEach, describe, expect, it, vi } from "vitest"
import { FakeLocalVideoTrack, fakeMedia, fakeTrack } from "@/lib/testing/fakeMedia"
import { cameraConstraints } from "./greenRoomCamera"
import { liveKitCamera } from "./greenRoomLiveKit"

vi.mock("livekit-client", async () => ({
  LocalVideoTrack: (await import("@/lib/testing/fakeMedia")).FakeLocalVideoTrack,
  Track: { Source: { Camera: "camera" } },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the green room's camera, as LiveKit's", () => {
  it("hands LiveKit the same camera, as its own track, on the device the person allowed", () => {
    fakeMedia("tracks")
    const camera = fakeTrack("video")
    const track = liveKitCamera(camera, cameraConstraints("cam-2")) as unknown as FakeLocalVideoTrack
    expect(track.mediaStreamTrack).toBe(camera)
    // LiveKit's to stop and open again, as the cameras it opens itself.
    expect(track.userProvidedTrack).toBe(false)
    expect(track.constraints).toEqual({ deviceId: "video-device", width: 1280, height: 720 })
    expect(track.source).toBe("camera")
    expect(track.mediaStream?.getVideoTracks()).toEqual([camera])
  })
})
