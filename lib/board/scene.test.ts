import { describe, expect, it, vi } from "vitest"
import { sceneSignature, whenSceneReady } from "./scene"

describe("sceneSignature", () => {
  const scene = [
    { id: "a", version: 3, versionNonce: 11 },
    { id: "b", version: 1, versionNonce: 7 },
  ]
  it("is the same for the same scene, so a pan sends nothing", () => {
    expect(sceneSignature(scene)).toBe(sceneSignature(scene.map((e) => ({ ...e }))))
  })
  it("changes when an element changes, is deleted, or is added", () => {
    const base = sceneSignature(scene)
    expect(sceneSignature([{ ...scene[0], version: 4, versionNonce: 99 }, scene[1]])).not.toBe(base)
    expect(sceneSignature([...scene, { id: "c", version: 1, versionNonce: 1 }])).not.toBe(base)
    expect(sceneSignature([scene[0], { ...scene[1], version: 2, versionNonce: 5 }])).not.toBe(base)
  })
})

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
