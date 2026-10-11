import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetRiseMemory, shouldRise } from "@/lib/hub/motion"
import { celebrateOnce } from "@/lib/celebrate"

function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }))
  window.matchMedia = globalThis.matchMedia
}

beforeEach(() => {
  resetRiseMemory()
  window.sessionStorage.clear()
  window.localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe("rise, once per route per session", () => {
  it("runs the first time, and never again for that route", () => {
    motion(false)
    expect(shouldRise("/app/home", 1000)).toBe(true)
    // React's strict double mount asks again at once and gets the same answer.
    expect(shouldRise("/app/home", 1100)).toBe(true)
    // Coming back to the route later does not re-perform.
    expect(shouldRise("/app/home", 9000)).toBe(false)
    expect(window.sessionStorage.getItem("rise:/app/home")).toBe("1")
  })

  it("does not run when the session has seen the route", () => {
    motion(false)
    window.sessionStorage.setItem("rise:/app/activity", "1")
    expect(shouldRise("/app/activity")).toBe(false)
  })

  it("never runs under reduced motion", () => {
    motion(true)
    expect(shouldRise("/app/search")).toBe(false)
  })
})

describe("celebrateOnce", () => {
  it("is spent for the day once it has fired, and is off under reduced motion", () => {
    motion(true)
    const el = document.createElement("div")
    expect(celebrateOnce("needs-me", el)).toBe(0)
    expect(window.localStorage.length).toBe(0)
    motion(false)
    const day = new Date(2026, 9, 11)
    celebrateOnce("needs-me", el, { now: day })
    expect(window.localStorage.getItem("celebrated:needs-me:2026-10-11")).toBe("1")
    expect(celebrateOnce("needs-me", el, { now: day })).toBe(0)
  })

  it("keeps a once-ever key without a date", () => {
    motion(false)
    celebrateOnce("prove-it", document.createElement("div"), { daily: false })
    expect(window.localStorage.getItem("celebrated:prove-it")).toBe("1")
  })
})
