import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

// The list as read: one agent. A bot that isn't in it (an agent's first post
// came after the read) makes the list be read again, once.
const mutate = vi.fn()
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { data: url ? { data: { captain: "agent" } } : undefined, mutate }
  },
}))
const { useBotKind } = await import("@/hooks/useBotKinds")

describe("useBotKind", () => {
  afterEach(() => {
    cleanup()
    mutate.mockClear()
    asked.length = 0
  })

  it("answers a known bot's kind without reading again", () => {
    const { result } = renderHook(() => useBotKind("captain", true))
    expect(result.current).toBe("agent")
    expect(mutate).not.toHaveBeenCalled()
  })

  it("asks nothing for a person", () => {
    const { result } = renderHook(() => useBotKind("maya", false))
    expect(result.current).toBeUndefined()
    expect(asked.every((u) => u === "")).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("reads the list again once for a bot it doesn't know, however often it draws", () => {
    const a = renderHook(() => useBotKind("newcomer", true))
    a.rerender()
    renderHook(() => useBotKind("newcomer", true))
    expect(a.result.current).toBeUndefined()
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
