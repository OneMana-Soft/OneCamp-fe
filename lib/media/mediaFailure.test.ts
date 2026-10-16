// One set of words for a device the browser refused (calls audit).
import { describe, expect, it } from "vitest"
import { SCREEN_UNAVAILABLE, mediaFailure, mediaFailureKind } from "./mediaFailure"

const err = (name: string, message = "") => Object.assign(new Error(message), { name })

describe("mediaFailure", () => {
  it("names a refusal, a missing device and a busy one", () => {
    expect(mediaFailure("microphone", err("NotAllowedError"))?.title).toBe("Your browser blocked the microphone")
    expect(mediaFailure("camera", err("NotFoundError"))?.title).toBe("No camera was found")
    expect(mediaFailure("camera", err("NotReadableError"))?.title).toBe("Your camera is in use")
  })

  it("says nothing for a closed screen picker, and why a screen can't be shared", () => {
    expect(mediaFailure("screen", err("NotAllowedError", "Permission denied"))).toBeNull()
    expect(mediaFailure("screen", err("NotFoundError"))?.title).toBe(SCREEN_UNAVAILABLE)
    expect(mediaFailure("screen", err("OverconstrainedError"))?.title).toBe("Screen sharing isn't available on this computer")
  })
})

describe("mediaFailureKind", () => {
  it("sorts a refusal by the browser's name for it, for a page that offers its own way out", () => {
    for (const name of ["NotAllowedError", "PermissionDeniedError", "SecurityError"]) expect(mediaFailureKind(err(name))).toBe("denied")
    for (const name of ["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"]) expect(mediaFailureKind(err(name))).toBe("missing")
    for (const name of ["NotReadableError", "TrackStartError"]) expect(mediaFailureKind(err(name))).toBe("busy")
    expect(mediaFailureKind(err("AbortError"))).toBe("other")
    expect(mediaFailureKind(null)).toBe("other")
  })

  it("points to a device menu only where there is one", () => {
    expect(mediaFailure("camera", err("NotFoundError"))?.description).toMatch(/menu beside the button/)
    expect(mediaFailure("camera", err("NotFoundError"), { deviceMenu: false })?.description).toBe("Connect a camera, then try again.")
    expect(mediaFailure("microphone", err("AbortError"), { deviceMenu: false })?.description).toBe("Try again in a moment.")
  })
})
