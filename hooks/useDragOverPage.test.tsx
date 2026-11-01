import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react"
import { useDragOverPage } from "./useDragOverPage"

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

// Two boxes on the page, one inside the other, for a drag to cross.
function boxes() {
  const outer = document.createElement("div")
  const inner = document.createElement("div")
  outer.appendChild(inner)
  document.body.appendChild(outer)
  return { outer, inner }
}

describe("a drag over the page", () => {
  it("is on from the first element it enters until it leaves the last", () => {
    const { outer, inner } = boxes()
    const { result } = renderHook(() => useDragOverPage())
    expect(result.current).toBe(false)
    act(() => {
      fireEvent.dragEnter(outer)
    })
    expect(result.current).toBe(true)
    // Into the inner box: the new one is entered before the old one is left.
    act(() => {
      fireEvent.dragEnter(inner)
      fireEvent.dragLeave(outer)
    })
    expect(result.current).toBe(true)
    // Out of the window.
    act(() => {
      fireEvent.dragLeave(inner)
    })
    expect(result.current).toBe(false)
  })

  it("ends at once on a drop or a dragend, wherever it is", () => {
    const { outer, inner } = boxes()
    const { result } = renderHook(() => useDragOverPage())
    act(() => {
      fireEvent.dragEnter(outer)
      fireEvent.dragEnter(inner)
      fireEvent.drop(inner)
    })
    expect(result.current).toBe(false)
    // A drag from this page is on from its start, and ends with its dragend.
    act(() => {
      fireEvent.dragStart(inner)
    })
    expect(result.current).toBe(true)
    act(() => {
      fireEvent.dragEnd(inner)
    })
    expect(result.current).toBe(false)
  })

  it("never stays on for an element taken off the page mid-drag", () => {
    const { outer, inner } = boxes()
    const { result } = renderHook(() => useDragOverPage())
    act(() => {
      fireEvent.dragEnter(outer)
      fireEvent.dragEnter(inner)
    })
    // The inner box goes while the pointer is on it, so its dragleave can never reach the window.
    act(() => {
      inner.remove()
      fireEvent.dragLeave(outer)
    })
    expect(result.current).toBe(false)
  })

  it("hears a drag before anything on the page can stop it", () => {
    const { outer } = boxes()
    // The earliest a page's own handler can sit: the document, capturing.
    const stop = (e: Event) => e.stopPropagation()
    document.addEventListener("dragenter", stop, true)
    try {
      const { result } = renderHook(() => useDragOverPage())
      act(() => {
        fireEvent.dragEnter(outer)
      })
      expect(result.current).toBe(true)
    } finally {
      document.removeEventListener("dragenter", stop, true)
    }
  })
})
