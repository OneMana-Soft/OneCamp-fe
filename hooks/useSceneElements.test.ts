import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSceneElements } from "./useSceneElements"

// A board's elements for a bar or a panel; a part shown only some of the time
// (the board's map) reads and listens to nothing while it's hidden.

function sceneOf(initial: readonly unknown[]) {
  let elements = initial
  const listeners = new Set<(els: readonly unknown[]) => void>()
  return {
    api: {
      getSceneElements: () => elements,
      onChange(listener: (els: readonly unknown[]) => void) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    },
    listening: () => listeners.size,
    change(next: readonly unknown[]) {
      elements = next
      act(() => listeners.forEach((l) => l(elements)))
    },
  }
}

describe("useSceneElements", () => {
  it("follows the scene while enabled, and neither reads nor listens while it isn't", () => {
    const scene = sceneOf([{ id: "a" }])
    const { result, rerender } = renderHook(({ on }) => useSceneElements(scene.api, on), { initialProps: { on: false } })
    expect(result.current).toEqual([])
    expect(scene.listening()).toBe(0)

    // Shown: what the scene holds now, then each change.
    scene.change([{ id: "a" }, { id: "b" }])
    rerender({ on: true })
    expect(result.current).toEqual([{ id: "a" }, { id: "b" }])
    expect(scene.listening()).toBe(1)
    scene.change([{ id: "c" }])
    expect(result.current).toEqual([{ id: "c" }])

    // Hidden again: none, and nothing listening.
    rerender({ on: false })
    expect(result.current).toEqual([])
    expect(scene.listening()).toBe(0)
  })

  it("is enabled by default, as every bar and panel reads it", () => {
    const scene = sceneOf([{ id: "a" }])
    const { result } = renderHook(() => useSceneElements(scene.api))
    expect(result.current).toEqual([{ id: "a" }])
    expect(scene.listening()).toBe(1)
  })
})
