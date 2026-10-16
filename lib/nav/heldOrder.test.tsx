import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { heldOrder, HOLD_RELEASE_MS, useHeldOrder } from "./heldOrder"

// F-17: the sidebar's DMs follow their latest message, and a row moved
// under the pointer while the person read or aimed at it.
type Row = { path: string }
const key = (r: Row) => r.path
const rows = (...paths: string[]) => paths.map((path) => ({ path }))
const paths = (rs: Row[]) => rs.map(key)

describe("an order held while it is in use", () => {
  it("keeps rows where they were shown, puts a new one last and drops a gone one", () => {
    expect(paths(heldOrder(rows("maya", "jonas", "sam"), key, ["sam", "maya", "jonas"]))).toEqual(["sam", "maya", "jonas"])
    expect(paths(heldOrder(rows("new", "maya", "jonas"), key, ["maya", "sam", "jonas"]))).toEqual(["maya", "jonas", "new"])
  })
})

describe("a list under the pointer", () => {
  afterEach(() => vi.useRealTimers())
  const fakeEvent = (inside = false) => ({ currentTarget: { contains: () => inside }, relatedTarget: null }) as unknown as React.FocusEvent

  it("never reorders while the pointer moves over it, and does once it leaves", () => {
    const { result, rerender } = renderHook(({ list }) => useHeldOrder(list, key), { initialProps: { list: rows("maya", "jonas") } })
    act(() => result.current.handlers.onPointerMove())
    rerender({ list: rows("jonas", "maya") }) // Jonas wrote: he moves up.
    expect(paths(result.current.rows)).toEqual(["maya", "jonas"])
    act(() => result.current.handlers.onPointerLeave())
    expect(paths(result.current.rows)).toEqual(["jonas", "maya"])
  })

  it("moves on once the pointer has rested a moment", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ list }) => useHeldOrder(list, key), { initialProps: { list: rows("maya", "jonas") } })
    act(() => result.current.handlers.onPointerMove())
    rerender({ list: rows("jonas", "maya") })
    expect(paths(result.current.rows)).toEqual(["maya", "jonas"])
    act(() => void vi.advanceTimersByTime(HOLD_RELEASE_MS))
    expect(paths(result.current.rows)).toEqual(["jonas", "maya"])
  })

  it("holds while focus is in it, for the keyboard", () => {
    const { result, rerender } = renderHook(({ list }) => useHeldOrder(list, key), { initialProps: { list: rows("maya", "jonas") } })
    act(() => result.current.handlers.onFocus())
    rerender({ list: rows("jonas", "maya") })
    expect(paths(result.current.rows)).toEqual(["maya", "jonas"])
    act(() => result.current.handlers.onBlur(fakeEvent(false)))
    expect(paths(result.current.rows)).toEqual(["jonas", "maya"])
  })
})
