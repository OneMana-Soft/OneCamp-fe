import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

// Keywords are marked only where the server tells them: a channel's own
// posts, never the reader's own, and nothing is read elsewhere.
const { asked } = vi.hoisted(() => ({ asked: [] as string[] }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return url ? { data: { data: ["budget"] } } : {}
  },
}))

import { useKeywordsFor } from "./useMyKeywords"

describe("useKeywordsFor", () => {
  it("marks the reader's keywords in a channel post from someone else, the marker loaded once they have some", async () => {
    const { result } = renderHook(() => useKeywordsFor(true, "u-maya", "u-me"))
    await waitFor(() => expect(result.current).toBeDefined())
    expect(result.current?.("<p>The budget</p>")).toBe('<p>The <mark class="keyword-hit">budget</mark></p>')
  })

  it("gives none to the reader's own post, or anything not a channel post, and reads nothing for them", () => {
    asked.length = 0
    expect(renderHook(() => useKeywordsFor(true, "u-me", "u-me")).result.current).toBeUndefined()
    expect(renderHook(() => useKeywordsFor(false, "u-maya", "u-me")).result.current).toBeUndefined()
    expect(asked.every((u) => u === "")).toBe(true)
  })
})
