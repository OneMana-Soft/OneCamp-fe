import { describe, expect, it } from "vitest"
import { seatWords } from "./seatWords"

describe("the seat meter's words", () => {
  it("says how many are used, and from 90 % how many places are left", () => {
    expect(seatWords(14, 25)).toEqual({ words: "14 of 25", near: false, ratio: 14 / 25 })
    expect(seatWords(23, 25)).toMatchObject({ words: "2 places left", near: true })
    expect(seatWords(24, 25).words).toBe("1 place left")
    expect(seatWords(25, 25).words).toBe("No places left")
    expect(seatWords(30, 25)).toMatchObject({ words: "No places left", ratio: 1 })
    expect(seatWords(3, 0).ratio).toBe(0)
  })
})
