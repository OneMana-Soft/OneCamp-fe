import { describe, expect, it } from "vitest"
import { shareCapture } from "./shareCapture"

// restrictOwnAudio is newer than TypeScript's DOM types.
const canLeaveOwnSoundOut = { restrictOwnAudio: true } as MediaTrackSupportedConstraints

describe("shareCapture (meet-14: a share carries its sound, never the call's own)", () => {
  it("asks for the shared tab's sound, and never offers the call's own tab", () => {
    const c = shareCapture({})
    expect(c.audio).toBeTruthy()
    expect(c).toMatchObject({ selfBrowserSurface: "exclude", surfaceSwitching: "include" })
  })

  it("asks the browser to leave the call's own sound, everyone's voices, out of what it captures", () => {
    expect(shareCapture(canLeaveOwnSoundOut).audio).toEqual({ restrictOwnAudio: true })
    expect(shareCapture({}).audio).toEqual({ restrictOwnAudio: true })
  })

  it("offers a whole screen's sound only where the browser can leave the call's own sound out, so a share never echoes the call", () => {
    expect(shareCapture(canLeaveOwnSoundOut).systemAudio).toBe("include")
    expect(shareCapture({}).systemAudio).toBe("exclude")
    expect(shareCapture({ restrictOwnAudio: false } as MediaTrackSupportedConstraints).systemAudio).toBe("exclude")
    // Outside a browser, or in one without media devices (this test's), there is nothing to leave out with.
    expect(shareCapture().systemAudio).toBe("exclude")
  })

  it("gives each share its own options, as LiveKit writes its default resolution into the ones it's given", () => {
    const first = shareCapture({}) as { resolution?: unknown }
    first.resolution = { width: 1920, height: 1080, frameRate: 30 }
    expect(shareCapture({})).not.toHaveProperty("resolution")
  })
})
