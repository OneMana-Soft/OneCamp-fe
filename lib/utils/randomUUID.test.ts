import { afterEach, describe, expect, it, vi } from "vitest"

import { randomUUID } from "@/lib/utils/randomUUID"

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe("a random id", () => {
  it("is a version 4 UUID, its own each time, with every variant digit", () => {
    const ids = Array.from({ length: 2000 }, randomUUID)
    for (const id of ids) expect(id).toMatch(V4)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids.map((id) => id[19]))).toEqual(new Set(["8", "9", "a", "b"]))
  })

  it("comes where the browser has no crypto.randomUUID (an install served over plain http)", () => {
    const real = globalThis.crypto
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) })
    expect(randomUUID()).toMatch(V4)
  })
})
