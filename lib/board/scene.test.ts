import { describe, expect, it, vi } from "vitest"
import { movingByHand, sceneFinder, sceneSignature, selectedIn, whenSceneReady } from "./scene"

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

/** A scene that throws if anything reads it: proof a reader didn't walk it. */
function untouchable(): { id: string }[] {
  return new Proxy([] as { id: string }[], {
    get(t, k) {
      if (k === "length" || /^\d+$/.test(String(k)) || k === Symbol.iterator) throw new Error("the scene was walked")
      return Reflect.get(t, k)
    },
  })
}

describe("a selection, read from the scene (W-4)", () => {
  const scene = [{ id: "a" }, { id: "b", isDeleted: true }, { id: "c" }, { id: "d" }]

  it("is the selected live elements, in the scene's order", () => {
    expect(selectedIn(scene, ["d", "a", "b", "gone"]).map((e) => e.id)).toEqual(["a", "d"])
  })

  it("never walks the scene when nothing is selected, as on most changes", () => {
    expect(selectedIn(untouchable(), [])).toEqual([])
  })

  it("finds a few by a walk, and many through one index of the scene kept for that scene", () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}` }))
    const few = sceneFinder(big, 2)
    expect(few.get("e7")).toBe(big[7])
    expect(few.at("e49")).toBe(49)
    expect(few.at("nope")).toBe(-1)
    const many = sceneFinder(big, 20)
    expect(many.get("e31")).toBe(big[31])
    // Every reader of one scene shares its index.
    expect(sceneFinder(big, 20).index).toBe(many.index)
    expect(sceneFinder([...big], 20).index).not.toBe(many.index)
  })
})

describe("movingByHand", () => {
  it("reads Excalidraw's own marks of a move by hand: a drag, a resize, a turn", () => {
    expect([{ selectedElementsAreBeingDragged: true }, { isResizing: true }, { isRotating: true }].map(movingByHand)).toEqual([true, true, true])
    expect([{}, null, undefined, { selectedElementsAreBeingDragged: false }].map(movingByHand)).toEqual([false, false, false, false])
  })
})
