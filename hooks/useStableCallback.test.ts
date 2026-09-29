import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { useStableCallback } from "./useStableCallback"

describe("useStableCallback", () => {
  it("keeps one identity and calls the latest function", () => {
    const { result, rerender } = renderHook(({ n }) => useStableCallback((x: number) => x + n), { initialProps: { n: 1 } })
    const first = result.current
    expect(first(1)).toBe(2)
    rerender({ n: 10 })
    expect(result.current).toBe(first)
    expect(first(1)).toBe(11)
  })
})
