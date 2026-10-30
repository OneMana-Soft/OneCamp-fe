import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useSceneReady } from "./useSceneReady"

// A board's drawing waits for Excalidraw's own scene, which would wipe it
// (lib/board/scene, whenSceneReady): the member's canvas and a guest's view
// read the same answer.
const loader = (state: { loading: boolean }) => ({ getAppState: () => ({ isLoading: state.loading }) })
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

describe("useSceneReady", () => {
  it("is ready once Excalidraw has loaded its own scene, not before", async () => {
    const state = { loading: true }
    const api = loader(state)
    const { result } = renderHook(() => useSceneReady(api))
    await frame()
    expect(result.current).toBe(false)
    state.loading = false
    await frame()
    expect(result.current).toBe(true)
  })

  it("is not ready without an api, nor for a new one (Excalidraw mounted again) until its own scene loads", async () => {
    const first = loader({ loading: false })
    const secondState = { loading: true }
    const second = loader(secondState)
    const { result, rerender } = renderHook(({ api }) => useSceneReady(api), { initialProps: { api: null as ReturnType<typeof loader> | null } })
    expect(result.current).toBe(false)
    rerender({ api: first })
    await frame()
    expect(result.current).toBe(true)
    rerender({ api: second })
    expect(result.current).toBe(false)
    secondState.loading = false
    await frame()
    expect(result.current).toBe(true)
  })
})
