import { describe, expect, it, vi } from "vitest"
import { deviceSwitch, publishSwitch, publishedSwitch } from "./deviceSwitch"

/** A device whose switches land, or fail, when the test says, as a browser's permission prompt does. */
function slowDevice() {
  const asked: boolean[] = []
  const pending: Array<{ land: () => void; fail: (e: unknown) => void }> = []
  const set = (on: boolean) => {
    asked.push(on)
    return new Promise<void>((land, fail) => pending.push({ land, fail }))
  }
  return { asked, set, next: () => pending.shift()! }
}

describe("a call device's one switch (meet-18, CODE-REVIEWER-46 MF1)", () => {
  it("runs a close asked for while an open runs once the open has landed", async () => {
    const d = slowDevice()
    const sw = deviceSwitch(d.set, vi.fn())
    const opened = sw.to(true)
    const closed = sw.to(false)
    expect(d.asked).toEqual([true])
    d.next().land()
    expect(await opened).toBe(true)
    expect(d.asked).toEqual([true, false])
    d.next().land()
    expect(await closed).toBe(true)
    expect(sw.heading()).toBeUndefined()
  })

  it("runs only the last ask that waited, and the asks it replaced answer false", async () => {
    const d = slowDevice()
    const sw = deviceSwitch(d.set, vi.fn())
    const opened = sw.to(true)
    const closed = sw.to(false)
    const reopened = sw.to(true)
    expect(await closed).toBe(false)
    d.next().land()
    expect(await opened).toBe(true)
    expect(await reopened).toBe(true)
    // The reopen joined the open that was running: the browser was asked once.
    expect(d.asked).toEqual([true])
  })

  it("toggles from where the device is headed, so a second press turns it back", async () => {
    const d = slowDevice()
    const sw = deviceSwitch(d.set, vi.fn())
    expect(sw.heading()).toBeUndefined()
    const first = sw.toggle(false)
    expect(sw.heading()).toBe(true)
    // Still shown off while the browser asks: the press turns it back off.
    const second = sw.toggle(false)
    expect(sw.heading()).toBe(false)
    d.next().land()
    await first
    d.next().land()
    expect(await second).toBe(true)
    expect(d.asked).toEqual([true, false])
  })

  it("says why a switch failed once, and answers false to every ask it carried", async () => {
    const d = slowDevice()
    const failed = vi.fn()
    const sw = deviceSwitch(d.set, failed)
    const a = sw.to(true)
    const b = sw.to(true)
    const refused = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })
    d.next().fail(refused)
    expect(await a).toBe(false)
    expect(await b).toBe(false)
    expect(failed).toHaveBeenCalledTimes(1)
    expect(failed).toHaveBeenCalledWith(true, refused)
    expect(d.asked).toEqual([true])
    // Free again: the next ask runs.
    const again = sw.to(true)
    d.next().land()
    expect(await again).toBe(true)
  })
})

describe("a call's published switch (CODE-REVIEWER-48's should-fix, 26 Oct)", () => {
  const quiet = () => deviceSwitch(() => Promise.resolve(), vi.fn())

  it("is the dock's while it is up, for its room and device only, and gone once taken down", () => {
    const room = {}
    const sw = quiet()
    const down = publishSwitch(room, "microphone", sw)
    expect(publishedSwitch(room, "microphone")).toBe(sw)
    expect(publishedSwitch({}, "microphone")).toBeUndefined()
    expect(publishedSwitch(room, "camera")).toBeUndefined()
    down()
    expect(publishedSwitch(room, "microphone")).toBeUndefined()
  })

  it("keeps a newer dock's switch when an older dock goes after it came", () => {
    const room = {}
    const older = quiet()
    const newer = quiet()
    const downOlder = publishSwitch(room, "microphone", older)
    publishSwitch(room, "microphone", newer)
    downOlder()
    expect(publishedSwitch(room, "microphone")).toBe(newer)
  })
})
