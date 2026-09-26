import { describe, expect, it } from "vitest"
import { endSession, onSessionEnd } from "./sessionEnd"

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
