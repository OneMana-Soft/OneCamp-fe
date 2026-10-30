import { act, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as WhenQuiet from "./whenQuiet"

// Each test takes the module afresh: the fake clock starts again at every
// test, and the last press or scroll another test left must not count.
let runWhenQuiet: typeof WhenQuiet.runWhenQuiet
let runWhenSettled: typeof WhenQuiet.runWhenSettled
let QUIET_MS: number
let SETTLE_MS: number

// Work the page can put off (a preload) waits for a quiet spell, then runs one
// task per idle moment. The right panel's preload, started by the first key,
// fetched and ran 820 KB of code in the middle of the calendar's open: long
// frames of 129-164 ms, and the open 100 ms slower (FLUIDITY-LEAD, 20 Oct 2026).

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] })
  // An idle moment comes as soon as the timers let it.
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0) as unknown as number)
  vi.stubGlobal("cancelIdleCallback", (id: number) => clearTimeout(id))
  vi.resetModules()
  ;({ runWhenQuiet, runWhenSettled, QUIET_MS, SETTLE_MS } = await import("./whenQuiet"))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
})

/** Lets `ms` pass, settling the promises a task hands back on the way. */
async function pass(ms: number) {
  for (let left = ms; left > 0; left -= 10) await act(async () => void vi.advanceTimersByTime(Math.min(10, left)))
}

/** Three tasks that say when they ran; `first` runs inside the first. */
function tasks(first: () => void = () => {}) {
  const ran: string[] = []
  const list = ["task", "event", "thread"].map((name, i) => () => {
    ran.push(name)
    if (i === 0) first()
    return Promise.resolve()
  })
  return { ran, list }
}

describe("work put off until the page is quiet", () => {
  it("waits a quiet spell from the press that started it, then runs each task in an idle moment of its own", async () => {
    const { ran, list } = tasks()
    fireEvent.keyDown(window, { key: "g" })
    runWhenQuiet(list)
    await pass(QUIET_MS - 20)
    expect(ran).toEqual([])
    await pass(60)
    expect(ran.length).toBeGreaterThan(0)
    await pass(100)
    expect(ran).toEqual(["task", "event", "thread"])
  })

  it("starts the spell again at every press or key while it waits", async () => {
    const { ran, list } = tasks()
    runWhenQuiet(list)
    await pass(QUIET_MS / 2)
    fireEvent.keyDown(window, { key: "k" })
    await pass(QUIET_MS - 20)
    expect(ran).toEqual([])
    await pass(150)
    expect(ran).toEqual(["task", "event", "thread"])
  })

  it("puts the rest off when someone presses between two tasks, and waits out a scroll", async () => {
    const pressed = tasks(() => fireEvent.pointerDown(window))
    runWhenQuiet(pressed.list)
    await pass(QUIET_MS + 20)
    expect(pressed.ran).toEqual(["task"])
    await pass(QUIET_MS - 60)
    expect(pressed.ran).toEqual(["task"])
    await pass(150)
    expect(pressed.ran).toEqual(["task", "event", "thread"])

    const scrolled = tasks()
    runWhenQuiet(scrolled.list)
    const list = document.body.appendChild(document.createElement("div"))
    // A list scrolling somewhere in the page, past the spell.
    for (let t = 0; t < QUIET_MS + 400; t += 40) {
      list.dispatchEvent(new Event("scroll"))
      await pass(40)
    }
    expect(scrolled.ran).toEqual([])
    await pass(300)
    expect(scrolled.ran).toEqual(["task", "event", "thread"])
  })

  it("keeps going past a task that fails, and stops when cancelled", async () => {
    const ran: string[] = []
    runWhenQuiet([
      () => Promise.reject(new Error("offline")),
      () => {
        throw new Error("no chunk")
      },
      () => void ran.push("third"),
    ])
    await pass(QUIET_MS + 100)
    expect(ran).toEqual(["third"])

    const halfway: string[] = []
    const stop = runWhenQuiet([
      () => {
        halfway.push("first")
        stop()
      },
      () => void halfway.push("second"),
    ])
    await pass(QUIET_MS * 2)
    expect(halfway).toEqual(["first"])

    const { ran: none, list } = tasks()
    const cancel = runWhenQuiet(list)
    cancel()
    await pass(QUIET_MS * 2)
    expect(none).toEqual([])
  })
})

// Work for after the first screen has settled (web push's SDK, 21 Oct 2026):
// it came at 2-3 s, inside a phone's first screen at 4x (fluid-15).
describe("work put off until the first screen has settled", () => {
  it("waits SETTLE_MS, then a quiet spell, then runs", async () => {
    const { ran, list } = tasks()
    runWhenSettled(list.slice(0, 1))
    await pass(SETTLE_MS - 20)
    expect(ran).toEqual([])
    // Settled, and a key half a second later: the quiet spell starts again from it.
    await pass(520)
    fireEvent.keyDown(window, { key: "j" })
    await pass(QUIET_MS - 20)
    expect(ran).toEqual([])
    await pass(100)
    expect(ran).toEqual(["task"])
  })

  it("runs nothing once cancelled, before or during its wait for quiet", async () => {
    const { ran, list } = tasks()
    runWhenSettled(list)()
    await pass(SETTLE_MS + QUIET_MS + 100)
    expect(ran).toEqual([])
    const cancel = runWhenSettled(list)
    await pass(SETTLE_MS + 10)
    cancel()
    await pass(QUIET_MS + 100)
    expect(ran).toEqual([])
  })
})
