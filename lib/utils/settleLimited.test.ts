import { describe, expect, it } from "vitest"
import { settleLimited } from "./settleLimited"

describe("settleLimited", () => {
  it("runs everything, never more than the limit at once, and keeps the order", async () => {
    let running = 0
    let most = 0
    const out = await settleLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++
      most = Math.max(most, running)
      await new Promise((r) => setTimeout(r, 5 * (8 - n)))
      running--
      if (n === 4) throw new Error("four")
      return n * 10
    })
    expect(most).toBe(3)
    expect(out.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([10, 20, 30, "x", 50, 60, 70])
  })
  it("is fine with nothing to do", async () => {
    expect(await settleLimited([], 4, async () => 1)).toEqual([])
  })
})
