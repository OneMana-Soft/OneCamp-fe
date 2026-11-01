import { describe, expect, it } from "vitest"
import { warmBeforeTests } from "@/lib/testing/lazyCode"

// V-138: a file's cold code is warmed before its tests, never inside one, so a busy machine's slow first import counts
// against no test's 5 s (cardsUnderMessage's doc card and profilePage's sections timed out warming inside their first
// test at load 92). This warm-up takes 6 s on purpose: longer than any test's whole budget.
const realTimeout = globalThis.setTimeout
let warmed = false
warmBeforeTests(() => new Promise<void>((resolve) => realTimeout(() => resolve(void (warmed = true)), 6000)))

// One after another: vitest's mocker can't take concurrent import()s of mocked modules. Warmed with the rest at once,
// boardWorkbench's stand-in drawing library came back as the real one, and its export tests met that instead.
const order: string[] = []
warmBeforeTests(
  async () => {
    order.push("first starts")
    await new Promise<void>((resolve) => realTimeout(resolve, 50))
    order.push("first ends")
  },
  async () => void order.push("second starts"),
)

describe("a file's warm-ups", () => {
  it("are done before its first test, outside that test's budget", () => {
    expect(warmed).toBe(true)
  })

  it("load one after another, never at once", () => {
    expect(order).toEqual(["first starts", "first ends", "second starts"])
  })
})
