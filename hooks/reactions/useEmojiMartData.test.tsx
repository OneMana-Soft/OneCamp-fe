import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

// The emoji catalogue is about 420 KB of script. The top bar and the sidebar
// asked for it to draw somebody's status emoji, unconditionally, so it loaded
// on every page ahead of Home's greeting, for people with no status at all.
// It loads when there is a status to draw.

let loads = 0
vi.mock("@emoji-mart/data", () => {
  loads++
  return { default: { emojis: {}, categories: [], aliases: {}, sheet: { cols: 0, rows: 0 } } }
})

import { useEmojiMartData } from "./useEmojiMartData"

describe("the emoji catalogue", () => {
  it("isn't loaded when nothing on the page needs it", async () => {
    const view = renderHook(() => useEmojiMartData(false))
    await new Promise((r) => setTimeout(r, 30))
    expect(loads).toBe(0)
    expect(view.result.current.data).toBeNull()
  })

  it("is loaded once something does, and shared from then on", async () => {
    const first = renderHook(() => useEmojiMartData())
    await waitFor(() => expect(first.result.current.data).not.toBeNull())
    const later = renderHook(() => useEmojiMartData(false))
    await waitFor(() => expect(later.result.current.data).not.toBeNull())
    expect(loads).toBe(1)
  })
})
