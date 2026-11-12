import { describe, expect, it } from "vitest"
import { TOUCH_UP_STRENGTH } from "./look"

// Touch-up (meet-09): the numbers behind it, read without a browser. The
// drawing itself is WebGL, met by e2e/callLook.spec.ts. Low light: lowLight.test.ts.

describe("a touch-up", () => {
  it("blends in more of the smoothed skin at each level, and none when off", () => {
    expect(TOUCH_UP_STRENGTH.off).toBe(0)
    expect(TOUCH_UP_STRENGTH.subtle).toBeGreaterThan(0)
    expect(TOUCH_UP_STRENGTH.smooth).toBeGreaterThan(TOUCH_UP_STRENGTH.subtle)
    expect(TOUCH_UP_STRENGTH.smooth).toBeLessThanOrEqual(1)
  })
})
