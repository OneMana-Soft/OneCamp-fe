import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

import { toast, useToast } from "@/hooks/use-toast"
import { READ_FAILURE_BEAT_MS, tellReadFailure, useSaysLoadFailure } from "@/lib/http/loadFailure"

// A doc moved to the trash from its page takes the person to the docs home,
// with "Moved … to the trash" and its Undo. When that home's reads fail (a
// connection that drops), their toasts and its error state come after it:
// none of them may take the Undo away (pageChrome N32 lost it once, in a
// test whose home was left unanswered).

const failed = (url: string) => ({ config: { url, method: "get" }, response: { status: 503, data: { msg: `${url} is resting.` } } })

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-16T12:00:00Z") }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("an Undo toast, when the next page's reads fail", () => {
  it("stays open through their toasts and the error state that comes late", () => {
    const { result } = renderHook(() => useToast())
    act(() => void toast({ title: "Moved “Launch notes” to the trash", action: <button type="button">Undo</button> }))
    // The home's reads fail one by one, each said in a toast of its own.
    for (const url of ["/doc/list", "/doc/children", "/places", "/doc/trash"]) {
      act(() => tellReadFailure(failed(url)))
      act(() => void vi.advanceTimersByTime(READ_FAILURE_BEAT_MS + 1))
    }
    // The home's own error state, drawn late, takes back the last read's toast.
    renderHook(() => useSaysLoadFailure())
    const undo = result.current.toasts.find((t) => t.title === "Moved “Launch notes” to the trash")
    expect(undo?.open).not.toBe(false)
    expect(result.current.toasts.filter((t) => t.open !== false).length).toBeLessThanOrEqual(3)
  })
})
