import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

vi.mock("@/hooks/use-toast", () => {
  const toast = vi.fn()
  return { useToast: () => ({ toast }) }
})
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import { usePost } from "@/hooks/usePost"

describe("usePost identity", () => {
  // Nine call sites put this object in a dependency array. A fresh object literal
  // gives it a new identity every render, so those useCallbacks and useEffects
  // re-run every render, and any of them that sets state becomes an infinite
  // loop: render, new identity, effect, setState, render.
  //
  // That is what took the whole app down behind "Something went wrong" when the
  // GitHub link dialog opened. The dialog also guards its own setState now, but
  // that only fixes the dialog. This is the property the other eight rely on.
  it("is stable across renders that change nothing", () => {
    const { result, rerender } = renderHook(() => usePost())
    const first = result.current

    rerender()
    rerender()

    expect(result.current).toBe(first)
  })

  // makeRequest is what callers actually invoke, and it is listed in dependency
  // arrays on its own in some places.
  it("keeps makeRequest stable across renders", () => {
    const { result, rerender } = renderHook(() => usePost())
    const first = result.current.makeRequest

    rerender()

    expect(result.current.makeRequest).toBe(first)
  })
})
