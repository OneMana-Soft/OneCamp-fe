import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SCREENS, putOnScreen, type Screen } from "@/lib/testing/screens"

// The keys tip's code comes only when the tip may show: once per browser, on
// a computer, once the first screen has settled. It rose 6 s in from a chunk
// every visit fetched, though nearly every visit had seen it already.

const { fetched } = vi.hoisted(() => ({ fetched: { count: 0 } }))
vi.mock("./KeyboardTip", () => {
  fetched.count++
  return { KeyboardTip: ({ showAfterMs }: { showAfterMs: number }) => <p data-keys-tip={showAfterMs}>tip</p> }
})

let offScreen = () => {}
const on = (s: Screen) => {
  offScreen()
  offScreen = putOnScreen(s)
}

let KeysTipLoader: typeof import("./KeysTipLoader").KeysTipLoader
let SETTLE_MS: number
let QUIET_MS: number
let SHOW_AFTER_MS: number

beforeEach(async () => {
  localStorage.clear()
  on(SCREENS["a computer"])
  fetched.count = 0
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] })
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0) as unknown as number)
  vi.stubGlobal("cancelIdleCallback", (id: number) => clearTimeout(id))
  vi.resetModules()
  ;({ KeysTipLoader } = await import("./KeysTipLoader"))
  ;({ SETTLE_MS, QUIET_MS } = await import("@/lib/ui/whenQuiet"))
  ;({ SHOW_AFTER_MS } = await import("./keysTip"))
})
afterEach(() => {
  cleanup()
  offScreen()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const tip = () => document.querySelector("[data-keys-tip]")

describe("the keys tip's loader", () => {
  it("fetches nothing for a browser that has had the tip", async () => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    render(<KeysTipLoader />)
    await pass(SETTLE_MS + QUIET_MS + 10_000)
    expect(fetched.count).toBe(0)
    expect(tip()).toBeNull()
  })

  it("fetches nothing on a phone", async () => {
    on(SCREENS["a phone in portrait"])
    render(<KeysTipLoader />)
    await pass(SETTLE_MS + QUIET_MS + 10_000)
    expect(fetched.count).toBe(0)
  })

  it("fetches the tip once the first screen has settled, to rise 6 s into the visit", async () => {
    render(<KeysTipLoader />)
    await pass(SETTLE_MS - 100)
    expect(fetched.count).toBe(0)
    await pass(QUIET_MS + 200)
    expect(fetched.count).toBe(1)
    // Its own wait is what is left of the 6 s, or none.
    expect(Number(tip()?.getAttribute("data-keys-tip"))).toBe(Math.max(0, SHOW_AFTER_MS - (SETTLE_MS + QUIET_MS)))
  })

  it("never comes once the keys were pressed before it", async () => {
    render(<KeysTipLoader />)
    await pass(1000)
    fireEvent.keyDown(document, { key: "k", metaKey: true })
    await pass(SETTLE_MS + QUIET_MS + 10_000)
    expect(fetched.count).toBe(0)
    expect(localStorage.getItem("oc_keys_tip_seen")).toBe("1")
    expect(screen.queryByText("tip")).toBeNull()
  })
})
