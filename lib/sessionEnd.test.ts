import { afterEach, describe, expect, it } from "vitest"
import { SESSION_ENDED_KEY, endSession, onSessionEnd, onSessionEndedElsewhere } from "./sessionEnd"

describe("endSession", () => {
  it("runs every registered forgetter, including ones that wait", async () => {
    const dropped: string[] = []
    const offA = onSessionEnd(() => void dropped.push("a"))
    const offB = onSessionEnd(async () => {
      await new Promise((r) => setTimeout(r, 5))
      dropped.push("b")
    })
    await endSession()
    expect(dropped.sort()).toEqual(["a", "b"])
    offA()
    offB()
  })

  it("keeps going when one forgetter fails", async () => {
    const dropped: string[] = []
    const offA = onSessionEnd(() => {
      throw new Error("broken")
    })
    const offB = onSessionEnd(async () => Promise.reject(new Error("also broken")))
    const offC = onSessionEnd(() => void dropped.push("c"))
    await expect(endSession()).resolves.toBeUndefined()
    expect(dropped).toEqual(["c"])
    offA()
    offB()
    offC()
  })

  it("stops calling a forgetter once it is unregistered", async () => {
    let calls = 0
    const off = onSessionEnd(() => void calls++)
    off()
    await endSession()
    expect(calls).toBe(0)
  })
})

describe("a session ending in another tab", () => {
  afterEach(() => localStorage.clear())

  // What another tab's endSession reaches this one as: a storage event, which
  // the tab that wrote the key never gets.
  const endedElsewhere = (newValue: string | null = "1", key: string | null = SESSION_ENDED_KEY) =>
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }))
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it("is told: ending a session writes a new signal every time", async () => {
    await endSession()
    const first = localStorage.getItem(SESSION_ENDED_KEY)
    expect(first).toBeTruthy()
    await endSession()
    expect(localStorage.getItem(SESSION_ENDED_KEY)).not.toBe(first)
  })

  it("lets go of the member's things here, then leaves", async () => {
    const order: string[] = []
    const offForget = onSessionEnd(async () => {
      await new Promise((r) => setTimeout(r, 5))
      order.push("forgot")
    })
    const offLeave = onSessionEndedElsewhere(() => void order.push("left"))
    endedElsewhere()
    await new Promise((r) => setTimeout(r, 20))
    expect(order).toEqual(["forgot", "left"])
    offForget()
    offLeave()
  })

  it("is not read from another key, or from the signal being cleared away", async () => {
    let forgot = 0
    let left = 0
    const offForget = onSessionEnd(() => void forgot++)
    const offLeave = onSessionEndedElsewhere(() => void left++)
    endedElsewhere("1", "ui-theme")
    endedElsewhere(null)
    endedElsewhere(null, null) // localStorage.clear() in another tab
    await settle()
    expect([forgot, left]).toEqual([0, 0])
    offForget()
    offLeave()
  })

  it("leaves even when one way of leaving fails", async () => {
    let left = 0
    const offA = onSessionEndedElsewhere(() => {
      throw new Error("broken")
    })
    const offB = onSessionEndedElsewhere(() => void left++)
    endedElsewhere()
    await settle()
    expect(left).toBe(1)
    offA()
    offB()
  })
})
