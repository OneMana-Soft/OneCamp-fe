import { describe, expect, it } from "vitest"
import { nearEnd } from "./scrollEnd"

describe("a list near its end", () => {
  it("follows what comes in within its reach of the end, and not from further up", () => {
    const list = (scrollTop: number) => ({ scrollTop, scrollHeight: 1_000, clientHeight: 400 })
    expect(nearEnd(list(600), 80)).toBe(true)
    expect(nearEnd(list(521), 80)).toBe(true)
    expect(nearEnd(list(520), 80)).toBe(false)
    expect(nearEnd(list(560), 48)).toBe(true)
    expect(nearEnd(list(552), 48)).toBe(false)
  })
})
