import { describe, expect, it, vi } from "vitest"
import { whenSceneReady } from "./scene"

describe("whenSceneReady", () => {
  it("waits, frame by frame, until the scene has loaded, then calls once", () => {
    let loading = true
    const frames: (() => void)[] = []
    const onReady = vi.fn()
    whenSceneReady(() => loading, onReady, (cb) => frames.push(cb), () => {})
    expect(onReady).not.toHaveBeenCalled()
    frames.shift()!()
    expect(onReady).not.toHaveBeenCalled()
    loading = false
    frames.shift()!()
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(0)
  })
  it("calls at once when the scene is already loaded, and can be stopped", () => {
    const now = vi.fn()
    whenSceneReady(() => false, now, () => 0, () => {})
    expect(now).toHaveBeenCalledTimes(1)
    const frames: (() => void)[] = []
    const never = vi.fn()
    const stop = whenSceneReady(() => true, never, (cb) => frames.push(cb), () => {})
    stop()
    frames.forEach((f) => f())
    expect(never).not.toHaveBeenCalled()
  })
})
