// One set of words for a device the browser refused (calls audit).
import { describe, expect, it } from "vitest"
import { SCREEN_UNAVAILABLE, mediaFailure } from "./mediaFailure"

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
